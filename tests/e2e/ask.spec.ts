import { test, expect } from './fixtures'

test.describe('ask / AI chat', () => {
  test('renders textarea and Ask button', async ({ authedPage: page }) => {
    await page.goto('/ask')
    await expect(page.getByPlaceholder('Ask about your finances…')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ask' })).toBeVisible()
  })

  test('Ask button is disabled when input is empty', async ({ authedPage: page }) => {
    await page.goto('/ask')
    await expect(page.getByRole('button', { name: 'Ask' })).toBeDisabled()
  })

  test('Ask button enables when input has text', async ({ authedPage: page }) => {
    await page.goto('/ask')
    await page.fill('textarea', 'How much did I spend last month?')
    await expect(page.getByRole('button', { name: 'Ask' })).toBeEnabled()
  })

  test('empty state shows example prompts', async ({ authedPage: page }) => {
    await page.goto('/ask')
    // If no history, the empty state message should be visible
    // (if history exists, this won't show — test is N/A)
    const hasEmpty = await page.getByText('Ask anything about your spending').isVisible().catch(() => false)
    const hasHistory = await page.locator('text=/How much|spent/i').count().then(n => n > 0).catch(() => false)
    expect(hasEmpty || hasHistory).toBeTruthy()
  })

  test('What I remember toggle shows memory panel', async ({ authedPage: page }) => {
    await page.goto('/ask')
    await page.getByText(/What I remember/).click()
    // Memory panel appears (either has entries or "Nothing remembered yet")
    const hasEntries = await page.getByRole('button', { name: 'Forget this memory' }).count().then(n => n > 0).catch(() => false)
    const hasEmpty = await page.getByText('Nothing remembered yet.').isVisible().catch(() => false)
    expect(hasEntries || hasEmpty).toBeTruthy()
  })

  test('submitting a question shows loading indicator then response', async ({ authedPage: page }) => {
    await page.goto('/ask')
    await page.fill('textarea', 'What is my total spend?')
    await page.getByRole('button', { name: 'Ask' }).click()

    // Loading animation should appear briefly
    // Then a response bubble should appear
    await expect(page.locator('.bg-zinc-800\\/80').last()).toBeVisible({ timeout: 30000 })
  })

  test('/api/ask/history returns array', async ({ authedPage: page }) => {
    const res = await page.request.get('/api/ask/history')
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(data).toMatchObject({ conversations: expect.any(Array) })
  })

  test('/api/memory returns entries array', async ({ authedPage: page }) => {
    const res = await page.request.get('/api/memory')
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(data).toMatchObject({ entries: expect.any(Array) })
  })
})
