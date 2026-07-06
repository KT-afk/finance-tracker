## ADDED Requirements

### Requirement: Category insights API returns monthly spend breakdown
The `/api/insights/[category]` endpoint SHALL return a `monthlySpend` array containing one entry per month for the last 6 months, each with `month` (YYYY-MM), `label` (e.g. "Jun"), and `amount` (total spend as a positive number). Months with no transactions SHALL be included with `amount: 0`.

#### Scenario: Category has transactions across multiple months
- **WHEN** the API is called for a category with transactions in multiple months
- **THEN** the response includes a `monthlySpend` array with one entry per month covering the last 6 months, amounts matching that month's total spend

#### Scenario: Category has no transactions in a given month
- **WHEN** the API is called for a category and a month within the last 6 has no transactions
- **THEN** that month is still included in `monthlySpend` with `amount: 0`

### Requirement: Category page shows monthly spend bar chart
The category insights page SHALL replace the "Avg spend" stat card with a bar chart showing the last 6 months of spend for that category.

#### Scenario: User views a category with spend history
- **WHEN** a user navigates to `/insights/[category]`
- **THEN** they see a bar chart with up to 6 bars, each labelled with the short month name, heights proportional to spend amount

#### Scenario: User views a category with sparse data
- **WHEN** a category has spend in only 2 of the last 6 months
- **THEN** the chart shows 6 bars, with 0-height bars for months with no spend

### Requirement: Monthly average shown as secondary context
The category page SHALL display the average monthly spend (total ÷ months with spend) as a small secondary label beneath or alongside the chart, formatted as "avg $X/mo".

#### Scenario: Average is computed only over months with spend
- **WHEN** a category has spend in 3 of 6 months
- **THEN** the avg label shows total ÷ 3, not total ÷ 6
