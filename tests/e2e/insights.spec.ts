import { test, expect } from './fixtures'

test.describe('insights page', () => {
  test('renders Insights heading and view toggle', async ({ authedPage: page }) => {
    await page.goto('/insights')
    await expect(page.getByRole('heading', { name: 'Insights' })).toBeVisible()
    // Overview / Categories toggle buttons
    await expect(page.getByRole('button', { name: 'overview' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'categories' })).toBeVisible()
  })

  test('overview tab shows bank filter tabs', async ({ authedPage: page }) => {
    await page.goto('/insights')
    await page.getByRole('button', { name: 'overview' }).click()
    await expect(page.getByRole('tab', { name: 'All' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'OCBC' })).toBeVisible()
  })

  test('overview shows trend chart area or empty state', async ({ authedPage: page }) => {
    await page.goto('/insights')
    await page.waitForSelector('.animate-pulse', { state: 'detached', timeout: 10000 }).catch(() => {})

    const hasChart = await page.getByText('6-month spend trend').isVisible().catch(() => false)
    const hasEmpty = await page.getByText('Not enough data yet').isVisible().catch(() => false)
    expect(hasChart || hasEmpty).toBeTruthy()
  })

  test('trend chart renders data-scaled visible bars', async ({ authedPage: page }) => {
    await page.route('**/api/insights**', async route => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          momComparison: [
            { category: 'Bills & Utilities', current: 999.99, previous: 0, delta: 999.99, deltaPct: null },
            { category: 'Groceries', current: 110, previous: 142.1, delta: -32.1, deltaPct: -22.6 },
          ],
          trendData: [
            { month: '2026-01', 'Food & Drink': 120 },
            { month: '2026-02', 'Food & Drink': 130 },
            { month: '2026-03', Groceries: 210 },
            { month: '2026-04', 'Bills & Utilities': 340 },
            { month: '2026-05', Groceries: 142.1, 'Food & Drink': 88.25, Shopping: 250, Subscriptions: 32.9 },
            { month: '2026-06', 'Bills & Utilities': 999.99, Groceries: 110, 'Food & Drink': 76.5, Transport: 12.34 },
          ],
          monthLabels: ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'],
          biggestTransactions: [],
          currentMonth: '2026-06',
        }),
      })
    })

    await page.goto('/insights')

    const juneBills = page.locator('button[aria-label*="2026-06 Bills & Utilities"]')
    const mayShopping = page.locator('button[aria-label*="2026-05 Shopping"]')
    const janFood = page.locator('button[aria-label*="2026-01 Food & Drink"]')

    await expect(juneBills).toBeVisible()
    await expect(mayShopping).toBeVisible()
    await expect(janFood).toBeVisible()

    const juneBox = await juneBills.boundingBox()
    const mayBox = await mayShopping.boundingBox()
    const janBox = await janFood.boundingBox()

    expect(juneBox?.height ?? 0).toBeGreaterThan(150)
    expect(mayBox?.height ?? 0).toBeGreaterThan(30)
    expect(janBox?.height ?? 0).toBeGreaterThan(15)
    expect(juneBox?.height ?? 0).toBeGreaterThan(mayBox?.height ?? 0)
  })

  test('categories view renders when toggled', async ({ authedPage: page }) => {
    await page.goto('/insights')
    await page.getByRole('button', { name: 'categories' }).click()
    // CategoriesView should render — wait briefly for any load
    await page.waitForTimeout(500)
    // Should not show an error
    const hasError = await page.locator('text=/Failed to load/i').isVisible().catch(() => false)
    expect(hasError).toBeFalsy()
  })

  test('bank filter changes overview data', async ({ authedPage: page }) => {
    await page.goto('/insights')
    await page.waitForSelector('.animate-pulse', { state: 'detached', timeout: 10000 }).catch(() => {})

    await page.getByRole('tab', { name: 'UOB' }).click()
    await expect(page.getByRole('tab', { name: 'UOB' })).toHaveAttribute('data-state', 'active')
    // Should not throw or show error
    const hasError = await page.locator('text=/Failed to load/i').isVisible().catch(() => false)
    expect(hasError).toBeFalsy()
  })

  test('/api/insights returns expected shape', async ({ authedPage: page }) => {
    const res = await page.request.get('/api/insights')
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(data).toMatchObject({
      momComparison: expect.any(Array),
      trendData: expect.any(Array),
      monthLabels: expect.any(Array),
      biggestTransactions: expect.any(Array),
      currentMonth: expect.stringMatching(/^\d{4}-\d{2}$/),
    })
  })
})
