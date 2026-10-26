---
name: verify-finance-tracker
description: Start the finance tracker web app on a throwaway demo database and drive it in a real browser with Playwright to prove a feature works. Use before claiming a UI or API change works, when running or fixing the e2e tests, or when asked to check the app end to end.
---

# Verify the finance tracker

The app is a Next.js web app (login, dashboard, transactions, accounts, owed, insights, upload, Ask) backed by SQLite. The owner's real data lives in `finance.db`, and `.env.local` holds real secrets. The owner's always-on copy (launchd `com.financetracker.app`) runs `npm run start` from this repo on port 3000. **Never drive port 3000, never build into this repo's `.next`, never open `finance.db`.** The helpers below handle all of that.

All helpers live in `.agents/skills/verify-finance-tracker/scripts/`. Run them from the repo root.

## Launch

```bash
.agents/skills/verify-finance-tracker/scripts/launch.sh
```

What it does:

1. Refuses if an instance from a previous run is still up, or if port 3100 is taken (set `VERIFY_PORT` to use another).
2. Copies the working tree (uncommitted changes included) to `/tmp/verify-finance-tracker/app`, without `.git`, `.next`, `finance.db*`, `.env*`, `backups/` or `logs/`. It clones `node_modules` with `cp -c`, because Turbopack rejects a symlinked `node_modules`.
3. Creates a fresh demo database at `/tmp/verify-finance-tracker/test.db` (`db:setup-demo`), builds, and starts `next start` on `127.0.0.1:3100`.

Every step runs with the live database settings unset, `ANTHROPIC_API_KEY` empty (no AI spend), `APP_PASSWORD=verify-password` and `AUTH_TEST_CLIENT_KEYS=1`.

Ready means it prints `READY http://127.0.0.1:3100 (pid …)`. Logs: `/tmp/verify-finance-tracker/{setup,build,server}.log`.

The build fetches Google fonts. In a network-restricted sandbox it can take 15 minutes or fail with font errors; run it with network access.

## Doctor

```bash
.agents/skills/verify-finance-tracker/scripts/doctor.sh
```

Read-only. Checks that the server pid is alive and owns port 3100, logging in works, the demo transactions load, and the server has `/tmp/verify-finance-tracker/test.db` open (not some other database). Prints `DOCTOR OK: …` or `DOCTOR FAIL: <reason>`. Run it before the first drive and after any surprising failure.

## Drive

```bash
.agents/skills/verify-finance-tracker/scripts/e2e.sh                               # whole suite
.agents/skills/verify-finance-tracker/scripts/e2e.sh tests/e2e/dashboard.spec.ts   # one spec
.agents/skills/verify-finance-tracker/scripts/e2e.sh -g "lock account"             # by name
```

It runs the repo's Playwright suite (`tests/e2e/`) against the instance with `BASE_URL` set, so Playwright does not start its own server. For a new check, write a spec in `tests/e2e/` that imports `test` from `./fixtures`:

- `authedPage` is a page already logged in.
- Every `page` sends `x-finance-tracker-test-client: <test id>`, so each test has its own failed-login count. A lockout test can't lock out later tests.
- Prefer roles and exact text: `getByRole('button', { name: 'Log out' })`, `getByText('Spent', { exact: true })`. Loose text such as `getByText('No transactions yet')` also matches the AI insight "No transactions yet this month.".
- Wait for loading with `page.waitForSelector('.animate-pulse', { state: 'detached' })`.

For a quick API check, log in with curl and reuse the cookie, as `doctor.sh` does.

## Evidence

Each `e2e.sh` run writes to `output/verify/<timestamp>/` (gitignored): `report.txt` (the full list output) and `artifacts/` (an `error-context.md` with a page snapshot, plus screenshots, for each failure). Quote the pass/fail line and the failing tests from `report.txt` as proof.

Proof standards: drive the real user path (log in through `/login`, click real controls). Mock an API with `page.route` only to test how the UI draws given data. Check side effects: after a write, reload the page or call the API and confirm the change stuck.

## Cleanup

```bash
.agents/skills/verify-finance-tracker/scripts/cleanup.sh
```

Kills only the pid `launch.sh` recorded (and its children) and deletes `/tmp/verify-finance-tracker/`. `output/verify/` stays.

Tests write to the demo database (manual transactions, saved Ask conversations). Before a full suite run that must be clean, run `cleanup.sh` then `launch.sh` for a fresh database.

## Features

See `features/README.md` for each user-facing feature, how to reach it and how to prove it works.
