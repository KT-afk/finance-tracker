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

## Comments

Security check (2026-10-25). Of the four security failures, only the missing headers is a real gap; it is now ticket 24 (P1). The other three are broken tests, not missing features:

- **Login lockout works.** After 5 wrong passwords `/api/login` returns 429 with "Too many login attempts. Try again later." The test looks for the text "too many failed attempts", so it never matches. Fix the test's text. This lockout is also what locks out the 10 tests that run after it. The login route already supports an `x-finance-tracker-test-client` header (outside production) that gives each test its own attempt count; the lockout tests should send it.
- **Rate limiting works.** `/api/transactions/recategorize` allows 10 requests a minute. But the tests send requests without logging in, so `proxy.ts` answers 401 before the rate limit is reached. The tests must log in first.

Also (2026-10-25): "ask / AI chat › empty state shows example prompts" depends on what is already in the database. It fails when a saved conversation doesn't contain "How much" or "spent". Make it set up its own data or not depend on it.
