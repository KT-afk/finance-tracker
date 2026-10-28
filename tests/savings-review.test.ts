/**
 * The savings review: averages over full months only, months before the
 * data starts left out, the owner's share of shared payments, fixed versus
 * flexible costs, and this month's pace against the average.
 * All values are made up.
 */
import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { migratedSchemaSql } from "./migrated-schema"
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (path: string) => { exec(sql: string): void; close(): void }
}

let n = 0
function row(
  date: string,
  description: string,
  amount: number,
  category: string
) {
  n++
  return `('t${n}', '${date}', '${description}', ${amount}, 'ocbc', '${category}', 0, 'h${n}', 'x')`
}

async function main() {
  const rows: string[] = []
  // July to September: salary $5,000, rent $2,000, food $600, shopping $300
  for (const m of ["07", "08", "09"]) {
    rows.push(row(`2026-${m}-25`, "SALARY MADE UP CO", 5000, "Income"))
    rows.push(row(`2026-${m}-01`, "RENT TO LANDLORD", -2000, "Housing"))
    for (let d = 10; d < 30; d++)
      rows.push(
        row(`2026-${m}-${d}`, "NETS QR MADE UP KOPITIAM", -30, "Food & Drink")
      )
    rows.push(row(`2026-${m}-05`, "MADE UP BOOKSHOP", -300, "Shopping"))
  }
  // October so far (to the 15th): rent, $450 at the kopitiam, a $120 dinner
  // Jane owes half of, and $50 of shopping
  rows.push(row("2026-10-01", "RENT TO LANDLORD", -2000, "Housing"))
  for (let d = 1; d <= 15; d++)
    rows.push(
      row(
        `2026-10-${String(d).padStart(2, "0")}`,
        "NETS QR MADE UP KOPITIAM",
        -30,
        "Food & Drink"
      )
    )
  rows.push(row("2026-10-12", "MADE UP BISTRO", -120, "Food & Drink"))
  rows.push(row("2026-10-13", "MADE UP BOOKSHOP", -50, "Shopping"))
  const dinner = `t${n - 1}`

  const tmpDir = mkdtempSync(path.join(tmpdir(), "finance-savings-test-"))
  const dbPath = path.join(tmpDir, "test.db")
  const seed = new DatabaseSync(dbPath)
  seed.exec(`
    ${migratedSchemaSql()};
    INSERT INTO transactions
      (id, date, description, amount, bank, category, is_corrected, hash, uploaded_at)
    VALUES ${rows.join(",\n")};
    INSERT INTO owed_entries (id, transaction_id, person, kind, amount, created_at)
    VALUES ('o1', '${dinner}', 'Jane', 'share', 60, 'x');
  `)
  seed.close()
  process.env.FINANCE_DB_PATH = dbPath
  delete process.env.DATABASE_URL
  delete process.env.TURSO_DATABASE_URL
  delete process.env.TURSO_AUTH_TOKEN

  try {
    const { savingsReview, parseSavingsReviewInput } =
      await import("../lib/agent/savings-review")
    // 15 Oct 2026, 8pm in Singapore
    const now = new Date("2026-10-15T12:00:00Z")
    const r = await savingsReview(now, 3)

    assert.deepEqual(
      r.months.map((m) => m.month),
      ["2026-07", "2026-08", "2026-09"]
    )
    assert.deepEqual(r.average, {
      income: 5000,
      spending: 2900,
      savings: 2100,
      savings_rate: 42,
    })
    assert.deepEqual(r.this_month, {
      from: "2026-10-01",
      to: "2026-10-15",
      day: 15,
      days_in_month: 31,
    })

    const cat = (name: string) => r.categories.find((c) => c.category === name)!
    assert.deepEqual(
      r.categories.map((c) => c.category),
      ["Housing", "Food & Drink", "Shopping"]
    )
    // Rent is fixed: no pace, and paying it on the 1st isn't "above average"
    assert.deepEqual(
      [
        cat("Housing").kind,
        cat("Housing").this_month_on_pace_for,
        cat("Housing").above_average,
      ],
      ["fixed", null, false]
    )
    // Food: $450 + the owner's $60 of the dinner, on pace for $1,054
    assert.equal(cat("Food & Drink").kind, "flexible")
    assert.equal(cat("Food & Drink").monthly_average, 600)
    assert.equal(cat("Food & Drink").this_month_so_far, 510)
    assert.equal(cat("Food & Drink").this_month_on_pace_for, 1054)
    assert.equal(cat("Food & Drink").above_average, true)
    assert.deepEqual(cat("Food & Drink").top_merchants, [
      { name: "NETS QR MADE UP KOPITIAM", monthly_average: 600 },
    ])
    assert.equal(cat("Shopping").above_average, false)

    // Six months asked for, but data starts in July: averages use those 3
    const six = await savingsReview(now, 6)
    assert.equal(six.months.length, 6)
    assert.deepEqual(six.average, r.average)
    assert.equal(
      six.categories.find((c) => c.category === "Food & Drink")!
        .monthly_average,
      600
    )

    // January looks back into the year before
    const jan = await savingsReview(new Date("2027-01-10T04:00:00Z"), 3)
    assert.deepEqual(
      jan.months.map((m) => m.month),
      ["2026-10", "2026-11", "2026-12"]
    )

    for (const bad of [{}, { months: 4 }, { months: 3, extra: 1 }, null])
      assert.throws(() => parseSavingsReviewInput(bad))
    assert.deepEqual(parseSavingsReviewInput({ months: 6 }), { months: 6 })

    console.log("savings review test passed")
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
