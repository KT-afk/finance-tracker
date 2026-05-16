## Why

The app currently tracks spending but has no visibility into how much money the user actually has. Adding a "total balance" view lets the user see their net worth across all 4 SG bank accounts at a glance, turning the app from a spending tracker into a financial overview tool.

## What Changes

- Add a new `/accounts` page with per-bank balances, inline editing, and a 6-month net worth trend chart
- Add a compact balance summary card on the dashboard that links to `/accounts`
- Add a `balance_history` table to store balance snapshots (every update creates a new row; latest row = current balance)
- Replace Upload in the navbar with Accounts (Upload moves to a button on the Transactions page)
- Navbar becomes: Home, Transactions, Accounts, Insights, Ask (5 items, full labels)

## Capabilities

### New Capabilities
- `account-balances`: Manual balance entry per bank, balance history tracking, current balance display, net worth aggregation
- `accounts-page`: Full accounts page with per-bank breakdown, inline editing, and 6-month net worth trend chart
- `dashboard-balance-card`: Compact balance summary card on dashboard linking to /accounts

### Modified Capabilities
- `navigation`: Navbar changes from 5 items (Home, Transactions, Insights, Ask, Upload) to 5 items (Home, Transactions, Accounts, Insights, Ask). Upload button moves to Transactions page header.

## Impact

- **Database**: New `balance_history` table
- **API**: New endpoints for balance CRUD and history
- **Frontend**: New `/accounts` page, modified dashboard (`/`), modified transactions page (upload button), modified NavBar
- **No breaking changes** to existing transaction/categorization/insight functionality
