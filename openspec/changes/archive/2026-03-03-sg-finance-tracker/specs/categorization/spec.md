## ADDED Requirements

### Requirement: Fixed category list
The system SHALL categorize all transactions into a fixed set of categories appropriate for Singapore spending: Food & Drink, Groceries, Transport, Shopping, Subscriptions, Health, Entertainment, Bills & Utilities, Transfer, Income, Others.

#### Scenario: Every transaction has a category
- **WHEN** a transaction is imported
- **THEN** it SHALL be assigned exactly one category from the fixed list

### Requirement: Keyword rules engine
The system SHALL maintain a keyword rules table. When a transaction description contains a keyword (case-insensitive), the system SHALL assign the corresponding category without calling the Claude API.

#### Scenario: Known merchant matched by rule
- **WHEN** a transaction description contains a saved keyword (e.g. "GRABFOOD")
- **THEN** the system SHALL assign the mapped category instantly without an API call

#### Scenario: Rules checked before API
- **WHEN** a transaction is being categorized
- **THEN** keyword rules SHALL be evaluated before any Claude API call is attempted

### Requirement: Claude Haiku fallback for unknown merchants
The system SHALL call the Claude Haiku API for transactions that do not match any keyword rule. The prompt SHALL include the fixed category list and the raw transaction description. The system SHALL use only the returned category name.

#### Scenario: Unknown merchant sent to Claude
- **WHEN** a transaction matches no keyword rule
- **THEN** the system SHALL send the description to Claude Haiku and assign the returned category

#### Scenario: Claude returns valid category
- **WHEN** Claude responds with a category name from the fixed list
- **THEN** the system SHALL assign that category to the transaction

#### Scenario: Claude returns invalid category
- **WHEN** Claude responds with a value not in the fixed category list
- **THEN** the system SHALL fall back to "Others"

### Requirement: Auto-save rule after Claude categorization
After Claude categorizes a transaction, the system SHALL automatically save a keyword rule derived from the most distinctive token in the description so the same merchant is not sent to Claude again.

#### Scenario: Rule saved after Claude call
- **WHEN** Claude successfully categorizes a transaction
- **THEN** a new keyword rule SHALL be saved mapping a keyword from the description to the assigned category

### Requirement: User category correction
The user SHALL be able to correct the category of any transaction. The correction SHALL update the transaction and save a new keyword rule for future imports.

#### Scenario: User corrects a category
- **WHEN** the user selects a different category for a transaction
- **THEN** the transaction's category SHALL be updated and a keyword rule SHALL be saved for that description

#### Scenario: Correction applies to future imports
- **WHEN** a future CSV import contains a transaction matching the saved rule keyword
- **THEN** the corrected category SHALL be applied automatically without a Claude call
