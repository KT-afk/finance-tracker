## Why

Singapore PayNow and FAST transactions embed the merchant name and user-written memo inside a raw bank description string. The current categoriser anchors on the payment verb ("FUND TRANSFER", "FAST PAYMENT") rather than the actual payee or memo, causing nearly all PayNow spend — mama shops, hair salons, rent, food — to be dumped into "Transfer" or "Others". The category taxonomy also lacks a "Personal" category to distinguish genuine person-to-person payments from vendor payments, making spending analysis meaningless for the majority of transactions.

The user writes meaningful memos ("rent for feb", "groceries run") into PayNow transfers and wants the system to learn from them over time — so corrections become rarer the longer the app is used.

## What Changes

- Add `Personal` as a new category to the CATEGORIES enum for person-to-person PayNow-Mobile payments
- Add a PayNow/FAST/NETS description parser that extracts `memo`, `recipient`, and `method` from raw bank description strings before categorisation
- Update `categorize()` to pass structured fields (memo, recipient, method, amount) to Claude instead of the raw description string
- Update rule saving to use the memo or merchant name as the keyword — not the reference code prefix
- Add a one-time backfill script to re-categorise all existing transactions currently stuck in Transfer or Others

## Capabilities

### New Capabilities

- `paynow-parser`: Structured extraction of `memo`, `recipient`, and `method` from Singapore PayNow/FAST/NETS/IBG description strings
- `personal-category`: New `Personal` category in the enum and UI, covering person-to-person PayNow-Mobile payments

### Modified Capabilities

- `categorization`: Categorise() now receives structured fields and sends a richer prompt to Claude; rule saving uses memo/merchant keywords; memo wins over recipient type when both are present
- `backfill`: One-time script to re-run categorisation on all transactions currently categorised as Transfer or Others

## Impact

- `lib/schema.ts` — add `Personal` to CATEGORIES enum
- `lib/display.ts` — add color for `Personal`
- `lib/parsers/paynow.ts` — new file: PayNow/FAST/NETS/IBG description parser
- `lib/categorize.ts` — use structured fields from parser, richer Claude prompt, smarter keyword extraction
- `scripts/recategorize-backfill.ts` — new one-time script
- Existing transactions in DB will have stale categories until backfill is run
- No DB schema migration needed (category column is plain text)
