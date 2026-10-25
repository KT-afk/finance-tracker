# 15: Agent totals match the 10pm message

**Phase:** A

**Priority:** P1

**What to build:** A test that shows the finance agent's spending totals and the 10pm message's figures agree for the same day, as the spec requires ("so the agent, the 10pm message and the dashboard agree"). Ticket 01 only checked agreement with the dashboard. If they disagree, make the 10pm message use the same spending calculation.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] A test seeds shares, a forgiven share and an unlabelled transfer, then compares the agent's totals with the 10pm message for the same day
- [ ] Any difference is fixed so both use the owner's spending
