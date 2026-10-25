# Spec: Finance agent in Telegram, with budgets, memory and confirmed changes

Status: ready-for-agent

## Problem Statement

The owner wants to know what they spend and stay in control of it. Today the finance agent can only tell them category or monthly totals of gross spending, on the web Ask page. It cannot show which transactions make up a total, does not count other people's shares correctly, forgets each question as soon as it answers, ignores the memories the owner has saved, and cannot fix a wrong category. The 10pm Telegram message reports the day but the owner cannot reply to it or ask anything from Telegram. There are no budgets, so nothing tells the owner when they are off track, and there is no weekly or monthly look back.

## Solution

The finance agent joins a private Telegram group with two topics. **Daily insights** receives the 10pm message (now with budget pace and warnings), plus a weekly review on Sundays and a monthly review on the 1st; replying to any of these asks the agent about it. **Ask anything** is a chat with the agent, which keeps recent conversation so follow-up questions work.

The agent learns to:

- search individual transactions and show the owner's spending (their share) next to gross spending where they differ;
- answer about income, savings and statement-dated balances, giving facts but no verdict on "can I afford it?";
- use the owner's memories, and suggest new ones that the owner confirms with a button;
- propose changes (recategorise, category rules, shares, budgets) that the owner confirms with a button, record every confirmed change in a permanent change log, show that log on request, and undo any entry without asking.

The web Ask page gets the same agent abilities, with its own separate conversation.

## User Stories

### Telegram

1. As the owner, I want a private Telegram group with a Daily insights topic and an Ask anything topic, so that daily reports and my questions stay apart.
2. As the owner, I want the 10pm message to arrive in Daily insights, so that I find it in one predictable place.
3. As the owner, I want to type a question in Ask anything and get an answer in the same topic, so that asking feels like texting.
4. As the owner, I want to reply to a Daily insights message and have the agent answer with that message as context, so that I can ask "why was Food so high?" without restating it.
5. As the owner, I want the bot to ignore everyone but me, so that nobody else added to the group can read or change my finances.
6. As the owner, I want the bot to ignore requests that did not come from Telegram, so that a leaked webhook address cannot be used to query my data.
7. As the owner, I want a "typing…" indicator while the agent works, so that I know my question was received.
8. As the owner, I want each message answered once even if Telegram re-sends it, so that I never get duplicate answers or duplicate change proposals.
9. As the owner, I want a clear short error message when the agent fails, so that I know to ask again rather than wait.
10. As the owner, I want a one-time setup script that registers the bot and prints the group and topic ids, so that connecting Telegram takes minutes.

### Conversation

11. As the owner, I want the agent to remember the last 10 exchanges in a topic, so that "and last month?" follows on from my previous question.
12. As the owner, I want the conversation to start fresh after 6 hours without messages, so that a vague question tonight is not read against yesterday's topic.
13. As the owner, I want the agent to ask what I mean when a follow-up is ambiguous after a reset, so that I get a question back instead of a confident wrong answer.
14. As the owner, I want Telegram and web conversations kept separate, so that one does not confuse the other.
15. As the owner, I want every question and answer, from both places, kept in one log tagged with where it came from, so that I can review past conversations.

### Transaction search

16. As the owner, I want to ask "what did I spend on Food this week?" and see the transactions, so that I know what is behind a total.
17. As the owner, I want to search by merchant or description text, so that I can find "all Grab rides" or "that Shopee order".
18. As the owner, I want to filter by amount range and dates, so that I can find "anything over $200 last month".
19. As the owner, I want at most 20 transactions per answer, newest first, with a total and a note when there are more, so that answers stay readable in Telegram.
20. As the owner, I want shared payments shown as "Dinner $120 (your share $40)", so that I see both what left my account and what was mine.

### Spending, income and balances

21. As the owner, I want totals to be my spending (my share) by default, so that budgets and answers reflect what I actually consumed.
22. As the owner, I want to ask for gross spending explicitly and get it, so that I can match my bank statement.
23. As the owner, I want a forgiven share to count as my spending again, so that money I let go of is not hidden.
24. As the owner, I want to ask "how much did I save this month?" and get income minus spending, so that I see whether I am getting ahead.
25. As the owner, I want income to exclude transfers between my own accounts and repayments of shares, so that savings are not inflated.
26. As the owner, I want balances always shown with their statement date, so that I never mistake an old figure for my current balance.
27. As the owner, I want "can I afford X?" answered with its budget impact, savings so far and latest dated balance but no yes or no, so that the decision stays mine.
28. As the owner, I want "this month" to mean the calendar month in Singapore time, so that it matches my statements.

### Memory

29. As the owner, I want the agent to use my saved memories when answering, so that it does not flag expected payments or forget context I explained.
30. As the owner, I want to say "remember that…" and have the agent offer to save it, so that I can teach it in conversation.
31. As the owner, I want the agent to suggest a memory when it notices a pattern, so that I do not have to think of everything.
32. As the owner, I want memory suggestions to have ✅ and ❌ buttons, so that nothing is saved without my tap.
33. As the owner, I want memories shared between Telegram and web, so that I teach the agent once.

### Changes and the change log

34. As the owner, I want to say "that $80 Shopee was a gift" and get a proposal to recategorise that transaction, so that fixing a category takes one message.
35. As the owner, I want the proposal to name the exact transaction (merchant, amount, date) and the before and after, so that I can spot a wrong match before confirming.
36. As the owner, I want ✅ and ❌ buttons on every proposed change, so that nothing changes without my tap.
37. As the owner, I want to ask the agent to add or edit a category rule, so that future transactions are categorised correctly.
38. As the owner, I want to ask the agent to mark someone's share of a payment, so that my spending reflects shared bills.
39. As the owner, I want to set or change a budget by asking ("cap Food at $500"), so that control takes one message.
40. As the owner, I want the agent to refuse to delete transactions, change amounts or dates, or touch uploads, and say so, so that a mistake cannot destroy data.
41. As the owner, I want every confirmed change recorded with what changed, before and after, when, which message caused it and whether it came from Telegram or web, so that I always know what the agent did.
42. As the owner, I want to ask "what did you change this week?" and get the list, so that I can review the agent's work.
43. As the owner, I want to say "undo the last change" or "undo #12" and have it reversed straight away, so that fixing a mistake is instant.
44. As the owner, I want the undo itself recorded in the change log, so that the log is a complete history.
45. As the owner, I want an expired or already-used confirmation button to do nothing and say so, so that tapping an old button never applies a stale change.
46. As the owner, I want the same proposals, confirmations, change log and undo on the web Ask page, so that I can use whichever is in front of me.

### Budgets

47. As the owner, I want one monthly budget per category, measured on my spending, so that I have a clear target.
48. As the owner, I want unspent budget not to roll over, so that each month starts clean.
49. As the owner, I want the 10pm message to show each budget's spending, limit, share of month gone and whether I am on track, so that I see my pace daily.
50. As the owner, I want a ⚠️ line at the top of the 10pm message when a budget passes 80% or 100%, so that warnings are the first thing I read.
51. As the owner, I want to ask "how am I doing on budgets?" any time, so that I do not have to wait for 10pm.
52. As the owner, I want categories without a budget left out of the pace section, so that the message stays short.

### Reviews

53. As the owner, I want a weekly review on Sunday at 10pm in Daily insights, so that I see the week's trend.
54. As the owner, I want a monthly review on the 1st at 10pm, so that I see how each budget ended and how the month compared.
55. As the owner, I want reviews to replace that day's daily message, so that I get one message, not two.
56. As the owner, I want reviews to show the biggest changes from the previous period, top merchants and each budget's result, so that I know where to act.
57. As the owner, I want to reply to a review and ask about it, so that I can dig into anything it shows.

## Implementation Decisions

- **Agent entry point.** The existing finance agent function is extended rather than replaced. It accepts the question plus recent conversation turns and the source (`telegram` or `web`), and keeps its dependency overrides (Claude call, clock, data access) so tests can script it. It returns the answer text and any pending proposal (a change or a memory) needing confirmation.
- **Agent tools.** The single spending-totals tool is joined by: transaction search; income and savings; balances; budget status; change log lookup; propose change; propose memory; undo. Totals use spending (the owner's share) by default with an option for gross. All tool inputs are validated as strictly as the current tool's inputs are.
- **Spending.** Spending for a transaction is its amount minus its recorded shares, with forgiven shares counted back. Reuse the existing owed-share and cash-flow classification logic so the agent, the 10pm message and the dashboard agree.
- **Instructions and prompt caching.** The agent's fixed instructions, tool definitions and memories go first in each request and are marked for prompt caching. Answers are not cached. The instructions drop the old "read-only" wording and state: changes only through proposals, never claim a change happened before confirmation, never delete or edit amounts, dates or uploads, give facts not verdicts on affordability, always date balances, and ask for clarification when a follow-up has no context.
- **Proposals.** A proposal is stored with its kind, the exact target and the before and after values, the source and the message that caused it, and a status (pending, confirmed, rejected, expired). Only the owner confirming a pending proposal applies it. Applying re-checks that the target still has its "before" value; if not, nothing changes and the owner is told. Pending proposals expire after 24 hours.
- **Allowed change kinds:** recategorise a transaction, create or edit a category rule, set a share on a transaction, set or change a budget, save a memory. Nothing else is writable by the agent.
- **Change log.** A new append-only table records each applied change: id, time, kind, target, before, after, source, the request text, and for an undo, which entry it reverses. Entries are never edited or deleted. Undo applies the entry's "before" value without confirmation, provided the target still has the entry's "after" value; otherwise it explains the conflict and changes nothing.
- **Conversation history.** The existing conversation log gains a source column and a topic key. The agent receives the last 10 exchanges from the same source and topic, only if the latest is within 6 hours.
- **Memory.** The agent reads all memories on each request. A memory suggested by the agent is saved as `inferred` after confirmation; one the owner asked for is saved as `user`.
- **Budgets.** A new table holds one monthly limit per category. Month means the calendar month in Singapore time (provisional; may change if the owner decides on pay cycles elsewhere). Pace compares the share of the budget used with the share of the month gone.
- **Telegram handler.** A new module handles one Telegram update (message or button tap) given dependencies for the agent, Telegram sending and the clock. It: ignores anything not from the owner's user id or chat; skips update ids already processed; routes Ask anything messages to the agent; routes replies in Daily insights to the agent with the replied-to message as context; turns button taps into confirm or reject of the referenced proposal; sends a typing indicator; replies in the same topic. Proposals are sent with ✅ and ❌ inline buttons.
- **Telegram webhook route.** A new public route verifies Telegram's secret-token header against a new secret, acknowledges immediately, and runs the handler after the response so slow agent runs do not trigger Telegram retries. It is added to the list of paths that skip the app password, as the cron route is.
- **Telegram sending.** The send function gains optional topic id, reply-to and inline buttons. New settings: webhook secret, owner user id, group id, and the two topic ids.
- **10pm message and reviews.** The daily summary gains budget pace lines and ⚠️ warnings at the top. The daily job decides which message to send: monthly review on the 1st, weekly review on Sundays, otherwise the daily message. All go to Daily insights. Email is still read only in this job.
- **Web Ask page.** It uses the same agent with source `web`, renders proposals with confirm and reject buttons, and keeps its own conversation history.
- **Setup script.** A script registers the webhook with its secret and prints the group and topic ids seen in recent updates.

## Testing Decisions

- Good tests check behaviour from outside the agreed entry points: what the owner would see or what ends up stored. They do not check internal function calls, prompt wording or table layout beyond what a feature needs.
- **Seam 1, the agent:** drive the finance agent with scripted Claude responses against an in-memory database seeded with transactions, shares, budgets and memories. Cover transaction search output, spending vs gross, forgiven shares, income and savings, dated balances, budget status, memory loading, proposals being stored but not applied, the change log, undo and its conflict case, refused change kinds, and history being passed or dropped by the 6-hour rule. Prior art: the existing finance agent test.
- **Seam 2, the Telegram handler:** feed it Telegram updates with a fake agent and a fake Telegram sender. Cover owner-only, unknown chats, duplicate update ids, topic routing, replies to daily messages, button confirm and reject, expired and reused buttons, typing indicator and error replies. The route's secret check gets one small test. Prior art: the payment alert ingest tests' use of fakes.
- **Seam 3, the 10pm message:** build summaries and reviews against an in-memory database at fixed dates. Cover pace lines, the 80% and 100% warnings, categories without budgets, Sunday and 1st-of-month selection, and review contents. Prior art: the existing daily message test.
- No test calls real Claude or real Telegram.

## Out of Scope

- Reading email more than once a day, and budget warnings during the day.
- An overall monthly spending cap, and rollover of unspent budget.
- Caching agent answers.
- The agent deleting transactions, changing amounts or dates, or touching uploads.
- Spending forecasts and savings goals.
- Charts or images in Telegram.
- Pay-cycle months (only if the owner decides on them elsewhere).

## Further Notes

- Suggested build order: transaction search; Telegram chat and conversation history; memory; proposals, change log and undo; budgets and the 10pm pace lines; weekly and monthly reviews; income, savings and balances.
- Terms follow the root glossary: spending, gross spending, share, forgiven share, income, savings, balance, budget, finance agent, change log, memory, topic.
- The owner must create the Telegram group, turn on topics, add the bot as an admin, and set the new settings before the Telegram parts work in production.
