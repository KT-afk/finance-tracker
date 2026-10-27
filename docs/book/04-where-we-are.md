# Chapter 4: Where we are

This chapter is the hand-over note. It says what is done, what is next, and what to watch out for. Update it at the end of each working session, so the next session (on any computer, with any account) can start from here.

Last updated: 2026-10-26, on branch `ticket-23-e2e-fixes`.

## Done

- Finance agent tickets 01, 02, 03, 04 and 15 (see chapter 2).
- Safety tickets 22 (test setup can't touch the live database) and 24 (security headers).
- All tickets triaged. Review findings filed as backlog tickets with priorities.
- Four pstack skills added: `/create-verification-skill`, `/maintain-verification-skill`, `/correct`, `/reflect` (see chapter 1).
- Code-review plugins enabled on the owner's account: Anthropic `code-review`, `codex-review`, `codex-dispatch`. The Codex ones need the `codex` CLI and a login.
- Pull request #24 merged the finance agent branch into `main`. The merged code passed the type check and the unit tests first.
- Ticket 23: all browser tests pass, and the `verify-finance-tracker` skill runs the app safely (see chapter 2).
- pstack skills are global, with Codex reviews at low effort (pull request #25).
- Ticket 25: balances keep their statement date. Migration 0007 is applied to the cloud database (2026-10-27).
- Ticket 14: the agent answers about income, savings and balances (see chapter 2).
- Ticket 05: ask the agent from Telegram (needs migration 0008 and the owner's setup).
- Migration 0006 is already applied to the live database (see chapter 3, lesson 1). The next deploy needs it, so nothing to do.

## Next, in order

1. **Merge pull request for ticket 05**, then the owner follows the steps at the end of `.scratch/finance-agent/issues/05-telegram-ask-anything.md` (bot, group, migration 0008, setup script, Vercel settings).
2. **Ticket 06:** Daily insights topic (the 10pm message moves to the group).
3. **Ticket 21 (owner):** check prompt caching with a real `ANTHROPIC_API_KEY`.

Backlog clean-ups (P2 and P3) are in `.scratch/finance-agent/issues/`. Do P3 ones when you next touch that code.

## Open questions for the owner

- Ticket 11 (budgets) uses calendar months. Change it if you would rather use pay cycles.
- Ticket 19 defaults: remove the unused `/api/agent` route, and widen "Topic" in `GLOSSARY.md`. Overrule before it is picked up if you disagree.
- A card payment to Railway ($6.37 on 2026-05-06) appears in a bank statement used by a test. Check for an old Railway plan still charging you.

## Starting on your own computer

```bash
git fetch origin
git checkout main
npm install
```

Then start Claude Code and say: "Read `docs/book/` and carry on from chapter 4."

Before running any database command, check `.env.local`. If it sets `TURSO_DATABASE_URL`, you are pointing at the live database (chapter 3, lesson 1).
