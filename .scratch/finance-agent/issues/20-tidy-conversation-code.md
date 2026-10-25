# 20: Tidy the conversation code

**Phase:** A

**Priority:** P3

**What to build:** Clean-ups found in code review of ticket 03. No change in behaviour. Natural to do with ticket 05, which adds the Telegram source.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `source` and `topic` travel as one value (e.g. a conversation key) through `loadHistory`, `saveExchange` and the routes
- [ ] `topic` is a typed set of known topics, like `source`, not a free string
- [ ] `FRESH_AFTER_MS` in `lib/agent/conversation.ts` is renamed to say when history goes stale; its doc comment refers to the constants instead of repeating 10 and 6 hours
- [ ] `runFinanceAgent` takes the conversation (and its source, per the spec's agent entry point) as its own argument, not mixed into the test overrides
- [ ] `app/api/ask/route.ts` reads the clock once for loading and saving
