# 14: Income, savings and balances

**Phase:** D

**What to build:** The owner can ask about income, savings (income minus spending) and balances. Balances always carry their statement date. "Can I afford X?" is answered with the budget impact, savings so far and the latest dated balance, without a yes or no.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Income excludes transfers between the owner's own accounts and share repayments
- [ ] Savings equals income minus spending for the period
- [ ] Balances are always shown with their statement date
- [ ] Affordability answers give facts and no verdict
- [ ] Agent tests cover income, savings, dated balances and affordability

Spec: `.scratch/finance-agent/spec.md`

## Comments

Triage (2026-10-25): ready for agent and unblocked (01 resolved). Can run in parallel with the Telegram work.
