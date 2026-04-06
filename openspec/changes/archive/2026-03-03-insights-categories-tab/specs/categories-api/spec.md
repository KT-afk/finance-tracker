## NEW Requirements

### Requirement: Categories breakdown API
The system SHALL provide `GET /api/categories` that returns per-category spending totals for a given time period and optional bank filter.

#### Scenario: This month, all banks
- **WHEN** request is `GET /api/categories?period=this_month&bank=all`
- **THEN** response SHALL include an `items` array with one entry per category that has expenses in the current calendar month, each with `category`, `total` (sum of absolute amounts, rounded to 2dp), `count` (integer), and `pct` (percentage of grand total, rounded to 1dp)
- **AND** response SHALL include `grandTotal` (sum of all expense totals for the period)

#### Scenario: Last month, single bank
- **WHEN** request is `GET /api/categories?period=last_month&bank=ocbc`
- **THEN** response SHALL filter transactions to only those with `bank = 'ocbc'` and dates within the previous calendar month

#### Scenario: Period values
- `this_month` → current calendar month (day 1 to today)
- `last_month` → previous full calendar month
- `2_months_ago` → two calendar months ago (full month)
- `3_months_ago` → three calendar months ago (full month)
- `all_time` → all dates

#### Scenario: Income and Transfer excluded
- **WHEN** computing category totals
- **THEN** transactions with `amount > 0` (income) SHALL be excluded
- **AND** transactions with `category = 'Transfer'` SHALL be excluded from the chart/list (but NOT from the raw query — they may be used for context)

#### Scenario: Empty period
- **WHEN** no transactions exist for the selected period + bank
- **THEN** response SHALL return `{ items: [], grandTotal: 0 }`

#### Scenario: Missing or invalid period parameter
- **WHEN** period parameter is missing or not one of the 5 valid values
- **THEN** response SHALL default to `this_month`
