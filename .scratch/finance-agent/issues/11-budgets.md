# 11: Budgets

**Phase:** D

**What to build:** The owner sets a monthly budget per category by asking ("cap Food at $500"), confirmed like any change. Asking "how am I doing on budgets?" shows each budget's spending, limit and pace for the current calendar month (Singapore time). Unspent budget does not roll over.

**Blocked by:** 01, 07

**Status:** done

- [x] Setting or changing a budget is a confirmed, logged, undoable change
- [x] Budget status compares spending (the owner's share) with the limit
- [x] Pace compares share of budget used with share of month gone
- [x] Categories without a budget are not listed
- [x] Months are calendar months in Singapore time

Spec: `.scratch/finance-agent/spec.md`

## Comments

Triage (2026-10-25): ready for agent with calendar months in Singapore time, as written. The spec marks this as provisional pending a pay-cycle decision; keep the month boundary in one function so it is easy to change.

Done (2026-10-27): the owner confirmed calendar months, 1st to the last day, in Singapore time. `budgetMonth` in `lib/budgets.ts` is the one place the boundary lives. Needs migration 0012 on the live database.
