# 18: Tidy the agent's tool runner

**Phase:** A

**Priority:** P3

**What to build:** Clean-ups found in code review of ticket 02. No change in behaviour.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `lib/agent/run-finance-agent.ts` looks tools up in one name → {parse, run, failure message} map instead of an if-chain, so adding a tool is one entry
- [ ] Both tools' input parsers live beside their tools and share one date-range check (`isValidIsoDate` from `lib/owed.ts`) and one "must be an object" guard
- [ ] `formatMoney` in `lib/agent/search-transactions.ts` reuses an existing SGD formatter (`lib/display.ts` or `lib/daily-message.ts`) or they are merged
- [ ] Search sorts rows before building results, instead of carrying `time` on the result and stripping it
- [ ] Clearer names: `more` → `remaining_count`, `LIMIT` → `MAX_LISTED`
