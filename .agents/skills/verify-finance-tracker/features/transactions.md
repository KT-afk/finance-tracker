# Transactions

## Sub-features

- List with bank and category filter selects.
- "Add" opens a manual transaction form; a saved manual row can be deleted.
- Changing a category recategorizes the row (rate limited to 10 requests a minute on `/api/transactions/recategorize`).

## How to get to it (user POV)

Sidebar "Transactions" (`/transactions`).

## Driving it with Playwright

`e2e.sh tests/e2e/transactions.spec.ts`. After adding a row, reload and confirm it is still listed (or `GET /api/transactions`) to prove it was saved.

## Gotchas

- Manual rows written by a test stay in the demo database until the next `launch.sh`.
