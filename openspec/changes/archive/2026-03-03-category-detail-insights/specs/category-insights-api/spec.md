## ADDED Requirements

### Requirement: Category detail API endpoint
The system SHALL expose a `GET /api/insights/[category]` route that accepts a URL-encoded category name as a dynamic segment and returns per-category analytics.

#### Scenario: Valid category with data
- **WHEN** a GET request is made to `/api/insights/Food%20%26%20Drink`
- **THEN** the response SHALL contain `trend` (array of 6 monthly totals), `topMerchants` (top 5 descriptions by total spend), `count` (total transaction count for the category), `average` (mean absolute amount), and `recentTransactions` (up to 50 most recent, sorted newest first)

#### Scenario: Valid category with no transactions
- **WHEN** a GET request is made for a valid category that has no transactions
- **THEN** the response SHALL return `trend` as 6 zero-value months, `topMerchants` as an empty array, `count` as 0, `average` as 0, and `recentTransactions` as an empty array

#### Scenario: Invalid or unknown category
- **WHEN** a GET request is made with a category name not in the CATEGORIES enum
- **THEN** the response SHALL return HTTP 400 with an `error` field

### Requirement: 6-month trend data
The API SHALL return monthly spend totals for the category for each of the last 6 calendar months (including the current partial month), ordered oldest to newest.

#### Scenario: Trend data shape
- **WHEN** the API responds successfully
- **THEN** `trend` SHALL be an array of 6 objects each with `month` (YYYY-MM string) and `total` (number, rounded to 2 decimal places)

### Requirement: Top merchants aggregation
The API SHALL group transactions by `description`, sum absolute amounts, and return the top 5 by total spend.

#### Scenario: Top merchants shape
- **WHEN** the API responds successfully
- **THEN** `topMerchants` SHALL be an array of objects each with `description` (string) and `total` (number), sorted descending by total, capped at 5 entries

### Requirement: Summary stats
The API SHALL return aggregate stats: total transaction count and average transaction amount for the category (all-time, expenses only).

#### Scenario: Stats calculation
- **WHEN** the API responds successfully
- **THEN** `count` SHALL be the integer count of expense transactions for the category, and `average` SHALL be the mean absolute amount rounded to 2 decimal places
