# Chapter 2: The finance agent

The **finance agent** is the AI helper on the Ask page. You ask it about your money. It looks up the facts with **tools** (small functions it can call) and answers in plain text.

The plan for it is in `.scratch/finance-agent/spec.md`. This chapter follows the work ticket by ticket.

## Ticket 01: Totals use your spending (2026-10-25)

**The problem.** When a friend owes you part of a dinner, the agent still counted the whole dinner as yours.

**What we built.** The agent now counts only your part. A $120 dinner where a friend owes $80 counts as $40. If you **forgive** a share (let it go), that money counts as yours again. You can still ask for **gross** spending, which means the full amounts that left your bank.

**How.** The agent now uses the same calculation as the dashboard (`classifyCashFlow` in `lib/cash-flow.ts`). One calculation means the two always agree.

**Found in review.** Gross spending was counting a forgiven share as money that left your bank. It never did. We fixed it.

## Ticket 15: The agent agrees with the 10pm message (2026-10-25)

We checked that the agent and the 10pm Telegram message give the same totals. They already did, because both use the same calculation. We added a test so they stay the same.

## Ticket 02: Transaction search (2026-10-25)

**What we built.** You can ask which payments are behind a number. Search by shop name, category, amount or dates. The agent lists up to 20 payments, newest first. Shared payments show both amounts, like "SUSHI TEI $120 (your share $40)". You get your total and the full total, and the agent says how many more payments matched.

**Found in review.** The result had no full-payment total, and the agent was not told the totals cover every match. We fixed both. Clean-ups went to ticket 18.

## Ticket 03: Follow-up questions (2026-10-25)

**What we built.** The Ask page now remembers the conversation. You can ask "and last month?" and the agent knows what you mean. It sees your last 10 questions and answers. After 6 hours with no messages, it forgets and starts fresh. If a question needs context it does not have, it asks you what you mean.

Each saved question now records its **source** (web or Telegram) and its **topic** (which conversation). Web and Telegram will keep separate memories.

**Found in review.** The list of past questions on the Ask page would also have shown Telegram messages, once Telegram exists. We fixed it. Other gaps went to tickets 19 and 20.

## Ticket 04: The agent uses your memories (2026-10-25)

**What we built.** You can save **memories**: facts the agent should keep in mind, like "the gym payment is expected". The agent now reads all of them before every answer.

We also turned on **prompt caching**. The parts of the request that rarely change (instructions, tools and memories) are saved by the AI service, so later questions are cheaper and faster. The date and your question come after the cached part, so they do not break it.

**Found in review.** If memories failed to load, every question failed. Now the agent logs the problem and answers without them. We could not prove the cache really works without a real API key, so ticket 21 asks the owner to check.

## Triage and the full check (2026-10-25)

All remaining tickets were triaged and are `ready-for-agent`, except ticket 21, which needs the owner.

We then ran the whole app with its browser tests. All 8 Ask page tests passed. 17 other tests failed, but they failed in exactly the same way before this work started. See chapter 3 and ticket 23.

## Ticket 24: Security headers (2026-10-25)

**The problem.** The app sent no security headers. Another website could load it in a hidden frame and trick you into clicking its buttons. This is called **clickjacking**.

**What we built.** Every response now tells the browser: never show this app inside another site's frame, don't guess file types, and don't leak full page addresses to other sites. The headers live in `next.config.ts`.

**How we checked.** We built the app, started it on a test database and read the headers on a page, a redirect and an API reply. The browser test for headers now passes.

**Also found.** Of the four failing security tests, only this one was a real gap. Login lockout and rate limiting both work; their tests were wrong. Those notes are on ticket 23.

## Ticket 22: Test setup can't touch the live database (2026-10-25)

**The problem.** Earlier today, `npm run db:setup-demo` changed the live database by mistake (see chapter 3, lesson 1).

**What we built.** A small guard, `scripts/require-local-db.mjs`, now runs first. If a remote database is set, it stops before anything else runs and says which setting to remove. To change the live database on purpose, there is a separate command: `npm run db:migrate`.

**How we checked.** A test runs the guard with and without the remote settings. We also ran `db:setup-demo` in this environment, which has the live database set. It stopped with a clear message and changed nothing.

## Ticket 23: All browser tests pass (2026-10-26)

**The problem.** 17 browser tests had failed since before the finance agent work. On the owner's Mac, 21 failed.

**What we found.** One cause hid most of the others. The lockout test enters wrong passwords until the app locks out. Every test shared one login "client", so all the tests after it were locked out too. Once each test had its own client, the tests behind it showed their own mistakes: a hard-coded password, a button looked up by an old name, rate-limit tests that never logged in, a text check that also matched the AI insight, and a test for a bar chart the owner removed in July.

**What we built.** Each test now sends its own client name (`tests/e2e/fixtures.ts`), and the tests above were fixed. The bar-chart test was deleted; a test for the "6-month summary" replaces the chart check. We also added a `verify-finance-tracker` skill. It starts the app from a copy of the code on a fresh demo database and port 3100, so it never touches the owner's real data or the always-on app.

**How we checked.** A full run on a fresh demo database: 58 passed, 3 skipped, 0 failed. Codex reviewed the change. Its one finding (a `/tmp` path check) was wrong: the check matches part of the path and passed in the real run.

## Ticket 14: Income, savings and balances (2026-10-26)

**The problem.** The agent could only talk about spending. It could not say what came in, what was saved, or what is in the bank.

**What we built.** Two new tools. `query_cash_flow` gives income, spending and savings (income minus spending) for a period. Income uses the dashboard's rules, so a transfer from your own account or a friend paying back a share is never income. Spending comes from `query_spending`, so the two tools never disagree. `get_balances` gives the latest balance of each account with the day it was recorded. For “can I afford X?”, the instructions tell the agent to give the facts (spending in that category this month, savings so far, dated balances) and never a yes or no.

**Found in review.** Codex found that balances carry the upload time, not the statement date. We tried storing the statement's last transaction date instead, but Codex showed that this mixes two meanings in one column: old rows would hide newer uploads on the dashboard. We undid it. The agent now says “recorded 30 Sep” and that the statement may be older. Ticket 25 adds a proper statement date.

**How we checked.** A test with a real database: salary counts, an own-account transfer and a repayment don't; savings is income minus spending; spending matches `query_spending`; balances are the latest per account with their date. The agent test checks the new tools are offered, bad input is refused, failures don't leak or read as zero, and the instructions forbid a yes or no.
