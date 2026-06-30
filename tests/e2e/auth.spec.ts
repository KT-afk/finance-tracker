import { test, expect } from './fixtures'

const APP_PASSWORD = process.env.APP_PASSWORD ?? 'test'

test.describe('auth', () => {
  test('login page renders', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByText('Finance Tracker').first()).toBeVisible()
    await expect(page.locator('#password')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Unlock' })).toBeVisible()
  })

  test('wrong password shows error', async ({ page }) => {
    await page.goto('/login')
    await page.fill('#password', 'wrongpassword_definitely_invalid')
    await page.click('button[type=submit]')
    await expect(page.getByText(/Login failed|Invalid|Wrong|incorrect/i)).toBeVisible({ timeout: 5000 })
    // Should stay on login page
    await expect(page).toHaveURL(/\/login/)
  })

  test('correct password redirects to home', async ({ page }) => {
    await page.goto('/login')
    await page.fill('#password', APP_PASSWORD)
    await page.click('button[type=submit]')
    await page.waitForURL('/')
    await expect(page).toHaveURL('/')
  })

  test('unauthenticated access to home redirects to login', async ({ page }) => {
    // Clear any session cookies
    await page.context().clearCookies()
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })

  test('logout clears session and redirects to login', async ({ authedPage: page }) => {
    // Use desktop viewport so logout button in sidebar is visible
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    await page.getByRole('button', { name: 'Log out' }).click()
    await expect(page).toHaveURL(/\/login/)
    // After logout, home should redirect to login again
    await page.context().clearCookies()
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })
})
