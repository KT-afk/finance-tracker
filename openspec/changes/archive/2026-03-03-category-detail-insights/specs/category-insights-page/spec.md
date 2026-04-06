## ADDED Requirements

### Requirement: Category detail page
The system SHALL render a `/insights/[category]` page that displays per-category analytics fetched from `/api/insights/[category]`.

#### Scenario: Page loads with data
- **WHEN** a user navigates to `/insights/Food%20%26%20Drink`
- **THEN** the page SHALL display the category name as a heading, a 6-month trend line chart, stat cards showing total count and average spend, a top merchants list, and a transaction list (up to 50 entries)

#### Scenario: Page empty state
- **WHEN** a user navigates to a category page with no transactions
- **THEN** the page SHALL display an empty state message instead of charts and lists

#### Scenario: Loading state
- **WHEN** the page is fetching data
- **THEN** a loading indicator SHALL be shown

### Requirement: Back navigation
The category detail page SHALL include a back link to `/insights`.

#### Scenario: Back link visible
- **WHEN** the category detail page renders
- **THEN** a back link labeled "Insights" or "← Back" SHALL be visible and SHALL navigate to `/insights`

### Requirement: MoM table rows are clickable
Each row in the month-over-month comparison table on `/insights` SHALL be a navigable link to the corresponding category detail page.

#### Scenario: Clicking a MoM table row
- **WHEN** a user clicks a row in the MoM comparison table
- **THEN** the browser SHALL navigate to `/insights/[encodedCategory]`

### Requirement: Trend chart bars are clickable
Each bar segment in the 6-month stacked bar chart on `/insights` SHALL respond to click events and navigate to the corresponding category detail page.

#### Scenario: Clicking a chart bar segment
- **WHEN** a user clicks a colored bar segment in the trend chart
- **THEN** the browser SHALL navigate to `/insights/[encodedCategory]` for the clicked category

### Requirement: Trend line chart on detail page
The category detail page SHALL show a Recharts `LineChart` with a single line representing monthly spend for the selected category over the last 6 months.

#### Scenario: Trend line renders correctly
- **WHEN** the category has spend data in multiple months
- **THEN** the line chart SHALL display one data point per month with the Y-axis formatted as SGD currency and X-axis showing abbreviated month names

### Requirement: Top merchants list
The category detail page SHALL display up to 5 top merchants/payees ranked by total spend.

#### Scenario: Merchants rendered
- **WHEN** `topMerchants` contains entries
- **THEN** each entry SHALL show the description (truncated if long) and total spend formatted as SGD, in descending order

### Requirement: Recent transactions list
The category detail page SHALL display up to 50 most recent transactions for the category, showing date, description, and amount.

#### Scenario: Transaction list rendered
- **WHEN** `recentTransactions` contains entries
- **THEN** each row SHALL show the transaction date, description (truncated), and absolute amount formatted as SGD
