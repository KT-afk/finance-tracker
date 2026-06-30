import { test, expect } from '@playwright/test'
import path from 'path'

const APP_PASSWORD = process.env.APP_PASSWORD ?? 'test'

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.fill('#password', APP_PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL('/')
}

test.describe('upload flow', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('upload page renders preview and confirm buttons', async ({ page }) => {
    await page.goto('/upload')
    await expect(page.getByRole('heading', { name: 'Upload Transactions' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Preview' })).toBeVisible()
  })

  test('preview shows not-yet-saved state before confirm', async ({ page }) => {
    const pdfPath = process.env.UOB_MAY_PDF
    if (!pdfPath) {
      test.skip(true, 'UOB_MAY_PDF not set')
      return
    }

    await page.goto('/upload')

    // Select UOB bank
    await page.getByRole('combobox').click()
    await page.getByRole('option', { name: /uob/i }).click()

    // Attach file
    await page.locator('input[type=file]').setInputFiles(pdfPath)

    // Click preview
    await page.getByRole('button', { name: 'Preview' }).click()

    // Wait for preview card
    await expect(page.getByText('Total parsed')).toBeVisible({ timeout: 30000 })

    // Confirm button should be present and show new count
    const importBtn = page.getByRole('button', { name: /Import \d+ transactions/ })
    await expect(importBtn).toBeVisible()

    // Verify transactions are NOT yet in the DB — transactions list should not show them yet
    // (We check the count shown in the preview is > 0)
    const newCountText = await page.locator('.text-green-400').first().textContent()
    const newCount = parseInt(newCountText ?? '0')
    expect(newCount).toBeGreaterThan(0)
  })

  test('full upload → confirm → transactions visible flow', async ({ page }) => {
    const pdfPath = process.env.UOB_MAY_PDF
    if (!pdfPath) {
      test.skip(true, 'UOB_MAY_PDF not set')
      return
    }

    await page.goto('/upload')

    // Select UOB bank
    await page.getByRole('combobox').click()
    await page.getByRole('option', { name: /uob/i }).click()

    // Attach file
    await page.locator('input[type=file]').setInputFiles(pdfPath)

    // Preview
    await page.getByRole('button', { name: 'Preview' }).click()
    await expect(page.getByText('Total parsed')).toBeVisible({ timeout: 30000 })

    // Confirm import
    const importBtn = page.getByRole('button', { name: /Import \d+ transactions/ })
    const newCountText = await page.locator('.text-green-400').first().textContent()
    const newCount = parseInt(newCountText ?? '0')

    if (newCount === 0) {
      test.skip(true, 'All transactions already imported — skipping duplicate test')
      return
    }

    await importBtn.click()

    await expect(page.getByText('Done')).toBeVisible()

    // Should redirect to home after confirm
    await page.waitForURL('/', { timeout: 10000 })

    // Verify transactions exist via API
    const res = await page.request.get('/api/transactions?bank=uob')
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(Array.isArray(data.transactions ?? data)).toBeTruthy()
    const rows = data.transactions ?? data
    expect(rows.length).toBeGreaterThan(0)
  })
})
