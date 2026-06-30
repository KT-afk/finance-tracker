import { test as base, expect } from '@playwright/test'

export { expect }

const APP_PASSWORD = process.env.APP_PASSWORD ?? 'test'

// Extend base test with an auto-login fixture so every test gets an authenticated page.
export const test = base.extend<{ authedPage: import('@playwright/test').Page }>({
  authedPage: async ({ page }, use) => {
    await page.goto('/login')
    await page.fill('#password', APP_PASSWORD)
    await page.click('button[type=submit]')
    await page.waitForURL('/')
    await use(page)
  },
})
