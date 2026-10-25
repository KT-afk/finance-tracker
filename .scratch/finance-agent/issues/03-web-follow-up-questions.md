# 03: Follow-up questions on the web

**Phase:** A

**What to build:** The web Ask page remembers recent conversation, so "and last month?" follows on from the previous question. Each question and answer is saved with its source (web) and topic. The agent receives the last 10 exchanges from the same source and topic, but only when the latest was within 6 hours; otherwise it starts fresh and asks for clarification when a follow-up has no context.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Saved conversations record source and topic; existing rows remain readable
- [x] A follow-up within 6 hours is answered using the previous exchange
- [x] After 6 hours without messages the agent receives no history
- [x] An ambiguous follow-up with no history gets a clarifying question
- [x] At most 10 exchanges are passed to the agent
- [x] Agent tests check history is passed or dropped by the 6-hour rule and the 10 limit

Spec: `.scratch/finance-agent/spec.md`
