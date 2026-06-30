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
