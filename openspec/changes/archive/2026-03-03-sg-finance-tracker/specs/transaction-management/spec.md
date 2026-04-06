## ADDED Requirements

### Requirement: Full transaction list
The transactions screen SHALL display all transactions in reverse chronological order with columns: date, description, amount, bank, category.

#### Scenario: All transactions visible
- **WHEN** the user navigates to the transactions screen
- **THEN** all transactions SHALL be listed, most recent first

### Requirement: Filter by month
The user SHALL be able to filter the transaction list to a specific month/year.

#### Scenario: Month filter applied
- **WHEN** the user selects a month/year
- **THEN** only transactions within that month SHALL be displayed

### Requirement: Filter by category
The user SHALL be able to filter the transaction list to a specific category.

#### Scenario: Category filter applied
- **WHEN** the user selects a category
- **THEN** only transactions with that category SHALL be displayed

#### Scenario: Filters combinable
- **WHEN** the user applies both a month and category filter
- **THEN** only transactions matching both SHALL be displayed

### Requirement: Filter by bank
The user SHALL be able to filter the transaction list to a specific bank.

#### Scenario: Bank filter applied
- **WHEN** the user selects a bank
- **THEN** only transactions from that bank SHALL be displayed

### Requirement: Inline category correction
The user SHALL be able to change the category of any transaction directly from the transaction list without navigating away.

#### Scenario: Category corrected inline
- **WHEN** the user selects a new category for a transaction
- **THEN** the transaction's category SHALL update immediately in the list and a keyword rule SHALL be saved
