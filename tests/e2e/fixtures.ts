import { test as base, expect } from "@playwright/test"

export { expect }

export const APP_PASSWORD = process.env.APP_PASSWORD ?? "test"

// The login route counts failed attempts per client. Outside production (or
// with AUTH_TEST_CLIENT_KEYS=1) it reads this header as the client, so each
// test gets its own count and a lockout test can't lock out the tests after it.
export const TEST_CLIENT_HEADER = "x-finance-tracker-test-client"

export const test = base.extend<{
  authedPage: import("@playwright/test").Page
}>({
  page: async ({ page }, use, testInfo) => {
    await page.setExtraHTTPHeaders({ [TEST_CLIENT_HEADER]: testInfo.testId })
    await use(page)
  },
  // Auto-login fixture so a test gets an authenticated page.
  authedPage: async ({ page }, use) => {
    await page.goto("/login")
    await page.fill("#password", APP_PASSWORD)
    await page.click("button[type=submit]")
    await page.waitForURL("/")
    await use(page)
  },
})
