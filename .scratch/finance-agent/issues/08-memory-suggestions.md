# 08: Memory suggestions

**Phase:** C

**What to build:** The owner can say "remember that…" and the agent proposes saving it; the agent can also suggest a memory when it notices a pattern. Either way, the memory is saved only when the owner confirms, and the save is recorded in the change log.

**Blocked by:** 04, 07

**Status:** ready-for-agent

- [ ] "Remember that…" produces a memory proposal with confirm and reject
- [ ] Agent-suggested memories also need confirmation
- [ ] Confirmed memories are saved as user or inferred depending on who suggested them
- [ ] Saved memories appear in the change log and are used in later answers

Spec: `.scratch/finance-agent/spec.md`

## Comments

Triage (2026-10-25): fully specified; ready for agent once its blockers are resolved.
