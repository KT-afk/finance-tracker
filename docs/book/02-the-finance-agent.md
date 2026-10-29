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

## Ticket 25: Balances keep their statement date (2026-10-26)

**The problem.** A balance only knew when it was saved. A September statement uploaded in October looked like an October balance.

**What we built.** A new `statement_date` column (migration 0007), kept apart from `recorded_at`, the save time (lesson 14). Bank files give the date: CSV files by the row the balance comes from, PDFs by the statement's closing date. Typed-in balances use today. The newest balance is picked the same way everywhere: rows with a statement date first, because every old row was saved before them. The agent now says “as of 30 Sep”. The Accounts page shows “As of 30 Sept”.

**Found in review.** Codex reviewed three times. It caught PDF balances dated by their last transaction (UOB's closes on 27 Sep, its last payment was 14 Sep), the trend chart picking balances in a different order, a fallback that turned credit cards into savings on an older database, the Accounts page still showing the save time, and the cloud copy dropping the new column. All are fixed.

**Before deploying.** Run migration 0007 on the live database (`npm run db:migrate`, chapter 3 lesson 1), and on the cloud database before the next `db:copy-cloud`.

## Ticket 05: Ask anything in Telegram (2026-10-27)

**The problem.** The owner could only ask the agent questions on the web page.

**What we built.** A Telegram webhook. When the owner writes in the **Ask anything** topic of their private group, the bot shows “typing…”, asks the finance agent, and answers in the same topic. It checks Telegram's secret header, ignores anyone else and any other chat or topic, and answers each message once even if Telegram sends it again (a new `telegram_updates` table remembers the ids). It replies to Telegram at once and runs the agent afterwards, so a slow answer does not make Telegram retry. Telegram has its own conversation history, apart from the web. `npm run telegram:setup` prints the group and topic ids and registers the webhook.

**Found in review.** Codex found that answers over 4,096 characters would be refused by Telegram, so long answers are now split. It also found that an odd secret could crash the check instead of being refused.

**How we checked.** Tests with a fake agent and a fake Telegram: owner-only, other chats and topics ignored, repeated update not answered twice, follow-up history, history kept apart from the web, a short error message on failure, and a fresh start after 6 quiet hours. The secret check and message splitting have their own test. Nothing has talked to the real Telegram yet: that needs the owner's bot (see the ticket's owner steps).

## Ticket 06: Daily insights and replies (2026-10-27)

**What we built.** The 10pm message now goes to the **Daily insights** topic in your Telegram group. Reply to it, for example “why was rent so high?”, and the agent answers in that topic, knowing which message you replied to. You can also just ask a question there. Daily insights keeps its own conversation, separate from Ask anything.

**Until Telegram is set up,** the 10pm message still goes to your own chat, as before. Nothing changes until the group settings exist.

**How we checked.** Handler tests send fake Telegram updates: a reply, a plain message, a reply to a photo, and a message before the topic is set up. A test of the real daily job fakes Telegram and checks where the message lands; it fails on the old code.

**Surprise.** In a topic, Telegram marks every message as a reply to the topic's first message. See chapter 3, lesson 16.

## Ticket 27: Long answers no longer fail (2026-10-27)

**The problem.** The first real Telegram questions worked, but “What was I spending so much on in May, June and April?” got “Sorry, I couldn't answer that”. The agent could only write about 900 words and look things up four times. A three-month question needs more, and running out failed the whole answer.

**What we built.** More room (about 3,000 words) and eight lookups. If an answer still runs out, you get what was written, marked “cut short”, instead of an error. The agent is also told to keep answers short and to skip Markdown, because Telegram showed `**` as typed.

**How we checked.** Agent tests: a cut-off answer is sent with the note, a cut-off answer with no text still fails, the agent gets eight lookup rounds, and the instructions ban Markdown. We could not see the real error, because Vercel's logs are out of reach, so the real check is asking the same question again.

## Ticket 07: Proposed changes and the change log (2026-10-27)

**The problem.** The agent could only read. Fixing a wrong category meant opening the Transactions page.

**What we built.** Say “that $80 Shopee was a gift”. The agent finds the payment and **proposes** a change: “Shopee $80 on 6 Sept 2026: Shopping → Personal”, with ✅ Confirm and ❌ Reject. In Telegram these are buttons under the message; on the web Ask page they are buttons on a card. Nothing changes until you confirm. Every confirmed change is written to the new **change log**, which is never edited or deleted (ticket 09 will let you read it and undo).

A button does nothing, and says so, when:

- the proposal is older than 24 hours;
- it was already confirmed or rejected (so a double tap only counts once);
- the payment's category changed since the proposal.

**How we checked.** A database test proposes, confirms, rejects, double-taps, waits 24 hours and changes the payment underneath. Agent and Telegram tests cover the new tool and the buttons. In the browser, the Ask page shows the card and its buttons call the real server. The whole browser suite passed: 60 passed, 3 skipped.

**Found in review.** Three fixes before merging. If the payment's category changed in the split second between the check and the save, confirming would have overwritten it; now the save itself requires the old category, and saves the change and its log row together or not at all. If saving failed after it had in fact worked, a second tap could have applied it twice; now it only offers a retry when nothing was saved. On the web, an error hid the buttons for good; now they stay so you can try again. Clean-ups went to ticket 28.

**Surprise.** Our first version wrapped the decision in a database transaction. Two taps at once then made the second one wait and fail with “database is locked”. Now one statement claims the proposal, and the change and its log row are saved together.

## Ticket 29: Fonts live in the repo (2026-10-27)

**The problem.** After #31 merged, the live site didn't update: Vercel's build failed because it couldn't download the IBM Plex fonts from Google that time. The site kept running the previous version.

**What we built.** The two fonts are now files in `app/fonts`, with their free licence, and the app loads them from there. The site looks the same, and builds no longer need Google.

**How we checked.** We built the old and new code with the internet cut off. The old code failed with the same error as Vercel; the new code built.

## Ticket 08: The agent can remember things (2026-10-27)

**The problem.** You told the bot “that $1,277 transfer was my wedding ring”, and it had to say it couldn't remember that.

**What we built.** Now it offers: “Remember: The $1,277 transfer to Yoon Thiri on 8 Jun 2026 was my wedding ring”, with ✅ and ❌. It does the same when you say “remember that…”. Tap ✅ and it's saved, and the change log records it; after that, the agent uses it in every answer. It's saved as yours if you asked, or as the agent's suggestion if it noticed. Using the same short name again replaces the old memory, and the offer tells you what it replaces.

**Found in review.** The save could overwrite a memory changed at the same moment, the same kind of race we fixed in ticket 07 (lesson 22); now the save itself checks. Older memories with capitals (“Rent”) would have been duplicated instead of replaced; now names are compared without case.

**How we checked.** Database tests: a new memory, a replacement, yours versus suggested, reject, a memory changed or deleted meanwhile, an older memory with capitals, and refusals (no name, too long, already remembered). Agent tests: the tool, its strict input, and instructions that never say “saved” before you confirm.

## Ticket 30: Notes on payments (2026-10-27)

**The problem.** A memory only helps if the agent connects it to your question. “Why was June so high?” might not bring up a memory about a ring.

**What we built.** A fact about one payment now goes on the payment itself, as your **note**. Say “that $1,277 transfer was my wedding ring” and the agent offers: “Note on YOXX THIXX $1,277 on 8 Jun 2026: Wedding ring”, with ✅ and ❌. Once saved, the note comes back with that payment in every lookup, as “(your note: Wedding ring)”, so the agent can't miss it. Searching for “ring” finds it too, and the Transactions page shows it under the payment. General facts (“rent is split with Jane”) are still memories.

Also: if your memories ever fail to load, the answer now ends with “(I couldn't load your saved memories for this answer.)”, instead of quietly answering without them.

**How we checked.** Database tests for proposing, confirming, replacing, rejecting and a note changed meanwhile. A search test: the note comes back, shows in the line, and “ring” finds it. Agent tests for the new tool and the memory notice. In the browser, the Transactions page shows the note. The full browser suite passed: 62 passed, 3 skipped.

## Ticket 09: Reading the change log and undo (2026-10-27)

**What we built.** Ask “what did you change this week?” and the agent lists each change: its number, what changed (“Shopee $80 on 6 Sept 2026”, or a memory's name), from what to what, and when. Say “undo the last change” or “undo #12” and it's undone straight away, with no button, because undoing only puts things back. The undo is written in the change log too, pointing at the change it reversed. Nothing in the log is ever edited or deleted. Undoing an undo puts the change back.

**When undo refuses.** If something changed the same thing since (for example, you recategorised the payment again by hand), the undo changes nothing and says what it is now.

**Found in review.** Three fixes. “Since 27 Oct” started at 8am Singapore time; now it starts at midnight (lesson 24). Saying “undo the last change” twice would have redone the first change; now it undoes the next one. And because undo has no button, a Telegram reply that quotes someone else's message can't trigger an undo: you need to ask in your own words.

**How we checked.** A database test makes four real changes through proposals (a category, a note, a new memory and a replacement), lists them, and undoes each kind, including twice, after a change elsewhere, and an undo of an undo. It also checks that the first four entries are untouched at the end. Agent tests cover the two tools and their strict input.

## Ticket 10: Rules and shares from chat (2026-10-27)

**What we built.** Two more things you can set by asking, each with ✅ and ❌, recorded in the change log, and undoable:

- **Category rules.** “Always put Grab in Transport” offers: “Rule: payments containing ‘grab’ go to Transport (2 past payments match; they keep their categories)”. Rules sort future uploads. To fix past payments, the agent offers to recategorise them one by one.
- **Shares.** “Jane owes me $40 of that dinner” offers: “Share: Jane owes $40 of SUSHI TEI $120 on 5 Sept 2026”. Once confirmed, your spending counts only your $80, and Jane shows in Owed to you, exactly as if you'd split it in the app. The same checks apply: only money you paid from a bank, and not more than the payment.

**How we checked.** A database test proposes, confirms, replaces and undoes rules and shares, checks a share lowers Food spending from $140 to $100 and undo brings it back, a share changed meanwhile, and the app's checks (income, a hand-entered row, too much, nothing). Agent tests cover both tools and their strict input.

## Ticket 11: Budgets (2026-10-27)

**What we built.** Say “cap food at $500” and the agent offers “Budget: Food & Drink $500 a month”, with ✅ and ❌. Changing one says what it replaces. Like every change it's in the change log and can be undone. Ask “how am I doing on my budgets?” and the agent gives each budget's spending, limit, what's left, and pace:

- **on track:** you've used less of the budget than of the month
- **ahead of pace:** you've used more of the budget than of the month (60% used on the 15th)
- **over budget:** you've spent more than the limit

Spending is your share, as everywhere. Budgets run by calendar month, the 1st to the last day, in Singapore time, as you chose. Nothing rolls over. Categories without a budget aren't listed. Only spending categories can have one (not Income or Transfer).

**How we checked.** A database test sets two budgets, checks spending counts only your share and only this month, the three paces, a change and its undo, an undo refused because the budget changed since, October starting clean, and the refusals. Agent tests cover both tools.

## Ticket 12: Budget pace in the 10pm message (2026-10-28)

**What we built.** When you have budgets, the 10pm message ends with a Budgets section: the day of the month, how much of the month is gone, and one line per budget, such as “⚠ Food & Drink: $140 of $150 (93%) · ahead of pace”. Each line has the words as well as ✅ or ⚠. A budget at 80% or more also gets a warning line at the very top (“Food & Drink budget 93% used: $10 left of $150”), and at 100% it says “used up” or “over by $X”. With no budgets, the message is the same as before.

**How we checked.** The daily message test adds three budgets (on track, at 93%, and at 100%) and checks the warnings, the section, an over-budget line, and a message with no budgets.

## Ticket 32: Easier budget changes (2026-10-28)

**What you asked for.** Changing a budget took a chat message and a tap each time, and there was no way to remove one.

**What we built.**

- **A Budgets page** in the app (in the menu). Each budget shows what you've spent, the limit, a bar with a mark for how much of the month is gone, and the pace in words. Type a new limit and press Save, press Remove… (it asks first), or add a budget for another category. Changes from the page go through the same checks as chat, are applied straight away because you're the one asking, and are in the change log, so “undo the last change” in Telegram still works.
- **Remove by chat.** “Remove my food budget” offers “Budget: remove Food & Drink (was $200 a month)”, with ✅ and ❌. Undo puts it back, unless you've set a new one since.
- **Several at once.** “Food 500, Transport 150, Shopping 300” gives one proposal per category, each with its own buttons.

**How we checked.** Database tests for removal, undo of a removal (and a second undo refused), and the page's API. Agent tests for removing. A browser test adds, changes, reloads and removes a budget on the page. Phone width checked: no sideways scrolling.

**Review fixes (2026-10-28).** If saving from the Budgets page fails partway, its proposal is now rejected, so it can't sit pending and be applied later by a tap in chat. Each budget's box shows the latest limit, even one changed from Telegram. The page asks before you leave with an amount you haven't saved, and moves focus to the box when it shows an error. The 10pm warnings use the ⚠️ emoji. A test now shows that one message setting two budgets gives two proposals, each with its own buttons. The spec now records the Budgets page exception (pressing Save is your confirmation) and budget removal.

## Ticket 13: Weekly and monthly reviews (2026-10-28)

**What we built.** One message a night, chosen by the Singapore date:

- **The 1st:** the monthly review, in place of the daily message (before, you got both). It's the monthly recap you already had, plus how the month compared with the one before (“September: $2,400 (+$1,420 this month)”) and how each budget ended (“✅ Food & Drink: $530 of $600 (88%) · within budget, $70 left”). Budget results use today's limits, because limits don't keep a history.
- **Sundays:** the weekly review. Monday to Sunday against the week before: the total, up to three groups that changed by $20 or more, the top three merchants, and the budget pace for the month so far, with the 80% and 100% warnings at the top.
- **Other days:** the daily message, as before.

Problems reading your email still lead whichever message goes out. Replying to a review works like replying to the daily message: the agent gets the review as context.

**How we checked.** A test picks the message for a weekday, a Sunday, the 1st, and the 1st when it is a Sunday. A weekly review test checks the week's dates, totals, changes, merchants and budget pace. The monthly test checks last month's total and budget results. The endpoint test checks that a review day sends one message, led by warnings, without the daily part.

## Ticket 28: Tidying the proposals code (2026-10-28)

**What changed for you.** One thing: deleting a memory on the Ask page now goes in the change log, so “undo the last change” in Telegram brings it back. Before, it just vanished.

**What changed inside.** The proposals file had grown to 1,345 lines. It is now three: the rules for proposing and confirming changes, the tools the agent calls, and how payments, shares and budgets are named to you. Shared lists (the two “owed” categories, where a memory came from) and shared types now have one definition each, so they can't drift apart. A new test forces a category change in the split second between the check and the write, and shows the write refuses it.

**How we checked.** All tests pass unchanged, plus the new race test and a forget-then-undo test.

## Ticket 33: Savings review (2026-10-28)

**What you asked for.** “Can it tell me how much I can save and what to cut out and the average.”

**What we built.** A new lookup for the agent, the savings review. In one go it gets:

- your average monthly income, spending and savings over the last 3 months (or 6 if you ask), and how much of your income you keep. This month isn't counted, because it isn't over. Months before your data starts are left out, so they don't drag the averages down.
- each category's monthly average next to this month so far, and what this month is on pace for. A category is flagged when it's clearly above its average (20% and $30 or more).
- which costs are fixed (rent, bills) and which you choose, and the top places your money goes in each.

Ask “what should I cut?” and the agent suggests two or three specific cuts, each with a dollar amount and what it would add to your savings a month, and offers to set a budget. It doesn't tell you what you must do; the choice is yours, as with “can I afford this?”.

**How we checked.** A database test with three ordinary months and a busy October: the averages, the savings rate, your share of a shared dinner, rent not counted as “above average” because it's paid on the 1st, food flagged, six months asked for when only three have data, and January looking back into the year before. Agent tests cover the tool, its strict input, and a failure that doesn't read as zero.

## Ticket 34: “I've proposed…” with no buttons (2026-10-29)

**What happened.** You asked to split the $3,000 rent in May with your wife. The agent answered “I've proposed that your wife owes $1,500… Just tap to confirm”, but no buttons came. Nothing had been proposed: the database had no proposal from that morning. The AI said it had done something it hadn't (most likely its attempt was refused because it used the wrong payment id, and it didn't say so).

**What we changed.** The code now checks the AI's words against what really happened. If an answer talks about a proposal and none was stored, it ends with “(Nothing was actually proposed, so there are no buttons and nothing changed. Please ask again.)”, plus the reason when the attempt was refused. The AI's instructions also say plainly to report a refusal instead of claiming success.

**How we checked.** Agent tests: a claim with no attempt, a claim after a refused attempt, and a real proposal, which gets no notice.
