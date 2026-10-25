# 21: Check prompt caching works on a real call

**Phase:** A

**Priority:** P2

**What to build:** Ticket 04 marks the tools, instructions and memories for prompt caching, but only scripted tests checked it. The API silently skips caching when the marked prefix is below the model's minimum length (at least 1024 tokens on Sonnet models so far), and our prefix may be close to that with few memories. Make two real questions in a row and check `usage.cache_creation_input_tokens` then `usage.cache_read_input_tokens`. If nothing is cached, say so in this ticket and decide whether it matters at current volumes.

**Blocked by:** None (needs a real `ANTHROPIC_API_KEY`)

**Status:** ready-for-human

- [ ] Two real calls show a cache write then a cache read, or the ticket records why not
