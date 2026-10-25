# 04: Agent uses memory

**Phase:** A

**What to build:** The finance agent reads the owner's saved memories on every question and takes them into account, for example not flagging a payment the owner said is expected. The agent's fixed instructions, tools and memories are marked for prompt caching to cut cost and speed up answers.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Every agent request includes all saved memories
- [x] An answer respects a memory (e.g. an expected payment is not called unusual)
- [x] Fixed instructions, tools and memories are marked for prompt caching; the question and history are not
- [x] With no memories saved the agent still answers normally
- [x] Agent tests check memories reach the request and the caching markers are present

Spec: `.scratch/finance-agent/spec.md`
