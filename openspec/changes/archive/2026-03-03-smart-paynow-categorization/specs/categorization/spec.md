## MODIFIED Requirements

### Requirement: Categorise uses structured PayNow fields
The `categorize()` function in `lib/categorize.ts` SHALL call `parsePayNowDescription()` before sending anything to Claude, and SHALL construct a richer prompt using the extracted `memo`, `recipient`, and `method` fields rather than the raw description string.

#### Scenario: Memo present — memo is primary signal to Claude
- **WHEN** `parsePayNowDescription()` returns a non-empty `memo`
- **THEN** the Claude prompt SHALL lead with the memo text as the primary categorisation signal, with recipient and method as secondary context

#### Scenario: No memo, QR/UEN method — merchant name is primary signal
- **WHEN** memo is empty and method is `PayNow-QR` or `PayNow-UEN`
- **THEN** the Claude prompt SHALL use the `recipient` (merchant name) as the primary signal

#### Scenario: No memo, Mobile method — hint Personal to Claude
- **WHEN** memo is empty and method is `PayNow-Mobile`
- **THEN** the Claude prompt SHALL include a hint that the recipient appears to be a person and `Personal` may be appropriate, while still allowing Claude to override

#### Scenario: Non-PayNow description — fallback to raw string
- **WHEN** `parsePayNowDescription()` returns all empty fields
- **THEN** `categorize()` SHALL fall back to sending the raw description to Claude as before

### Requirement: Rule keyword uses memo or merchant name
After Claude returns a category, the keyword saved to `category_rules` SHALL be derived from the memo (if present) or the recipient/merchant name — never from reference codes or payment prefixes.

#### Scenario: Memo-based rule saved
- **WHEN** memo is `"rent for feb"` and Claude returns `Bills & Utilities`
- **THEN** the rule saved SHALL be `"rent" → "Bills & Utilities"` (first meaningful word or short phrase from memo)

#### Scenario: Merchant-based rule saved
- **WHEN** memo is empty and recipient is `"EVERGREEN GLOBAL"`
- **THEN** the rule saved SHALL be `"evergreen global" → [category]`

#### Scenario: Human name rule not saved
- **WHEN** memo is empty and recipient is a short human name like `"Thiri"` or `"Kt"`
- **THEN** no rule SHALL be saved (names are too personal and ambiguous to generalise)

#### Scenario: Existing rule match skips Claude
- **WHEN** a saved rule keyword matches the memo or merchant name of a new transaction
- **THEN** `categorize()` SHALL return the rule's category without calling Claude
