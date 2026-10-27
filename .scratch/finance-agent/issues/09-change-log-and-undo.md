# 09: Reading the change log and undo

**Phase:** C

**What to build:** The owner can ask "what did you change this week?" and get the change log entries. They can say "undo the last change" or "undo #12" and the change is reversed straight away, with the undo itself recorded.

**Blocked by:** 07

**Status:** resolved

- [x] Asking for recent changes lists change log entries with before and after
- [x] Undo restores the before value without confirmation
- [x] Undo is recorded in the change log and points to the entry it reverses
- [x] Undo refuses and explains when the target has changed since
- [x] Change log entries are never edited or deleted

Spec: `.scratch/finance-agent/spec.md`

## Comments

Triage (2026-10-25): fully specified; ready for agent once its blockers are resolved.

Resolved (2026-10-27): `lib/agent/change-log.ts`. `listChanges` returns entries newest first with a readable "what" (the payment, or the memory's name), before, after, source, request and the entry an undo reverses. `undoChange` (newest entry when no id) puts back "before" at once, only if the target still has "after": the undo's log row and the write are one batch with the same condition (lesson 22), so a target changed since is refused with an explanation and nothing changes. Covers categories, notes (back to none) and memories (a new memory is removed again). The undo is its own entry with `reverses_id`; undoing an undo puts the change back. Agent tools `list_changes` and `undo_change`; the instructions undo only when the owner's own message asks. No migration needed.
