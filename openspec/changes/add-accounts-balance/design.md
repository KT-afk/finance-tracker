## Context

The finance tracker currently tracks transactions and spending but has no concept of account balances. The user wants to see their total money across 4 SG banks (OCBC, DBS, UOB, Trust). Balances are manually entered since there are no bank APIs available for SG banks. The app is local-only, single-user, using SQLite + Drizzle ORM + Next.js App Router.

## Goals / Non-Goals

**Goals:**
- Let the user see their total balance across all banks at a glance
- Track balance history over time for a net worth trend
- Provide inline editing for quick balance updates
- Integrate naturally into the existing dashboard and navigation

**Non-Goals:**
- Automatic balance syncing via bank APIs
- Multi-currency support
- Investment or CPF tracking (future scope)
- Balance reconciliation against transactions

## Decisions

### 1. Single `balance_history` table, no separate "current balance" table

Every balance update inserts a new row with a timestamp. The current balance is derived by querying the latest row per bank.

**Why:** Simpler schema, no need to keep two tables in sync. The history IS the source of truth. Query overhead is negligible with SQLite for 4 banks.

**Alternative considered:** Separate `balances` (current) + `balance_history` tables. Rejected because it adds sync complexity for no real benefit at this scale.

### 2. Inline editing on the Accounts page

Tapping "Edit" on a bank row reveals an input field inline, with a Save button. No modal or drawer.

**Why:** Matches the existing UX pattern used for transaction category editing. Keeps the interaction fast and lightweight.

### 3. Net worth trend uses latest balance per bank per month

The 6-month trend chart picks the most recent `balance_history` entry for each bank in each month, sums them, and plots the total.

**Why:** Users may update balances multiple times per month or skip months. Taking the latest entry per month gives the most accurate snapshot. Months with no entry carry forward the last known balance.

### 4. Upload button moves to Transactions page header

Instead of a dedicated nav item, Upload becomes a button in the Transactions page header: `[Upload]` aligned right.

**Why:** Upload is an infrequent action (monthly). It doesn't need permanent nav real estate. Placing it on Transactions is contextually logical — "I'm looking at transactions, I want to add more."

### 5. Dashboard balance card uses compact side-by-side layout

Two cards side by side: Total Balance (left) and Monthly Spend (right). The balance card links to `/accounts`.

**Why:** Keeps spending as the primary focus while adding balance visibility. The existing monthly spend card stays prominent.

## Risks / Trade-offs

- **Stale balances** — Balances are only as fresh as the user's last manual update. Mitigation: Show "Updated X ago" per bank so staleness is visible.
- **Missing months in trend** — If a user doesn't update for 2 months, the trend chart has gaps. Mitigation: Carry forward last known balance for empty months.
- **6 nav items on mobile** — We're actually staying at 5 items (swapping Upload for Accounts), so this is fine.
