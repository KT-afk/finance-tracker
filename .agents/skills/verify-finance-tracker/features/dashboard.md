# Dashboard

## Sub-features

- "Financial Overview" with a month picker and bank tabs (All, OCBC, DBS, UOB, TRUST, WISE, CHOCOLATE).
- Summary card: Income, Repaid, Spent, Net. "Total Balance" links to `/accounts`.
- AI insight card (says "No transactions yet this month." when the month is empty).
- Empty state "No transactions yet" with an "Upload statement" link, only when there is no data at all.

## How to get to it (user POV)

Log in; the dashboard is `/` ("Home" in the sidebar).

## Driving it with Playwright

`e2e.sh tests/e2e/dashboard.spec.ts`. Wait for `.animate-pulse` to detach before reading numbers.

## Gotchas

- Demo data runs from 2026-01 to 2026-06, so the current month is empty and the summary shows $0.00. Pick a demo month in the month picker to see real numbers.
- Use exact text: "No transactions yet" also matches the AI insight sentence.
