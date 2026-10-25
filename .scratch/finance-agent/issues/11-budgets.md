# 11: Budgets

**Phase:** D

**What to build:** The owner sets a monthly budget per category by asking ("cap Food at $500"), confirmed like any change. Asking "how am I doing on budgets?" shows each budget's spending, limit and pace for the current calendar month (Singapore time). Unspent budget does not roll over.

**Blocked by:** 01, 07

**Status:** ready-for-agent

- [ ] Setting or changing a budget is a confirmed, logged, undoable change
- [ ] Budget status compares spending (the owner's share) with the limit
- [ ] Pace compares share of budget used with share of month gone
- [ ] Categories without a budget are not listed
- [ ] Months are calendar months in Singapore time

Spec: `.scratch/finance-agent/spec.md`

## Comments

Triage (2026-10-25): ready for agent with calendar months in Singapore time, as written. The spec marks this as provisional pending a pay-cycle decision; keep the month boundary in one function so it is easy to change.
