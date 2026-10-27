# 05: Ask anything in Telegram

**Phase:** B

**What to build:** The owner types a question in the Ask anything topic of their private Telegram group and the finance agent answers in that topic, with a typing indicator while it works. The webhook checks Telegram's secret token, ignores anyone but the owner, answers each update once, replies to Telegram immediately and runs the agent afterwards. A setup script registers the webhook and prints the group and topic ids. Telegram conversations are kept separate from web ones.

**Blocked by:** 03

**Status:** resolved

- [x] Requests without the correct secret token are rejected
- [x] Messages from anyone but the owner, or from other chats, are ignored
- [x] A repeated update id is not answered twice
- [x] Questions in Ask anything are answered in the same topic, with a typing indicator
- [x] Follow-up history works per topic and is separate from the web
- [x] An agent failure sends a short error message
- [x] The setup script registers the webhook and prints group and topic ids
- [x] Telegram handler tests use a fake agent and fake sender

Spec: `.scratch/finance-agent/spec.md`

## Comments

Triage (2026-10-25): ready for agent; ticket 03 is resolved so this is unblocked. The agent builds the handler, webhook route and setup script with tests. The owner must create the bot, the group and its two topics, set the new secrets and run the setup script; the agent should list those steps in the ticket when done.

Resolved (2026-10-27): `lib/telegram-handler.ts` handles one update with injected agent and sender; `app/api/telegram/route.ts` checks the secret-token header, answers 200 at once and runs the handler with `after()`; `/api/telegram` skips the app password, like the cron route. Seen update ids live in a new `telegram_updates` table (migration 0008). Long answers are split under Telegram's 4,096-character limit. Replies in Daily insights are left for ticket 06.

Setup run (2026-10-27): `npm run telegram:setup` registered the webhook at `https://finance-tracker-latest-xi.vercel.app/api/telegram`. Use `TELEGRAM_GROUP_ID=-1004480176355`, `TELEGRAM_INSIGHTS_TOPIC_ID=3`, `TELEGRAM_ASK_TOPIC_ID=4`, `TELEGRAM_OWNER_ID=730041802`. The script also printed `-5301050001`, the group's old id from before Topics turned it into a supergroup; ignore it. It printed `GroupAnonymousBot` (1087968824) too, because one message was sent as an anonymous admin; such messages are ignored, so post as yourself. Steps 1–6 are done (5: migration 0008 was already on the live database).

Live (2026-10-27 09:55 SGT): Vercel settings set; the SpendingInsights bot answered three questions in Ask anything, including two Telegram had held while the app refused them. Steps 7 and 8 are done.

## Owner steps

1. In Telegram, message @BotFather: `/newbot`, pick a name. Copy the token.
2. Create a group, open its settings and turn on **Topics**. Create two topics: **Daily insights** and **Ask anything**.
3. Add the bot to the group and make it an admin. In @BotFather, `/setprivacy` → your bot → **Disable**, so it can read messages in the group.
4. Send any message in each topic.
5. ~~Run migration 0008 on the cloud database~~ Done: all 9 migrations are applied on the live database (checked 2026-10-27).
6. On your Mac, with `TELEGRAM_BOT_TOKEN`, `APP_URL` and a new `TELEGRAM_WEBHOOK_SECRET` (letters, digits, `_`, `-`) set: `npm run telegram:setup`. It prints the group id, topic ids and your user id, and registers the webhook.
7. In Vercel, set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_OWNER_ID`, `TELEGRAM_GROUP_ID`, `TELEGRAM_ASK_TOPIC_ID` and `TELEGRAM_INSIGHTS_TOPIC_ID`, then redeploy.
8. Ask a question in **Ask anything**.
