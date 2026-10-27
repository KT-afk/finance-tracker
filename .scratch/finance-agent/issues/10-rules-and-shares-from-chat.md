# 10: Category rules and shares from chat

**Phase:** C

**What to build:** The owner can ask the agent to add or edit a category rule, or to mark someone's share of a payment, through the same confirm step and change log. Requests to delete transactions, change amounts or dates, or touch uploads are refused with an explanation.

**Blocked by:** 07

**Status:** resolved

- [x] Category rule create and edit go through proposals and the change log
- [x] Setting a share goes through proposals and the change log and changes spending accordingly
- [x] Both are undoable
- [x] Delete, amount, date and upload changes are refused with an explanation

Spec: `.scratch/finance-agent/spec.md`

## Comments

Triage (2026-10-25): fully specified; ready for agent once its blockers are resolved.

Resolved (2026-10-27): two more proposal kinds, `rule` and `share`, on the ticket 07 machinery (buttons, expiry, double tap, change log), each with a conditional write (lesson 22) and an undo in `lib/agent/change-log.ts`. Rules store keywords like the app's `saveRule()` (lowercased) and apply to future uploads; the offer says how many past payments match and that they keep their categories. Shares reuse the app's checks from `lib/owed.ts` (`getBankTransaction`, `cleanPerson`, `cleanAmount`): a bank payment out, no more than its amount, and not a payment already recorded otherwise in Owed to you. Shares are stored as "person|amount" in the log and shown as "Jane owes $40". Agent tools `propose_rule` and `propose_share`. Refusing deletes, amount and date changes and uploads stays in the instructions (since ticket 07). No migration.
