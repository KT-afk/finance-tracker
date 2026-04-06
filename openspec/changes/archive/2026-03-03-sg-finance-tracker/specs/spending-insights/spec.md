## ADDED Requirements

### Requirement: Month-over-month comparison
The insights screen SHALL display a comparison of total spend per category between the current month and the previous month, showing absolute and percentage change.

#### Scenario: Month-over-month delta shown
- **WHEN** the user views the insights screen
- **THEN** each category SHALL show current month spend, previous month spend, and the delta (e.g. "+23% on Food & Drink")

### Requirement: Category trend chart
The insights screen SHALL display a bar or line chart showing spend per category over the last 3–6 months.

#### Scenario: Multi-month trend visible
- **WHEN** the user views the insights screen
- **THEN** a chart SHALL show monthly totals per category for the last 3–6 months of available data

#### Scenario: Insufficient data handled gracefully
- **WHEN** fewer than 2 months of data exist
- **THEN** the system SHALL show available data without error and indicate that more data is needed for trends

### Requirement: Biggest transactions
The insights screen SHALL display the top 5 largest individual expense transactions for the current month.

#### Scenario: Largest expenses listed
- **WHEN** the user views the insights screen
- **THEN** the 5 transactions with the largest absolute expense amount for the current month SHALL be listed

### Requirement: Per-bank insights filter
The insights screen SHALL allow filtering all insight figures by a specific bank or all banks combined, consistent with the home dashboard behaviour.

#### Scenario: Bank filter on insights
- **WHEN** the user selects a bank on the insights screen
- **THEN** all charts and figures SHALL reflect only that bank's transactions
