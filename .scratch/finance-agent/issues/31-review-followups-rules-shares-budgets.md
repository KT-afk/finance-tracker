# 31: Review follow-ups for rules, shares and budgets

**Priority:** P3

**Status:** needs-triage

From the review of PR #36 (tickets 10 and 11). None of these blocks anything today.

- [ ] Money compared exactly on `real` columns (`budgets.monthly_limit`, `owed_entries.amount`) in apply and undo. Fine while only our code writes them; a rounded write elsewhere would show a false “conflict”. Store cents, or compare within half a cent.
- [ ] `applyRule`/`applyShare`/`applyBudget` find their new log row by timestamp; two confirms in the same millisecond could mix them up.
- [ ] A share proposed while the payment had no owed entry, then confirmed after an app split was added, says “share has changed” rather than “already recorded in Owed to you”.
- [ ] The settle → conditional write → log row shape is repeated in each apply and undo branch; `kind` is switched on in four places. Fold into ticket 28.
- [x] Budgets can be removed (ticket 32).

From the review of PR #37 (2026-10-28):

- [ ] The amount field, its parse-then-focus check and its error line are repeated in the add and edit forms on the Budgets page; one `AmountField`.
- [ ] “Removed” has three spellings: `amount: null` (API), `after: ""` (proposal), `!entry.after` (change log).
- [ ] `removeBudget` writes the change-log columns by hand instead of sharing `logRow` with `change-log.ts`.
- [ ] Pace is turned into a look in three places (`paceStyle`, `barStyle`, the 10pm mark).
- [ ] `BUDGET_CATEGORIES` lists the two owed categories separately from `OWED_CATEGORIES` in `proposals.ts`.
- [ ] A hand-edited $0 budget with nothing spent shows as over budget.
- [ ] Measure the phone menu's 7 tap targets against the 44px rule.
- [ ] The unsaved-amount warning covers closing or reloading the tab, not in-app links.

From the review of ticket 13 (2026-10-28):

- [ ] `spendBetween`, `groupOf`, `displayName` and `merchantKey` are now shared from `monthly-recap.ts`; move them to their own spending module, with one `sgd`/`dayLabel`/signed-amount formatter.
- [ ] `nightlyKind` and `budgetLines` live in `daily-message.ts` but serve all three messages.
- [ ] Review nights build the whole daily summary just for its warnings; split out the warnings.
- [ ] The endpoint review test runs on the real clock; give the route a clock to replace.
- [ ] `?review=weekly` on a weekday compares a part week with a full one (testing only).

From the review of ticket 33 (2026-10-28):

- [ ] `savingsReview` reads the transactions about 14 times for 6 months (each `queryCashFlow` plus the category reads); one read bucketed by month would do.
- [ ] `spendByCategory` repeats `querySpending`'s classify loop, and `round` copies `roundMoney`; share them so the rules can't drift.
- [ ] The “above average” rule (20% and $30) and the day-7 pace start are written only in code comments.
