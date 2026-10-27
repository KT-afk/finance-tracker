# 31: Review follow-ups for rules, shares and budgets

**Priority:** P3

**Status:** needs-triage

From the review of PR #36 (tickets 10 and 11). None of these blocks anything today.

- [ ] Money compared exactly on `real` columns (`budgets.monthly_limit`, `owed_entries.amount`) in apply and undo. Fine while only our code writes them; a rounded write elsewhere would show a false “conflict”. Store cents, or compare within half a cent.
- [ ] `applyRule`/`applyShare`/`applyBudget` find their new log row by timestamp; two confirms in the same millisecond could mix them up.
- [ ] A share proposed while the payment had no owed entry, then confirmed after an app split was added, says “share has changed” rather than “already recorded in Owed to you”.
- [ ] The settle → conditional write → log row shape is repeated in each apply and undo branch; `kind` is switched on in four places. Fold into ticket 28.
- [ ] Budgets can't be removed except by undoing the entry that set them.
