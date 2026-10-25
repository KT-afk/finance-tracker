# 06: Daily insights topic and replies

**Phase:** B

**What to build:** The 10pm message is posted to the Daily insights topic. When the owner replies to it, the finance agent answers in that topic using the replied-to message as context.

**Blocked by:** 05

**Status:** needs-triage

- [ ] The daily message goes to the Daily insights topic
- [ ] A reply to a daily message is answered with that message as context
- [ ] Non-reply messages in Daily insights are handled sensibly (answered as a question)
- [ ] Telegram handler tests cover reply routing

Spec: `.scratch/finance-agent/spec.md`
