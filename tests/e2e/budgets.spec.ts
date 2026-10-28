import { test, expect } from "./fixtures"

test.describe("Budgets page", () => {
  test("add, change and remove a budget", async ({ authedPage: page }) => {
    await page.getByRole("link", { name: "Budgets" }).first().click()
    await expect(page).toHaveURL(/\/budgets$/)
    await expect(page).toHaveTitle("Budgets · Finance Tracker")
    await expect(page.getByText("No budgets yet.")).toBeVisible()

    // Add: a bad amount is shown inline and nothing is saved
    const add = page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: "Add" }) })
    await add.getByLabel("Category").selectOption("Food & Drink")
    await add.getByLabel("Monthly limit (SGD)").fill("lots")
    await add.getByRole("button", { name: "Add" }).click()
    await expect(page.getByText("Enter an amount, like 500")).toBeVisible()
    await add.getByLabel("Monthly limit (SGD)").fill("$500")
    await add.getByRole("button", { name: "Add" }).click()
    await expect(
      page.getByText(/^Done: Budget: Food & Drink \$500 a month/)
    ).toBeVisible()
    const card = page.getByRole("listitem").filter({ hasText: "Food & Drink" })
    await expect(card.getByText(/of \$500\.00/)).toBeVisible()
    await expect(card.getByRole("progressbar")).toBeVisible()

    // Change; it sticks after a reload
    await card.getByLabel("Monthly limit (SGD)").fill("650")
    await card.getByRole("button", { name: "Save" }).click()
    await expect(page.getByText(/replaces \$500/)).toBeVisible()
    await page.reload()
    await expect(
      page
        .getByRole("listitem")
        .filter({ hasText: "Food & Drink" })
        .getByText(/of \$650\.00/)
    ).toBeVisible()

    // Remove, after confirming
    page.once("dialog", (d) => d.accept())
    await page
      .getByRole("listitem")
      .filter({ hasText: "Food & Drink" })
      .getByRole("button", { name: "Remove…" })
      .click()
    await expect(
      page.getByText(/remove Food & Drink \(was \$650/)
    ).toBeVisible()
    await expect(page.getByText("No budgets yet.")).toBeVisible()
  })
})
