# 05: Ask anything in Telegram

**Phase:** B

**What to build:** The owner types a question in the Ask anything topic of their private Telegram group and the finance agent answers in that topic, with a typing indicator while it works. The webhook checks Telegram's secret token, ignores anyone but the owner, answers each update once, replies to Telegram immediately and runs the agent afterwards. A setup script registers the webhook and prints the group and topic ids. Telegram conversations are kept separate from web ones.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Requests without the correct secret token are rejected
- [ ] Messages from anyone but the owner, or from other chats, are ignored
- [ ] A repeated update id is not answered twice
- [ ] Questions in Ask anything are answered in the same topic, with a typing indicator
- [ ] Follow-up history works per topic and is separate from the web
- [ ] An agent failure sends a short error message
- [ ] The setup script registers the webhook and prints group and topic ids
- [ ] Telegram handler tests use a fake agent and fake sender

Spec: `.scratch/finance-agent/spec.md`

## Comments

Triage (2026-10-25): ready for agent; ticket 03 is resolved so this is unblocked. The agent builds the handler, webhook route and setup script with tests. The owner must create the bot, the group and its two topics, set the new secrets and run the setup script; the agent should list those steps in the ticket when done.
