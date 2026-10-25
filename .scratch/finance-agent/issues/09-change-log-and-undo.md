# 09: Reading the change log and undo

**Phase:** C

**What to build:** The owner can ask "what did you change this week?" and get the change log entries. They can say "undo the last change" or "undo #12" and the change is reversed straight away, with the undo itself recorded.

**Blocked by:** 07

**Status:** ready-for-agent

- [ ] Asking for recent changes lists change log entries with before and after
- [ ] Undo restores the before value without confirmation
- [ ] Undo is recorded in the change log and points to the entry it reverses
- [ ] Undo refuses and explains when the target has changed since
- [ ] Change log entries are never edited or deleted

Spec: `.scratch/finance-agent/spec.md`

## Comments

Triage (2026-10-25): fully specified; ready for agent once its blockers are resolved.
