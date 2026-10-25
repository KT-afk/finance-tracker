# 01: Agent totals use the owner's spending

**Phase:** A

**What to build:** When the owner asks the finance agent for totals (by category, by month, or overall), the answer is their spending: each payment minus the shares other people should cover, with forgiven shares counted back. When the owner asks for gross spending, the agent gives that instead. The calculation is shared with the existing owed-share and cash-flow logic so the agent agrees with the dashboard.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Asking "how much on Food this month?" with a $120 dinner carrying an $80 share counts $40
- [x] A forgiven share counts as the owner's spending again
- [x] Asking for gross spending returns the full payment amounts
- [x] Agent totals match the dashboard's spending figures for the same period
- [x] Agent tests seed shares and forgiven shares and check both spending and gross answers

Spec: `.scratch/finance-agent/spec.md`
