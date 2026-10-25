# 16: Tidy the agent's spending query

**Phase:** A

**Priority:** P3

**What to build:** Small clean-ups in the agent's spending query, found in code review of ticket 01. No change in behaviour.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] One shared money-rounding helper replaces the four copies (`lib/owed.ts`, `lib/owed-ledger.ts`, `app/api/insights/route.ts`, `lib/agent/query-spending.ts`)
- [ ] The allowed `measure` and `group_by` values are defined once and reused by the tool schema and input validation in `lib/agent/run-finance-agent.ts`
- [ ] `querySpending` takes an options object instead of five positional arguments
- [ ] Gross spending is worked out in a clearly named step, not by setting the share to 0 before classifying
- [ ] A comment explains why the category filter runs after classification (so it matches the dashboard, including "Unlabelled")
