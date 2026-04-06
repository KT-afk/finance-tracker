## ADDED Requirements

### Requirement: Current month summary card
The home screen SHALL display the total amount spent in the current calendar month and the number of days elapsed in the month.

#### Scenario: Summary reflects current month
- **WHEN** the user opens the home screen
- **THEN** the system SHALL display total spend for the current calendar month (expenses only, negative amounts)

### Requirement: Top categories with progress bars
The home screen SHALL display the top spending categories for the current month, each with an amount and a visual progress bar relative to the highest-spend category.

#### Scenario: Categories ranked by spend
- **WHEN** the home screen loads
- **THEN** categories SHALL be sorted by total spend descending, showing at minimum the top 5

#### Scenario: Income excluded from category bars
- **WHEN** calculating category spend for the home screen
- **THEN** transactions categorized as Income SHALL be excluded

### Requirement: Recent transactions list
The home screen SHALL display the 5 most recent transactions with description, amount, category, and relative date (e.g. "today", "yesterday", "3 days ago").

#### Scenario: Most recent shown first
- **WHEN** the home screen loads
- **THEN** the 5 most recent transactions by date SHALL be listed, most recent first

### Requirement: Per-bank toggle
The home screen SHALL allow the user to filter the view by a specific bank or show all banks combined.

#### Scenario: Filter by bank
- **WHEN** the user selects a specific bank (e.g. OCBC)
- **THEN** all home screen figures SHALL reflect only transactions from that bank

#### Scenario: All banks combined
- **WHEN** no bank filter is active
- **THEN** all home screen figures SHALL reflect transactions across all banks
