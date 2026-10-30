# Chapter 3: Lessons

Things that surprised us or went wrong, and how to avoid them next time. The newest lessons are at the bottom.

## 1. This environment points at the live database

**What happened.** On 2026-10-25 we wanted a throwaway test database. We ran `npm run db:setup-demo`. But the environment had `TURSO_DATABASE_URL` set. That points at the **live** database (the real one the app uses). The first step, `drizzle-kit migrate`, changed the live database. It added two new columns. (A **migration** is a script that changes the shape of the database.)

No data was lost. The next deploy needed those columns anyway. But a test command must never touch the live database.

**How to avoid it.** Before any database command, remove these settings:

```bash
env -u TURSO_DATABASE_URL -u TURSO_AUTH_TOKEN -u DATABASE_URL -u DATABASE_AUTH_TOKEN \
  FINANCE_DB_PATH=/path/to/test.db npm run db:setup-demo
```

Since ticket 22, `db:setup-demo` refuses to run when either setting is set. To change the live database on purpose, use `npm run db:migrate`.

## 2. Browser tests need the pre-installed browser

The project pins Playwright 1.61.1. (Playwright drives a real browser for tests.) The browser in this cloud environment is a different version. Tell Playwright where it is with `launchOptions.executablePath: "/opt/pw-browsers/chromium"`. You can do this in a temporary config file, so the repo does not change.

## 3. 17 browser tests already fail

A red browser test run is not always your fault. 17 tests failed before the finance agent work began. Compare against the old commit before you blame your change. Ticket 23 lists them and will fix them.

## 4. `next build` changes `tsconfig.json`

Building the app rewrites `tsconfig.json`. This is not real work. Undo it with `git checkout -- tsconfig.json` and do not commit it.

## 5. Format only the files you changed

Run Prettier (the code formatter) on single files, not whole folders. Some old files, such as the browser tests, are not formatted. Formatting a whole folder changes them all and fills the commit with noise.

## 6. Every commit already runs the tests

The pre-commit hook runs the type check and the full test suite. If a commit goes through, the tests passed. You do not need to run them twice.

## 7. Watch your quotes in long strings

The agent's instructions live in one long string with straight double quotes around it. A straight `"` inside it ends the string early and breaks the code. Use curly quotes (“ ”) inside the text. The repo's style rules prefer them anyway.

## 8. Tests can prove the code, not the AI's words

Tests use a scripted fake AI. They can check what we send to the AI (the right tools, memories and history). They cannot check what the real AI says back. Behaviour such as "asks a question when it has no context" lives only in the instructions. Be honest about this in the ticket.

## 9. Use a fresh test database for each browser test run

Some browser tests depend on what is already in the database. A check we ran earlier left a saved conversation behind, and an Ask page test failed because of it. Delete the test database and run `db:setup-demo` again before each full browser test run.

## 10. Use the KT-afk account for GitHub

This computer is logged in to two GitHub accounts. The default one is a work account, `kongtatong-wise`. This repo belongs to `KT-afk`. Run `gh` commands with that account's token, so you do not change the default:

```bash
GH_TOKEN=$(gh auth token --user KT-afk) gh pr create ...
```

## 11. Test the merged code, not only the branch

A branch can pass every test and still break once `main` is merged in, if `main` has moved on. Before merging, merge `main` into a throwaway copy (a `git worktree`) and run the type check and the tests there. The unit tests also need a demo database first: run `db:setup-demo` with a temporary `FINANCE_DB_PATH` (lesson 1).

## 12. The always-on app uses this repo and port 3000

The owner's Mac runs the app all the time (launchd `com.financetracker.app`). It runs `npm run start` from this repo, on port 3000, with the real `finance.db` and `.env.local`. Playwright's default setup reuses whatever already runs on port 3000. So a plain `npm run test:e2e` can test against real data, and `npm run build` replaces the build the always-on app serves.

Use the `verify-finance-tracker` skill instead. It builds and runs a copy of the code in `/tmp`, on port 3100, with a demo database.

## 13. One broken test can hide many others

The lockout test locked out every test after it, so their own bugs never showed. Fixing it uncovered six more problems. When many tests fail the same way, fix the shared cause first, then run again before you count what is left.

## 14. Don't give one column two meanings

`balance_history.recorded_at` means “when it was saved”. Putting the statement date in it for new rows only made old and new rows sort wrongly against each other. When a value means something new, give it a new column and say how old rows fall back.

## 15. The live data is in the cloud, not in `finance.db`

The real data (about 1,800 transactions) is in the Turso cloud database. The local `finance.db` on the owner's Mac only holds the 25 demo transactions. Its settings are not on the Mac, so to change the cloud database the owner makes a short-lived token at app.turso.tech and runs `TURSO_DATABASE_URL=… TURSO_AUTH_TOKEN=… npm run db:migrate` in their own terminal. `drizzle-kit migrate` can finish without printing “applied”, so check afterwards: count the rows in `__drizzle_migrations`.

Never paste the token into the chat. If it happens, delete the token in Turso.

## 16. In Telegram topics, every message looks like a reply

In a group with topics, Telegram sets `reply_to_message` on every message in a topic. When the owner did not reply to anything, it points at the message that opened the topic, and its id equals the topic id (`message_thread_id`). Only count a message as a reply when `reply_to_message.message_id` is different from `message_thread_id`.

## 17. Turning on Topics changes the Telegram group id

Turning on Topics makes a basic group a supergroup, with a new id that starts with `-100`. `telegram:setup` then prints both ids. Use the `-100` one. Messages sent as an anonymous admin come from `GroupAnonymousBot`, not the owner, so the bot ignores them.

## 18. Real questions are bigger than test questions

Tests asked about one month. The owner's first real follow-up asked about three months at once, and hit both the answer-length limit and the lookup limit. When a limit is reached, give back what you have and say so; don't throw it all away. Try a few real questions soon after anything goes live.

## 19. Helper scripts must work on the Mac and in the cloud

The `verify-finance-tracker` scripts were written on the Mac. In a cloud session there is no `rsync`, `cp -c` is a Mac-only option, and `lsof` can't see network ports. The scripts now use `tar`, a plain copy, and `/proc` on Linux. When you write a helper, try it in both places, or at least avoid Mac-only flags.

## 20. Claim with one statement, not a transaction

To make a button count once, we first used a database transaction. With two taps at once, the second waited on the first and failed with “database is locked”. A single `UPDATE … WHERE status = 'pending'` claims the row instead: only one tap can change it, and nobody waits.

## 21. A build should not need the internet

`next/font/google` downloads fonts during every build. One failed download stopped a production deploy, even though the code was fine. Keep what the build needs in the repo. To test it, build with `HTTPS_PROXY=http://127.0.0.1:9`, which blocks all downloads.

## 22. Reuse a fix everywhere the same shape appears

Ticket 07's review found a race: a check, then a write that didn't repeat the check. We fixed it for categories, then wrote the same race again for memories in ticket 08, and review caught it again. When a fix is about a pattern (check, then write), search for the pattern, not just the line. Also: SQLite's `unique` is case-sensitive, so “Rent” and “rent” are two different memories unless you compare with `lower()`.

## 23. A copy script can overwrite live changes

`db:copy-cloud` copies local rows to the cloud and updates rows that already exist. Once the owner can change data from Telegram, in the cloud, a copy from the Mac would overwrite those changes with the older local values. The copy no longer includes notes. Categories have the same risk; before running a copy, check the change log for recent changes made from Telegram.

## 24. A date means a Singapore day

Times are saved in UTC (`2026-10-26T17:00:00Z`), but the owner means Singapore days. Comparing a saved time with a bare date like `2026-10-27` starts the day at 8am Singapore time and misses anything earlier. Turn the date into Singapore midnight first: `new Date("2026-10-27T00:00:00+08:00")`.

## 25. Two steps in one request can fail in between

The Budgets page stores a proposal and confirms it in the same request. If the confirm failed, the proposal was left pending, and a later tap in chat could have applied a change you thought had failed. When one request does several steps, decide what happens to the first step if a later one fails, and test that failure.

## 26. Check the same way in every statement of a batch

Undoing a forgotten memory ran two statements: write the log row only if no memory with that name exists (ignoring capitals), and put the memory back. The second relied on the table's unique key, which does care about capitals. So with “Rent” saved and “rent” being restored, the log row was skipped but the memory still went in. When a batch has several statements, give every one the same condition, written out, rather than trusting a constraint to match it.

## 27. Restarting the branch can drop a pushed commit

After each merge we restart the working branch from `main`. Once, a book commit had been pushed to the branch after the merge, so restarting from `main` dropped it, and the next push was refused. Before restarting, check `git log origin/main..origin/<branch>`: if anything is there, merge it in instead of starting over.

## 28. Check what the AI says it did against what it did

The agent told the owner “I've proposed… tap to confirm” when no proposal existed. Instructions alone (“never say it was saved”) didn't stop it. When the AI's words promise an action with a visible result (buttons, a saved change), check in code that the action happened, and say so when it didn't. Also record enough to tell afterwards why it didn't: here, tool calls weren't kept, so we could only guess.

## 29. The AI only knows what's in its conversation

A tap on a Telegram button changes the data but never appears in the chat, so the agent went on saying a confirmed change was waiting, and reused old totals from its earlier answers. Anything that happens outside the conversation (button taps, changes in the app) has to be handed to the AI with each question, and its instructions should treat earlier answers as possibly out of date.

## 30. Try a new lookup on the real data before calling it done

The trip lookup passed its tests but found $2,053 of Korea spending, not $2,520. On real data, some bank lines end with the amount in won after the country code, which the made-up test data didn't have. A read-only run on the live data caught it in a minute. For anything that reads bank text, compare against a count done by hand on real rows.
