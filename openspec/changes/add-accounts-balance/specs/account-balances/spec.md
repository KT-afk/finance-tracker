## ADDED Requirements

### Requirement: Balance history storage
The system SHALL store balance entries in a `balance_history` table with columns: `id` (INTEGER PK autoincrement), `bank` (TEXT, one of ocbc/dbs/uob/trust), `balance` (REAL), `recorded_at` (TEXT, ISO timestamp). Each balance update creates a new row.

#### Scenario: User updates a bank balance
- **WHEN** a user submits a new balance for a bank
- **THEN** the system inserts a new row into `balance_history` with the bank, balance amount, and current timestamp

#### Scenario: Multiple updates for same bank
- **WHEN** a user updates the same bank's balance multiple times
- **THEN** each update creates a separate row, preserving full history

### Requirement: Current balance derivation
The system SHALL derive the current balance for each bank by selecting the most recent `balance_history` row per bank (ordered by `recorded_at` DESC, LIMIT 1).

#### Scenario: Bank has balance entries
- **WHEN** a bank has one or more balance entries
- **THEN** the system returns the balance from the row with the latest `recorded_at`

#### Scenario: Bank has no balance entries
- **WHEN** a bank has no entries in `balance_history`
- **THEN** the system returns null/no balance for that bank

### Requirement: Total balance aggregation
The system SHALL compute the total balance by summing the current balance of all banks that have at least one entry.

#### Scenario: All banks have balances
- **WHEN** all 4 banks have balance entries
- **THEN** the total is the sum of the latest balance for each bank

#### Scenario: Some banks have no balances
- **WHEN** only 2 of 4 banks have entries
- **THEN** the total is the sum of those 2 banks only

### Requirement: Balance API endpoints
The system SHALL expose the following API endpoints:
- `GET /api/balances` — returns current balance per bank + total + last updated timestamp per bank
- `POST /api/balances` — accepts `{ bank, balance }` and creates a new balance_history row
- `GET /api/balances/history` — returns 6 months of monthly net worth data for the trend chart

#### Scenario: GET current balances
- **WHEN** a GET request is made to `/api/balances`
- **THEN** the response contains an array of `{ bank, balance, recorded_at }` for each bank with data, plus a `total` field

#### Scenario: POST new balance
- **WHEN** a POST request is made with `{ bank: "ocbc", balance: 12450.00 }`
- **THEN** a new row is inserted and the response confirms success

#### Scenario: GET balance history for trend
- **WHEN** a GET request is made to `/api/balances/history`
- **THEN** the response contains monthly totals for the last 6 months, carrying forward the last known balance for months with no updates
