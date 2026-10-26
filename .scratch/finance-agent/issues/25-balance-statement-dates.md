# 25: Store the statement date of each balance

**Phase:** D

**Priority:** P2

**What to build:** `balance_history.recorded_at` is the moment a balance was saved: upload time, or when the owner typed it in. The glossary says a balance is "as of a statement date". A September statement uploaded in October looks like an October balance. Found by Codex while reviewing ticket 14.

Add a separate `statement_date` column (a migration; see `docs/book/03-lessons.md` lesson 1 before running it). Each parser returns the statement's closing date; manual edits use the day they were typed. Keep `recorded_at` as the save time. Pick "latest balance" by `statement_date`, falling back to `recorded_at` for old rows.

Don't reuse `recorded_at` for the statement date. Ticket 14 tried that: old rows with upload times then outrank newer statements, so a fresh upload can be hidden on the dashboard. A held-back balance (statement didn't reconcile) must carry its own statement date to the confirm step, not one rebuilt from the batch.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Each balance stores its statement date separately from when it was saved
- [x] Parsers return the statement's closing date
- [x] Dashboard, Accounts and the agent's `get_balances` show and order by statement date
- [x] The agent's instructions drop the “the statement may be older” caveat

## Comments

Resolved (2026-10-26): migration 0007 adds `statement_date`. CSV parsers date the balance by its row; UOB, OCBC, Trust and Chocolate PDFs read the statement's closing date; anything else falls back to the statement's last transaction (from every parsed row, before duplicates are dropped). Held-back balances carry their own date to the confirm step. Manual edits use today in Singapore. Latest balance: dated rows first, then newest date, then latest save, the same in `/api/balances`, the trend and `get_balances`. The agent says “as of” and keeps the caveat only for old undated rows (`exact: false`). Accounts shows “As of 30 Sept” for dated balances. `db:copy-cloud` now copies the column, so run migration 0007 on the cloud database first.
