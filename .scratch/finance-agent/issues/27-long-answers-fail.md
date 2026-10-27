# 27: Long answers fail instead of being sent

**Phase:** B

**Priority:** P1

**What to build:** On 2026-10-27 the owner asked in Telegram "What was I spending so much on in May, June and April 2026" and got "Sorry, I couldn't answer that just now". The agent could write at most 1,200 tokens and had 4 lookup rounds. A three-month question needs more of both, and running out of either failed the whole question. The previous answer also showed `**Sep 2026**` with the stars, because Telegram doesn't format Markdown.

**Blocked by:** None

**Status:** resolved

- [x] The answer limit is 4,000 tokens; Telegram already splits long messages
- [x] An answer that still runs out is sent, marked as cut short, instead of failing
- [x] The agent has 8 lookup rounds plus one to answer
- [x] The instructions ask for no Markdown and short answers with the top items first

## Comments

Resolved (2026-10-27) in `lib/agent/run-finance-agent.ts`, tested in `tests/finance-agent.test.ts`. The exact error isn't visible (Vercel logs are out of reach), so this fixes both likely causes. Check with the same question in Ask anything after the deploy.
