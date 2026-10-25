# 07: Proposed changes and the change log

**Phase:** C

**What to build:** The owner says "that $80 Shopee was a gift" and the finance agent proposes recategorising that exact transaction, naming merchant, amount, date and before and after, with confirm and reject buttons in Telegram and on the web. Only confirming applies it. Every applied change is recorded in the change log with what changed, before and after, when, the request and the source.

**Blocked by:** 02, 05

**Status:** needs-triage

- [ ] The agent never changes data without a confirmed proposal and never claims it did
- [ ] Proposals name the exact transaction and the before and after category
- [ ] Confirm applies the change and records it in the change log; reject changes nothing
- [ ] Proposals expire after 24 hours; an expired or already-used button does nothing and says so
- [ ] If the transaction changed since the proposal, confirming changes nothing and says why
- [ ] Works in Telegram (inline buttons) and on the web Ask page
- [ ] Agent and Telegram handler tests cover propose, confirm, reject, expiry and conflict

Spec: `.scratch/finance-agent/spec.md`
