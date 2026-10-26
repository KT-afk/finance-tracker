# 25: Store the statement date of each balance

**Phase:** D

**Priority:** P2

**What to build:** `balance_history.recorded_at` is the moment a balance was saved: upload time, or when the owner typed it in. The glossary says a balance is "as of a statement date". A September statement uploaded in October looks like an October balance. Found by Codex while reviewing ticket 14.

Add a separate `statement_date` column (a migration; see `docs/book/03-lessons.md` lesson 1 before running it). Each parser returns the statement's closing date; manual edits use the day they were typed. Keep `recorded_at` as the save time. Pick "latest balance" by `statement_date`, falling back to `recorded_at` for old rows.

Don't reuse `recorded_at` for the statement date. Ticket 14 tried that: old rows with upload times then outrank newer statements, so a fresh upload can be hidden on the dashboard. A held-back balance (statement didn't reconcile) must carry its own statement date to the confirm step, not one rebuilt from the batch.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Each balance stores its statement date separately from when it was saved
- [ ] Parsers return the statement's closing date
- [ ] Dashboard, Accounts and the agent's `get_balances` show and order by statement date
- [ ] The agent's instructions drop the “the statement may be older” caveat
