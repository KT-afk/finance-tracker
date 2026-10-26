# Login and lockout

## Sub-features

- Password login sets the `finance_tracker_session` cookie and goes to `/`.
- After 5 wrong passwords in 5 minutes, `/api/login` returns 429 and the form shows "Too many login attempts. Try again later.".
- "Log out" in the sidebar ends the session; API calls then return 401.

## How to get to it (user POV)

Open any page while logged out; the proxy redirects to `/login`. Type the app password and press "Unlock".

## Driving it with Playwright

`e2e.sh tests/e2e/security.spec.ts tests/e2e/auth.spec.ts`. The password field is `#password`; the submit button is `button[type=submit]`; log out with `getByRole('button', { name: 'Log out' })`.

## Gotchas

- Failed attempts are counted per client. Without the `x-finance-tracker-test-client` header every request is the same client ("direct"), so one lockout test locks out everything after it for 5 minutes. The header only works outside production or with `AUTH_TEST_CLIENT_KEYS=1`; `launch.sh` and `playwright.config.ts` set it.
- The lockout lives in server memory. Restart the server to clear it.
