# 06: Daily insights topic and replies

**Phase:** B

**What to build:** The 10pm message is posted to the Daily insights topic. When the owner replies to it, the finance agent answers in that topic using the replied-to message as context.

**Blocked by:** 05

**Status:** resolved

- [x] The daily message goes to the Daily insights topic
- [x] A reply to a daily message is answered with that message as context
- [x] Non-reply messages in Daily insights are handled sensibly (answered as a question)
- [x] Telegram handler tests cover reply routing

Spec: `.scratch/finance-agent/spec.md`

## Comments

Triage (2026-10-25): fully specified; ready for agent once its blockers are resolved.

Resolved (2026-10-27): the daily job sends the 10pm message (and the monthly recap) to the group's Daily insights topic when `TELEGRAM_GROUP_ID` and `TELEGRAM_INSIGHTS_TOPIC_ID` are set, and to `TELEGRAM_CHAT_ID` until then (`dailyMessageTarget` in `lib/telegram.ts`). The handler answers the owner in Daily insights as well as Ask anything, each with its own history (`telegram`/`daily` and `telegram`/`ask`). A real reply passes the replied-to text to the agent as context; Telegram's automatic `reply_to_message` pointing at the topic's first message is not treated as a reply. A reply in Ask anything gets the same context. No new owner steps: ticket 05's step 7 already lists `TELEGRAM_INSIGHTS_TOPIC_ID`.
