## Context

Singapore bank CSV exports describe PayNow/FAST/NETS transactions as unstructured strings that embed the payment method, reference code, user-written memo, and recipient name all in one field. The current `categorize()` function passes this raw string directly to Claude Haiku, which anchors on the payment verb ("FUND TRANSFER", "FAST PAYMENT") and almost always returns "Transfer" — ignoring the actual merchant or memo.

The four PayNow description patterns seen in production data:

```
FUND TRANSFER OTHR - [REF] via PayNow-QR Code to [MERCHANT]
FUND TRANSFER OTHR - [REF] to [MERCHANT] via PayNow-QR Code
FAST PAYMENT OTHR-[MEMO] to [RECIPIENT] via PayNow-[METHOD]
FAST PAYMENT OTHR-[MEMO] via PayNow-[METHOD] to [RECIPIENT]
NETS QR [MERCHANT] [LOC_CODE] NETS QR PURCHASE
IBG GIRO [REF] [PARTIAL_MERCHANT]COLL [REF]
```

Method encodes intent:
- `PayNow-Mobile` → recipient is a human name → likely Personal
- `PayNow-QR` → recipient is a business → likely a spending category
- `PayNow-UEN` → recipient is a registered business UEN → likely a spending category

## Goals / Non-Goals

**Goals:**
- Extract `memo`, `recipient`, `method` from raw description before categorisation
- Memo wins over recipient type when present (user discipline is rewarded)
- Send structured fields to Claude for better reasoning
- Save memo/merchant keywords as rules, not reference codes
- Add `Personal` category for person-to-person PayNow-Mobile payments
- Backfill existing Transfer/Others transactions with re-categorisation

**Non-Goals:**
- No external API lookups (ACRA, Google Places) — too complex for v1
- No changes to CSV parsers (description comes in as-is from the bank)
- No UEN → business name resolution
- No UI changes beyond adding Personal to dropdowns and color map

## Decisions

### 1. PayNow parser as a separate module
Extract parsing into `lib/parsers/paynow.ts` returning a `PayNowFields` struct. `categorize()` calls this parser first, then uses the structured output. Keeps concerns separated — parser is testable independently.

**Alternative:** Inline regex in `categorize()`. Rejected — harder to test, harder to extend.

### 2. Memo wins over method
If memo is present and meaningful (length ≥ 3, not a reference code), it is the primary signal sent to Claude. Method (Mobile vs QR) is a secondary prior.

```
memo="rent for feb", recipient="CHEW NGENG HIANG", method=Mobile
→ Claude sees: memo "rent for feb" → Bills & Utilities  ✓
  (not: recipient is a person → Personal)
```

**Rationale:** The user explicitly stated they will write clear memos as a discipline. The system should reward that.

### 3. Rule keyword = memo or merchant name, not ref code
After Claude categorises:
- If memo is present and ≥ 3 chars → save memo as keyword
- Else save recipient/merchant name as keyword

```
Before: keyword = "fund transfer othr" (useless)
After:  keyword = "rent" or "evergreen global" (reusable)
```

### 4. Personal category — detection heuristic
`PayNow-Mobile` + no meaningful memo + recipient looks like a human name (no "PTE", "LTD", "SDN", "STUDIO", common business suffixes) → suggest `Personal` to Claude as the prior.

Claude still makes the final call — this is a hint in the prompt, not hard-coded assignment.

### 5. Backfill strategy
A Node.js script (`scripts/recategorize-backfill.ts`) queries all transactions where `category IN ('Transfer', 'Others')` and `is_corrected = 0` (never manually fixed), re-runs `categorize()` on each, and updates the DB. Manually corrected transactions (`is_corrected = 1`) are never touched.

**Rate limiting:** Script processes transactions sequentially with a small delay to avoid Claude API rate limits.

### 6. No migration needed
`category` is a plain `text` column. Adding `Personal` to the TypeScript enum is sufficient — no SQL ALTER TABLE required.

## Risks / Trade-offs

- **Claude may still miscategorise ambiguous names** → User can still correct via the transactions page; corrections are saved as rules and won't be re-processed by backfill
- **Memo parsing regex may miss edge cases** → Fallback to raw description if no pattern matches; behaviour degrades gracefully to current state
- **Backfill calls Claude for each transaction** → ~47 transactions at current data volume, negligible cost; future uploads are handled at import time
- **`Personal` colour choice** → Needs a visually distinct color added to `CATEGORY_COLORS` in `lib/display.ts`

## Migration Plan

1. Add `Personal` to enum in `lib/schema.ts` and color in `lib/display.ts`
2. Deploy parser + updated `categorize()` — new uploads immediately benefit
3. Run backfill script once: `npx tsx scripts/recategorize-backfill.ts`
4. Verify results in the transactions page; manually correct any remaining outliers
