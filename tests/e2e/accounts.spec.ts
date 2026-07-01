import { test, expect } from './fixtures'

test.describe('accounts page', () => {
  test('renders Accounts heading', async ({ authedPage: page }) => {
    await page.goto('/accounts')
    await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible()
  })

  test('shows Net worth card', async ({ authedPage: page }) => {
    await page.goto('/accounts')
    await page.waitForSelector('.animate-pulse', { state: 'detached', timeout: 10000 }).catch(() => {})
    await expect(page.getByText('Net worth', { exact: true })).toBeVisible()
  })

  test('shows Bank accounts list with all four banks', async ({ authedPage: page }) => {
    await page.goto('/accounts')
    await page.waitForSelector('.animate-pulse', { state: 'detached', timeout: 10000 }).catch(() => {})
    await expect(page.getByText('Bank accounts')).toBeVisible()
    await expect(page.getByText('OCBC')).toBeVisible()
    await expect(page.getByText('UOB')).toBeVisible()
    await expect(page.getByText('Trust Bank')).toBeVisible()
    await expect(page.getByText('DBS/POSB')).toBeVisible()
  })

  test('Set balance / Edit button opens inline edit form', async ({ authedPage: page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/accounts')
    await page.waitForSelector('.animate-pulse', { state: 'detached', timeout: 10000 }).catch(() => {})

    // Hover over OCBC row to reveal the Edit/Set balance button (opacity-0 on desktop until hover)
    const ocbcRow = page.getByText('OCBC').locator('../..')
    await ocbcRow.hover()
    const editBtn = ocbcRow.getByRole('button', { name: /Edit|Set balance/i })
    await editBtn.click()

    // Input field should appear
    await expect(page.locator('input[inputmode=decimal]')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()
  })

  test('cancel edit closes the input', async ({ authedPage: page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/accounts')
    await page.waitForSelector('.animate-pulse', { state: 'detached', timeout: 10000 }).catch(() => {})

    const ocbcRow = page.getByText('OCBC').locator('../..')
    await ocbcRow.hover()
    await ocbcRow.getByRole('button', { name: /Edit|Set balance/i }).click()
    await expect(page.locator('input[inputmode=decimal]')).toBeVisible()

    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.locator('input[inputmode=decimal]')).not.toBeVisible()
  })

  test('can save a balance and it appears on the page', async ({ authedPage: page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/accounts')
    await page.waitForSelector('.animate-pulse', { state: 'detached', timeout: 10000 }).catch(() => {})

    const ocbcRow = page.getByText('OCBC').locator('../..')
    await ocbcRow.hover()
    await ocbcRow.getByRole('button', { name: /Edit|Set balance/i }).click()

    await page.locator('input[inputmode=decimal]').fill('5000.00')
    await page.getByRole('button', { name: 'Save' }).click()

    // Input should close and new balance visible
    await expect(page.locator('input[inputmode=decimal]')).not.toBeVisible({ timeout: 5000 })
    await expect(page.getByText('$5,000.00').first()).toBeVisible({ timeout: 5000 })
  })

  test('/api/balances returns expected shape', async ({ authedPage: page }) => {
    const res = await page.request.get('/api/balances')
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(data).toMatchObject({
      balances: expect.any(Array),
      total: expect.any(Number),
    })
  })

  test('/api/balances POST saves balance', async ({ authedPage: page }) => {
    const res = await page.request.post('/api/balances', {
      data: { bank: 'dbs', balance: 1234.56 },
    })
    expect(res.ok()).toBeTruthy()
  })
})
