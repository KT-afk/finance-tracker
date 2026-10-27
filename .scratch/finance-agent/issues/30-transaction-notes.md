# 30: Notes on transactions, and say when memories didn't load

**Phase:** C

**Priority:** P1

**What to build:** The owner told the bot "the $1,277 transfer to Yoon Thiri was my wedding ring". A memory holds that, but the agent only uses a memory if it connects it to the question. Attach facts about one payment to the payment itself: a `note` on the transaction, proposed by the agent and saved only on ✅, like any change. Every transaction lookup then returns the note with the payment, so the agent can't miss it. Separately, when memories fail to load, the answer should say so instead of quietly answering without them.

**Blocked by:** None

**Status:** resolved

- [x] A `note` column on transactions (migration 0011), separate from the bank's `memo`
- [x] The agent proposes a note on one transaction with ✅/❌; confirming saves it and records it in the change log; same expiry, double-tap and conflict rules as other proposals
- [x] Transaction search returns each payment's note and shows it in the display line
- [x] The Transactions page shows the note under the payment
- [x] If memories fail to load, the answer ends with a short line saying so
- [x] The instructions prefer a note for facts about one payment, and a memory for general facts

## Comments

Resolved (2026-10-27): migration 0011 adds `transactions.note`. `proposeNote` (up to 200 characters, says what it replaces) is a third proposal kind; confirming writes the note and its change-log row in one batch that requires the note to be unchanged, the same shape as recategorise (lesson 22). `search_transactions` returns `note`, matches it in text search ("ring" finds the payment) and adds "(your note: …)" to the display line. The agent's `propose_note` tool is preferred for facts about one payment; `propose_memory` stays for general facts. If memories fail to load, the answer ends with "(I couldn’t load your saved memories for this answer.)". The Transactions page shows the note under the payment.
