# 24: Add security headers to every response

**Phase:** A

**Priority:** P1

**What to build:** The app sends no security headers. `next.config.ts` has no `headers()` setting and `proxy.ts` adds none. Found by the failing e2e test "should include security headers in responses" (ticket 23). The biggest risk is **clickjacking**: another website could load the app in a hidden frame and trick the owner into clicking buttons that change their data. Add the headers in `next.config.ts` with `headers()`.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] `X-Frame-Options: DENY` (and `Content-Security-Policy: frame-ancestors 'none'`) so no other site can frame the app
- [x] `X-Content-Type-Options: nosniff`
- [x] `Referrer-Policy: strict-origin-when-cross-origin` (or stricter)
- [x] The e2e test "should include security headers in responses" passes
- [x] The app still works in the browser and on the phone after the change
