# Chapter 4: Where we are

This chapter is the hand-over note. It says what is done, what is next, and what to watch out for. Update it at the end of each working session, so the next session (on any computer, with any account) can start from here.

Last updated: 2026-10-27, in a cloud session on branch `ccr-f84f8aa4-x0x6n3` (after ticket 29).

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
- Ticket 05: ask the agent from Telegram (pull request #29, merged). Migration 0008 is applied to the live database (checked 2026-10-27). The setup script ran on 2026-10-27 and registered the webhook at `https://finance-tracker-latest-xi.vercel.app/api/telegram`. Ids: `TELEGRAM_GROUP_ID=-1004480176355`, `TELEGRAM_INSIGHTS_TOPIC_ID=3`, `TELEGRAM_ASK_TOPIC_ID=4`, `TELEGRAM_OWNER_ID=730041802`. **Live since 2026-10-27 09:55 SGT:** the Vercel settings are in and the SpendingInsights bot answers in Ask anything.
- Ticket 27: long answers no longer fail (more room, eight lookups, “cut short” instead of an error).
- Ticket 06: the 10pm message goes to Daily insights, and replies there are answered with the message as context. Same setup as ticket 05; nothing extra.
- Ticket 07: the agent proposes category fixes with Confirm and Reject, and confirmed changes go in the change log. Ticket 17 (no more “read-only”) is done with it. **Confirmed working in Telegram by the owner on 2026-10-27.**
- Ticket 08: the agent offers to remember facts; saved only on ✅, logged in the change log. Migration 0010 applied 2026-10-27.
- Ticket 30: notes on payments (migration 0011), so facts about one payment come back with it in every lookup; the answer says so when memories fail to load.
- Ticket 09: ask what changed, and undo (“undo the last change”, “undo #12”). No migration.
- Tickets 10 and 11 (PR #36, merged): category rules, shares and monthly budgets from chat. Migration 0012 is applied to the live database (13 migrations recorded).
- Ticket 29: fonts are bundled, so builds don't need Google (a font download failure broke the deploy of #31).
- Migration 0006 is already applied to the live database (see chapter 3, lesson 1). The next deploy needs it, so nothing to do.

## Next, in order

1. **Check:** ask “What was I spending so much on in May, June and April 2026” in Ask anything to check ticket 27, and reply to tonight's 10pm message in Daily insights to check ticket 06.
2. **Owner:** remove the spare bot (AskAnythingBotForFinance) from the group, and remove `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` from the cloud environment's settings if no longer needed.
3. **Next ticket:** 12 (budget pace in the 10pm message), then 13 (weekly and monthly reviews).
4. **Ticket 21 (owner):** check prompt caching with a real `ANTHROPIC_API_KEY`.

Backlog clean-ups (P2 and P3) are in `.scratch/finance-agent/issues/`. Do P3 ones when you next touch that code.

## Open questions for the owner

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
