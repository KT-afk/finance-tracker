# 23: Fix the 17 failing end-to-end tests

**Phase:** A

**Priority:** P2

**What to build:** On 2026-10-25, `npm run test:e2e` against a fresh demo database gave 42 passed, 17 failed and 3 skipped. The same 17 fail on commit 214cce3, before the finance agent work, so they predate it. Most are login timeouts (`page.waitForURL` while setting up `authedPage`) in `tests/e2e/security.spec.ts` and `tests/e2e/transactions.spec.ts`. The likely cause is the "Login Attempt Lockout" tests locking the test account for every test that runs after them. Three are dashboard and insights checks: the empty-state upload link, and the trend chart area and bars.

Note for this environment: the project pins Playwright 1.61.1, so the pre-installed browser has to be passed as `launchOptions.executablePath: "/opt/pw-browsers/chromium"`.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Lockout tests reset or isolate the lockout so later tests can log in
- [ ] Dashboard and insights failures are fixed or the tests updated to match the demo data
- [ ] The full e2e suite passes on a fresh demo database
