# 07: Proposed changes and the change log

**Phase:** C

**What to build:** The owner says "that $80 Shopee was a gift" and the finance agent proposes recategorising that exact transaction, naming merchant, amount, date and before and after, with confirm and reject buttons in Telegram and on the web. Only confirming applies it. Every applied change is recorded in the change log with what changed, before and after, when, the request and the source.

**Blocked by:** 02, 05

**Status:** resolved

- [x] The agent never changes data without a confirmed proposal and never claims it did
- [x] Proposals name the exact transaction and the before and after category
- [x] Confirm applies the change and records it in the change log; reject changes nothing
- [x] Proposals expire after 24 hours; an expired or already-used button does nothing and says so
- [x] If the transaction changed since the proposal, confirming changes nothing and says why
- [x] Works in Telegram (inline buttons) and on the web Ask page
- [x] Agent and Telegram handler tests cover propose, confirm, reject, expiry and conflict

Spec: `.scratch/finance-agent/spec.md`

## Comments

Triage (2026-10-25): fully specified; ready for agent once its blockers are resolved.

Resolved (2026-10-27): migration 0009 adds `agent_proposals` and the append-only `change_log`. `lib/agent/proposals.ts` stores a recategorise proposal (refusing Repayment and Paid by Others, which belong to Owed to you, and non-spending categories on hand-entered rows) and decides it: one conditional update claims a pending proposal, so a double tap applies once; expired after 24 hours; `conflict` when the transaction no longer has the "before" category; the change and its log row are written in one batch. The agent's `propose_recategorise` tool stores proposals and the agent returns them; Telegram sends each with ✅/❌ buttons and edits the message with the result; the web Ask page shows Confirm and Reject. The "read-only" wording is gone (ticket 17).

Before it works in Telegram: run migration 0009 on the live database, and re-register the webhook so Telegram sends button taps (`npm run telegram:setup` now asks for `callback_query`).

Deployed setup (2026-10-27): migration 0009 applied to the live database from the cloud session (10 migrations recorded, `agent_proposals` and `change_log` exist, 1,774 transactions untouched). Webhook re-registered; Telegram's getWebhookInfo shows `allowed_updates: ["message","callback_query"]`, no pending updates, no errors.
