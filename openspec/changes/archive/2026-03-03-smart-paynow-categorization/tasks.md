## 1. Schema & Display — Personal Category

- [x] 1.1 Add `'Personal'` to the `CATEGORIES` array in `lib/schema.ts` (after `'Transfer'`, before `'Income'`)
- [x] 1.2 Add a color for `Personal` in `CATEGORY_COLORS` in `lib/display.ts` (use `#A78BFA` — soft violet, distinct from all existing colors)

## 2. PayNow Description Parser

- [x] 2.1 Create `lib/parsers/paynow.ts` exporting a `PayNowFields` interface with `memo: string`, `recipient: string`, `method: string`
- [x] 2.2 Implement regex for `FUND TRANSFER OTHR - [REF] via PayNow-[METHOD] to [MERCHANT]` (both field orderings)
- [x] 2.3 Implement regex for `FAST PAYMENT OTHR-[MEMO] to [RECIPIENT] via PayNow-[METHOD]` (both field orderings)
- [x] 2.4 Implement regex for `NETS QR [MERCHANT] [LOC_CODE] NETS QR PURCHASE` — extract merchant name between "NETS QR" and the next "NETS QR"
- [x] 2.5 Implement regex for `IBG GIRO [REF] [PARTIAL_MERCHANT]COLL [REF]` — extract partial merchant name
- [x] 2.6 Implement memo cleaning: treat `OTHR`, pure numeric strings, and long alphanumeric reference codes (≥8 chars, no spaces) as empty memo
- [x] 2.7 Return `{ memo: "", recipient: "", method: "" }` as fallback when no pattern matches

## 3. Smarter Categorize()

- [x] 3.1 In `lib/categorize.ts`, import `parsePayNowDescription` from `lib/parsers/paynow.ts`
- [x] 3.2 At the start of `categorize()`, call `parsePayNowDescription(description)` to get structured fields
- [x] 3.3 Update rule lookup: check rules against `memo` first, then `recipient`, then fall back to raw `description`
- [x] 3.4 Build a structured Claude prompt: if memo present → lead with memo; if no memo + QR/UEN → lead with merchant name; if no memo + Mobile → hint Personal as prior
- [x] 3.5 Update keyword extraction after Claude responds: if memo ≥ 3 chars → save first 1–3 meaningful words of memo as keyword; else if recipient is a business name (contains PTE, LTD, SDN, STUDIO, or is all-caps ≥ 2 words) → save recipient as keyword; else save nothing (human names not generalised)

## 4. Backfill Script

- [x] 4.1 Create `scripts/recategorize-backfill.ts` that opens the SQLite DB directly via better-sqlite3
- [x] 4.2 Query all transactions where `category IN ('Transfer', 'Others')` and `is_corrected = 0`
- [x] 4.3 For each transaction, call `categorize(description)` and update `category` in the DB if the result differs
- [x] 4.4 Print each processed transaction: `[old] → [new]  description` to stdout
- [x] 4.5 Print a final summary: total processed, total changed, total skipped (already correct / is_corrected)
- [x] 4.6 Add a small sequential delay (100ms) between Claude API calls to avoid rate limiting

## 5. Verification

- [x] 5.1 Run `npm run build` — confirm zero type errors, all routes compile, Personal appears in schema
- [x] 5.2 Run `npx tsx scripts/recategorize-backfill.ts` — confirm it runs, prints progress, and exits cleanly
- [ ] 5.3 Check the transactions page — verify EVERGREEN GLOBAL transactions are now Groceries (or similar), rent transactions are Bills & Utilities, Thiri/Kt are Personal
- [ ] 5.4 Upload a new CSV and verify new PayNow transactions are categorised using structured fields (not dumped into Transfer/Others)
