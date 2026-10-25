# 02: Transaction search

**Phase:** A

**What to build:** On the web Ask page, the owner can ask which transactions are behind a number: by category, merchant or description text, amount range and dates. The agent lists up to 20 transactions, newest first, with a total, says when more exist, and shows shared payments as "Dinner $120 (your share $40)".

**Blocked by:** 01

**Status:** resolved

- [x] Searching by merchant text finds matching transactions
- [x] Filtering by category, amount range and dates works and rejects invalid input
- [x] At most 20 transactions are listed, newest first, with a total and a note when there are more
- [x] Payments with shares show both the full amount and the owner's share
- [x] No matches is answered plainly, without guessing why
- [x] Agent tests cover each filter, the 20 limit and the share display

Spec: `.scratch/finance-agent/spec.md`
