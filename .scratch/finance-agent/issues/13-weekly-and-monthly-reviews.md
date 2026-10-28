# 13: Weekly and monthly reviews

**Phase:** D

**What to build:** On Sundays the 10pm message is a weekly review, and on the 1st it is a monthly review, each in place of the daily message, in Daily insights. Reviews show the biggest changes from the previous period, top merchants and each budget's result. Replying to a review asks the agent about it.

**Blocked by:** 06, 11

**Status:** done

- [x] Sunday sends a weekly review instead of the daily message
- [x] The 1st sends a monthly review instead of the daily message (monthly wins if both)
- [x] Reviews show biggest changes, top merchants and budget results
- [x] Replies to reviews are answered with the review as context
- [x] Daily message tests cover date selection and review contents

Spec: `.scratch/finance-agent/spec.md`

## Comments

Triage (2026-10-25): fully specified; ready for agent once its blockers are resolved.

Done (2026-10-28): `nightlyKind` picks the message; `lib/weekly-review.ts` is new; the monthly recap gained last month's total and budget results (today's limits, since limits have no history). Replies need nothing new: any reply in Daily insights carries the replied-to text (ticket 06). A long review split into several Telegram messages quotes only the part replied to.
