# 33: Savings review: averages, how much you could save, what to cut

**Priority:** P2

**Status:** done

Owner request (2026-10-28): “Can it tell me how much I can save and what to cut out and the average.”

- [x] One `savings_review` tool: average monthly income, spending, savings and savings rate over the last 3 or 6 full months (Singapore calendar months; this month left out)
- [x] Months before the data starts are left out of the averages
- [x] Each spending category: monthly average, this month so far, its pace, clearly above average or not, fixed (Housing, Bills & Utilities) or flexible, top merchants
- [x] Instructions: suggest two or three specific cuts with dollar amounts and what each adds to savings; fixed costs only when asked; the choice stays with the owner; offer a budget
- [x] Database test and agent tests

Note: “Fixed” is Housing and Bills & Utilities. Subscriptions and Health count as flexible; change `FIXED_CATEGORIES` if that's wrong.
