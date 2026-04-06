## ADDED Requirements

### Requirement: SQLite local database
The system SHALL store all data in a single SQLite file (`finance.db`) at the project root. No external database service SHALL be required.

#### Scenario: Database file created on first run
- **WHEN** the application starts for the first time
- **THEN** `finance.db` SHALL be created automatically if it does not exist

### Requirement: Transactions table
The system SHALL maintain a `transactions` table with fields: `id` (uuid), `date` (date), `description` (text), `amount` (decimal), `bank` (enum: ocbc|dbs|uob|trust), `category` (text), `is_corrected` (boolean), `hash` (text unique), `uploaded_at` (timestamp).

#### Scenario: Transaction persisted after import
- **WHEN** a CSV upload is confirmed
- **THEN** each new transaction SHALL be inserted into the transactions table with all fields populated

#### Scenario: Hash uniqueness enforced
- **WHEN** an import attempts to insert a transaction whose hash already exists
- **THEN** the insert SHALL be skipped (no error, no duplicate)

### Requirement: Category rules table
The system SHALL maintain a `category_rules` table with fields: `id` (uuid), `keyword` (text, unique), `category` (text), `created_at` (timestamp).

#### Scenario: Rule persisted
- **WHEN** a new keyword rule is created (via correction or Claude auto-save)
- **THEN** it SHALL be inserted into category_rules and be available for the next import

#### Scenario: Duplicate keyword upserted
- **WHEN** a rule is saved for a keyword that already exists
- **THEN** the existing rule's category SHALL be updated rather than creating a duplicate
