## ADDED Requirements

### Requirement: Bank CSV format detection
The system SHALL detect the bank format from user selection (OCBC, DBS/POSB, UOB, Trust) before parsing, as each bank produces a distinct CSV structure.

#### Scenario: User selects bank before upload
- **WHEN** user initiates a CSV upload
- **THEN** the system SHALL require the user to select one of: OCBC, DBS/POSB, UOB, Trust before the file is accepted

### Requirement: OCBC CSV parsing
The system SHALL parse OCBC CSV exports with columns: `Transaction Date, Description, Withdrawals, Deposits, Balance`. Withdrawals and Deposits are separate positive-value columns.

#### Scenario: OCBC expense transaction
- **WHEN** an OCBC CSV row has a value in the Withdrawals column
- **THEN** the system SHALL record it as a negative amount (expense)

#### Scenario: OCBC income transaction
- **WHEN** an OCBC CSV row has a value in the Deposits column
- **THEN** the system SHALL record it as a positive amount (income)

### Requirement: DBS/POSB CSV parsing
The system SHALL parse DBS/POSB CSV exports with columns: `Date, Reference, Debit Amount, Credit Amount, Transaction Ref1, ...`. Date format is `DD MMM YYYY`.

#### Scenario: DBS debit transaction
- **WHEN** a DBS row has a value in the Debit Amount column
- **THEN** the system SHALL record it as a negative amount

#### Scenario: DBS credit transaction
- **WHEN** a DBS row has a value in the Credit Amount column
- **THEN** the system SHALL record it as a positive amount

### Requirement: UOB CSV parsing
The system SHALL parse UOB CSV exports with columns: `Account, Transaction Date, Description, Withdrawal, Deposit, Balance`. Date format is `DD/MM/YYYY`.

#### Scenario: UOB withdrawal
- **WHEN** a UOB row has a value in the Withdrawal column
- **THEN** the system SHALL record it as a negative amount

#### Scenario: UOB deposit
- **WHEN** a UOB row has a value in the Deposit column
- **THEN** the system SHALL record it as a positive amount

### Requirement: Trust CSV parsing
The system SHALL parse Trust CSV exports with columns: `Date, Description, Amount`. Date format is ISO `YYYY-MM-DD`. Amount is signed (negative = expense).

#### Scenario: Trust signed amount
- **WHEN** a Trust CSV row has a negative Amount value
- **THEN** the system SHALL record it as an expense as-is

### Requirement: Normalized transaction format
After parsing, the system SHALL normalize all transactions into a unified internal format regardless of source bank: `{ date, description, amount, bank }` where amount is always a signed decimal (negative = expense, positive = income).

#### Scenario: Normalization output
- **WHEN** any bank CSV is parsed successfully
- **THEN** every resulting transaction SHALL have a non-null date, non-empty description, signed numeric amount, and a bank identifier

### Requirement: Upload preview before confirmation
The system SHALL display a preview of parsed transactions before committing them to the database, showing total count, date range, and total amount.

#### Scenario: Preview shown before import
- **WHEN** a CSV is parsed successfully
- **THEN** the system SHALL show a preview with transaction count, date range, and net amount before the user confirms import

### Requirement: Duplicate transaction detection
The system SHALL detect and skip duplicate transactions on upload using a hash of `date + description + amount + bank`.

#### Scenario: Re-uploading same CSV
- **WHEN** a CSV is uploaded that contains transactions already in the database
- **THEN** the system SHALL skip duplicates and report how many were skipped vs imported

#### Scenario: No duplicates on first upload
- **WHEN** a CSV is uploaded with no matching transactions in the database
- **THEN** all transactions SHALL be imported with zero skipped
