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
