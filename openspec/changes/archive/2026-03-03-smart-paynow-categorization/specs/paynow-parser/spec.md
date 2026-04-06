## ADDED Requirements

### Requirement: Parse PayNow/FAST description into structured fields
The system SHALL provide a `parsePayNowDescription(description: string)` function in `lib/parsers/paynow.ts` that returns a `PayNowFields` object containing `memo`, `recipient`, and `method` extracted from raw bank description strings.

#### Scenario: FUND TRANSFER with QR to merchant
- **WHEN** description is `"FUND TRANSFER OTHR - 123 via PayNow-QR Code to EVERGREEN GLOBAL"`
- **THEN** result SHALL be `{ memo: "", recipient: "EVERGREEN GLOBAL", method: "PayNow-QR" }`

#### Scenario: FAST PAYMENT with memo to person via Mobile
- **WHEN** description is `"FAST PAYMENT OTHR-rent for feb to CHEW NGENG HIANG via PayNow-Mobile"`
- **THEN** result SHALL be `{ memo: "rent for feb", recipient: "CHEW NGENG HIANG", method: "PayNow-Mobile" }`

#### Scenario: FAST PAYMENT with memo (older format, method before recipient)
- **WHEN** description is `"FAST PAYMENT OTHR-OTHR via PayNow-Mobile to Thiri"`
- **THEN** result SHALL be `{ memo: "", recipient: "Thiri", method: "PayNow-Mobile" }`

#### Scenario: NETS QR purchase
- **WHEN** description is `"NETS QR KING KONG CURRY NETS QR PURCHASE 69529901"`
- **THEN** result SHALL be `{ memo: "", recipient: "KING KONG CURRY", method: "NETS-QR" }`

#### Scenario: IBG GIRO payment
- **WHEN** description is `"IBG GIRO 100046927378 Singapore TelecommuCOLL 100912530"`
- **THEN** result SHALL be `{ memo: "", recipient: "Singapore Telecommu", method: "GIRO" }`

#### Scenario: Non-PayNow description
- **WHEN** description does not match any known pattern
- **THEN** result SHALL be `{ memo: "", recipient: "", method: "" }` (empty fields, graceful fallback)

### Requirement: Memo field strips reference codes
The parser SHALL treat the OTHR-[VALUE] memo segment as empty if [VALUE] is a known placeholder (`OTHR`, a long alphanumeric reference, or a pure number) and SHALL treat it as a meaningful memo only when it contains human-readable words.

#### Scenario: OTHR placeholder treated as empty memo
- **WHEN** memo segment is `"OTHR"` or `"2000009271526037"` or `"QL0kSl11BTI30000004CGX"`
- **THEN** `memo` field SHALL be `""`

#### Scenario: Human memo preserved
- **WHEN** memo segment is `"rent for feb"` or `"groceries run"` or `"LAO WANG CHICKEN RICE"`
- **THEN** `memo` field SHALL be `"rent for feb"` / `"groceries run"` / `"LAO WANG CHICKEN RICE"` respectively
