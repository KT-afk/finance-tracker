# 17: Drop "read-only" from the agent's instructions

**Phase:** C

**Priority:** P2

**What to build:** The agent's instructions still begin "You are a read-only personal finance assistant". Once the agent can propose changes, replace this with the spec's wording: changes only through proposals, never claim a change happened before confirmation, never delete or edit amounts, dates or uploads.

**Blocked by:** 07

**Status:** resolved

- [x] The "read-only" wording is gone
- [x] The instructions state the spec's rules for proposals and forbidden changes

## Comments

Triage (2026-10-25): fully specified; ready for agent once its blockers are resolved.

Resolved (2026-10-27) with ticket 07: the instructions now say changes happen only through proposals the owner confirms, never to claim a change was made, and that deleting transactions, changing amounts or dates, uploads and memories are out of reach.
