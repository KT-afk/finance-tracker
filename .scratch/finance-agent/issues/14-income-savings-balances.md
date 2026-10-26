# 14: Income, savings and balances

**Phase:** D

**What to build:** The owner can ask about income, savings (income minus spending) and balances. Balances always carry their statement date. "Can I afford X?" is answered with the budget impact, savings so far and the latest dated balance, without a yes or no.

**Blocked by:** 01

**Status:** resolved

- [x] Income excludes transfers between the owner's own accounts and share repayments
- [x] Savings equals income minus spending for the period
- [x] Balances are always shown with their date (the day recorded, not yet the statement date: ticket 25)
- [x] Affordability answers give facts and no verdict
- [x] Agent tests cover income, savings, dated balances and affordability

Spec: `.scratch/finance-agent/spec.md`

## Comments

Triage (2026-10-25): ready for agent and unblocked (01 resolved). Can run in parallel with the Telegram work.

Resolved (2026-10-26): two new tools. `query_cash_flow` gives income, spending and savings for a period, using the dashboard's rules, and takes spending from `query_spending` so they agree. `get_balances` gives the latest balance per account with `recorded_on`. Budgets don't exist yet (ticket 11), so affordability answers compare with spending so far in the category. The real AI's wording (no yes or no) is only in the instructions; tests check the instructions say so (lesson 8). Balances are dated by the day recorded, not the statement date; ticket 25 fixes that.
