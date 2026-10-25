# 19: Close the gaps around conversation history

**Phase:** A

**Priority:** P2

**What to build:** Gaps found in code review of ticket 03. None give wrong answers today, but each will confuse the owner or a later ticket.

**Blocked by:** None (can start immediately)

**Status:** needs-triage

- [ ] The Ask page shows where the agent's memory of the conversation resets (6 hours without messages), so old messages on screen don't look like context the agent still has
- [ ] `app/api/agent/route.ts` either saves its questions and answers to the conversation log (spec story 15) or is removed if nothing uses it
- [ ] GLOSSARY.md covers the new words: "Topic" currently means a Telegram topic only, but the web Ask page now uses topic `ask`; "history" is listed under Avoid (for the change log) but names recent conversation in code. Update the glossary or rename
- [ ] A scripted agent test runs a vague follow-up with no history and checks the instructions ask for clarification
