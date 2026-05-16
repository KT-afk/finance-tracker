## ADDED Requirements

### Requirement: Accounts page layout
The system SHALL render an Accounts page at `/accounts` displaying the total net worth at the top, followed by a per-bank balance list, and a 6-month net worth trend chart.

#### Scenario: User visits /accounts with balances
- **WHEN** the user navigates to `/accounts` and at least one bank has a balance
- **THEN** the page displays the total balance, each bank with its balance and "Updated X ago" timestamp, and a trend chart

#### Scenario: User visits /accounts with no balances
- **WHEN** the user navigates to `/accounts` and no banks have balances
- **THEN** the page displays an empty state prompting the user to add their first balance

### Requirement: Inline balance editing
The system SHALL allow inline editing of a bank's balance. Clicking "Edit" on a bank row reveals an input field pre-filled with the current balance and a "Save" button. Clicking "Save" submits the new balance and updates the display.

#### Scenario: User edits a balance
- **WHEN** the user clicks "Edit" on a bank row, changes the value, and clicks "Save"
- **THEN** the new balance is saved via POST to `/api/balances`, the display updates immediately, and the "Updated" timestamp refreshes to "just now"

#### Scenario: User cancels an edit
- **WHEN** the user clicks "Edit" then clicks away or presses Escape
- **THEN** the edit is cancelled and the original balance is restored in the display

### Requirement: Net worth trend chart
The system SHALL display a 6-month area/line chart showing total net worth per month, using data from `GET /api/balances/history`.

#### Scenario: Sufficient history exists
- **WHEN** the user has balance data spanning multiple months
- **THEN** the chart displays a line/area chart with monthly data points

#### Scenario: Only current month data
- **WHEN** the user has only entered balances this month
- **THEN** the chart displays a single data point for the current month

### Requirement: Add balance for bank with no history
The system SHALL allow the user to add a balance for a bank that has never had one, via the same inline UI.

#### Scenario: Bank has no balance yet
- **WHEN** a bank row shows no balance
- **THEN** the row displays a "Set balance" action that opens the inline input
