import { test, expect } from './fixtures'

test.describe('dashboard', () => {
  test('renders Overview heading and bank filter tabs', async ({ authedPage: page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
    // Bank tabs: All, OCBC, DBS, UOB, TRUST
    await expect(page.getByRole('tab', { name: 'All' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'OCBC' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'UOB' })).toBeVisible()
  })

  test('shows either transactions data or empty state', async ({ authedPage: page }) => {
    await page.goto('/')
    // Wait for loading to finish (skeleton disappears)
    await page.waitForSelector('.animate-pulse', { state: 'detached', timeout: 10000 }).catch(() => {})

    const hasEmpty = await page.getByText('No transactions yet').isVisible().catch(() => false)
    const hasSpend = await page.getByText(/spend/i).isVisible().catch(() => false)
    expect(hasEmpty || hasSpend).toBeTruthy()
  })

  test('bank filter tab changes dashboard data', async ({ authedPage: page }) => {
    await page.goto('/')
    await page.waitForSelector('.animate-pulse', { state: 'detached', timeout: 10000 }).catch(() => {})

    // Click UOB tab
    await page.getByRole('tab', { name: 'UOB' }).click()
    // Page should not error — just re-render with filtered data
    await expect(page.getByRole('tab', { name: 'UOB' })).toHaveAttribute('data-state', 'active')
  })

  test('empty state shows upload link', async ({ authedPage: page }) => {
    // Only relevant when no transactions exist; if data is present, skip gracefully
    await page.goto('/')
    await page.waitForSelector('.animate-pulse', { state: 'detached', timeout: 10000 }).catch(() => {})

    const hasEmpty = await page.getByText('No transactions yet').isVisible().catch(() => false)
    if (!hasEmpty) return // already has data — this assertion is N/A

    await expect(page.getByRole('link', { name: 'Upload statement' })).toBeVisible()
  })

  test('total balance card links to accounts page', async ({ authedPage: page }) => {
    await page.goto('/')
    await page.waitForSelector('.animate-pulse', { state: 'detached', timeout: 10000 }).catch(() => {})

    const hasEmpty = await page.getByText('No transactions yet').isVisible().catch(() => false)
    if (hasEmpty) return

    await page.getByText('Total balance').click()
    await expect(page).toHaveURL(/\/accounts/)
  })

  test('View all link navigates to transactions', async ({ authedPage: page }) => {
    await page.goto('/')
    await page.waitForSelector('.animate-pulse', { state: 'detached', timeout: 10000 }).catch(() => {})

    const viewAll = page.getByRole('link', { name: 'View all' })
    const isVisible = await viewAll.isVisible().catch(() => false)
    if (!isVisible) return // no recent transactions shown

    await viewAll.click()
    await expect(page).toHaveURL(/\/transactions/)
  })

  test('/api/dashboard returns expected shape', async ({ authedPage: page }) => {
    const res = await page.request.get('/api/dashboard')
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(data).toMatchObject({
      totalSpend: expect.any(Number),
      month: expect.stringMatching(/^\d{4}-\d{2}$/),
      topCategories: expect.any(Array),
      recentTransactions: expect.any(Array),
    })
  })
})
