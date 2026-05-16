## 1. Database & Schema

- [x] 1.1 Add `balanceHistory` table to `lib/schema.ts` (id, bank, balance, recorded_at)
- [x] 1.2 Generate and run Drizzle migration for the new table

## 2. API Endpoints

- [x] 2.1 Create `GET /api/balances` — returns current balance per bank (latest row each) + total
- [x] 2.2 Create `POST /api/balances` — accepts `{ bank, balance }`, inserts new row
- [x] 2.3 Create `GET /api/balances/history` — returns 6-month monthly net worth data (carry forward missing months)

## 3. Accounts Page

- [x] 3.1 Create `/app/accounts/page.tsx` — page shell with loading/empty/data states
- [x] 3.2 Implement per-bank balance list with "Updated X ago" timestamps
- [x] 3.3 Implement inline editing (Edit button → input field + Save, Escape to cancel)
- [x] 3.4 Implement "Set balance" action for banks with no history
- [x] 3.5 Add 6-month net worth trend chart (AreaChart from Recharts)

## 4. Dashboard Changes

- [x] 4.1 Add compact balance card to dashboard (total balance, "across N banks", links to /accounts)
- [x] 4.2 Refactor dashboard layout to side-by-side grid (balance card + spend card)
- [x] 4.3 Handle empty state (no balances set → "No balances set" with link)

## 5. Navigation Changes

- [x] 5.1 Update NavBar: replace Upload with Accounts (icon + full label, route to /accounts)
- [x] 5.2 Add Accounts icon (wallet/dollar icon) to NavBar
- [x] 5.3 Add "Upload" button to Transactions page header (right-aligned, links to /upload)
