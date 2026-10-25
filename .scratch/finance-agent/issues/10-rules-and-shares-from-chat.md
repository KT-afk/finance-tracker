# 10: Category rules and shares from chat

**Phase:** C

**What to build:** The owner can ask the agent to add or edit a category rule, or to mark someone's share of a payment, through the same confirm step and change log. Requests to delete transactions, change amounts or dates, or touch uploads are refused with an explanation.

**Blocked by:** 07

**Status:** needs-triage

- [ ] Category rule create and edit go through proposals and the change log
- [ ] Setting a share goes through proposals and the change log and changes spending accordingly
- [ ] Both are undoable
- [ ] Delete, amount, date and upload changes are refused with an explanation

Spec: `.scratch/finance-agent/spec.md`
