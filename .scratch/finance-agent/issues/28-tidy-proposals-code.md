# 28: Tidy the proposals code

**Phase:** C

**Priority:** P3

**What to build:** Clean-ups found in code review of ticket 07. No change in behaviour. Natural to do with ticket 09 or 10, which add change kinds.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] One `Proposal` type (`{ id, summary }`) and the `Decision` type are imported everywhere instead of being written out in `app/ask/page.tsx`, `app/api/proposals/[id]/route.ts`, `lib/telegram-handler.ts` and `lib/agent/run-finance-agent.ts`
- [ ] `sendTelegramTo` uses the `TelegramButton` type
- [ ] The owed-only categories ("Repayment", "Paid by Others") are one export in `lib/schema.ts`, used by `lib/agent/proposals.ts` and `lib/categorize.ts`
- [ ] `lib/agent/proposals.ts` splits into rules (propose/decide), the agent tool and its parser, and display formatting
- [ ] The four `if (!(await settle(...))) return lost` guards in `decideProposal` become one status → message map
- [ ] A test forces a category change between `decideProposal`'s check and its write (the write itself refuses it; only this path is untested)
- [ ] One `currentMemory(key)`-style helper for the memory lookups in `proposeMemory` and `applyMemory` (from ticket 08 review)
- [ ] `memory_source` reuses an exported `MEMORY_SOURCES` beside `aiMemory` in `lib/schema.ts` (from ticket 08 review)
- [ ] Deleting a memory from the Ask page (`DELETE /api/memory/[id]`) is not recorded in the change log; decide whether it should be (from ticket 08 review)
