# 08: Memory suggestions

**Phase:** C

**What to build:** The owner can say "remember that…" and the agent proposes saving it; the agent can also suggest a memory when it notices a pattern. Either way, the memory is saved only when the owner confirms, and the save is recorded in the change log.

**Blocked by:** 04, 07

**Status:** resolved

- [x] "Remember that…" produces a memory proposal with confirm and reject
- [x] Agent-suggested memories also need confirmation
- [x] Confirmed memories are saved as user or inferred depending on who suggested them
- [x] Saved memories appear in the change log and are used in later answers

Spec: `.scratch/finance-agent/spec.md`

## Comments

Triage (2026-10-25): fully specified; ready for agent once its blockers are resolved.

Resolved (2026-10-27): memories are a second proposal kind (`memory`) on the ticket 07 machinery: same buttons, 24-hour expiry, double-tap protection and change log. `proposeMemory` takes a short name (the key, lowercased) and the fact, up to 300 characters; reusing a name replaces that memory and the proposal says what it replaces. Migration 0010 adds `agent_proposals.memory_source`, so a confirmed memory is saved as `user` when the owner asked and `inferred` when the agent noticed it. Confirming checks the memory still has the "before" text. The agent tool is `propose_memory`. Prompted by the owner telling the bot what a $1,277 transfer was for, and the bot saying it couldn't remember it.
