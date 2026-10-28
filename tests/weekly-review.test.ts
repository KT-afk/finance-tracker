/**
 * The weekly review: Monday to Sunday in Singapore against the week before,
 * the groups that changed most, top merchants, and budget pace.
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
  return `('t${n}', '${date}', '${description}', ${-amount}, 'ocbc', '${category}', 0, 'h${n}', 'x')`
}

async function main() {
  const tmpDir = mkdtempSync(path.join(tmpdir(), "finance-weekly-test-"))
  const dbPath = path.join(tmpDir, "test.db")
  const rows = [
    // Last week (12–18 Oct): food $60, transport $50
    row("2026-10-12", "NETS QR MADE UP KOPITIAM", 30, "Food & Drink"),
    row("2026-10-18", "NETS QR MADE UP KOPITIAM", 30, "Food & Drink"),
    row("2026-10-14", "MADE UP TAXI", 50, "Transport"),
    // This week (19–25 Oct): food $160, transport $45, a book $15
    row("2026-10-19", "NETS QR MADE UP KOPITIAM", 30, "Food & Drink"),
    row("2026-10-21", "NETS QR MADE UP KOPITIAM", 30, "Food & Drink"),
    row("2026-10-25", "MADE UP BISTRO", 100, "Food & Drink"),
    row("2026-10-22", "MADE UP TAXI", 45, "Transport"),
    row("2026-10-23", "MADE UP BOOKSHOP", 15, "Shopping"),
    // Outside both weeks
    row("2026-10-26", "MADE UP BISTRO", 999, "Food & Drink"),
    row("2026-10-11", "MADE UP BISTRO", 999, "Food & Drink"),
  ]
  const seed = new DatabaseSync(dbPath)
  seed.exec(`
    ${migratedSchemaSql()};
    INSERT INTO transactions
      (id, date, description, amount, bank, category, is_corrected, hash, uploaded_at)
    VALUES ${rows.join(",\n")};
    INSERT INTO budgets (category, monthly_limit, updated_at) VALUES ('Transport', 100, 'x');
  `)
  seed.close()
  process.env.FINANCE_DB_PATH = dbPath
  delete process.env.DATABASE_URL
  delete process.env.TURSO_DATABASE_URL
  delete process.env.TURSO_AUTH_TOKEN

  try {
    const { buildWeeklyReview, formatWeeklyReview } =
      await import("../lib/weekly-review")
    // Sunday 25 Oct 2026, 10pm in Singapore
    const r = await buildWeeklyReview(new Date("2026-10-25T14:00:00Z"))
    assert.deepEqual([r.from, r.to], ["2026-10-19", "2026-10-25"])
    assert.equal(r.total, 220)
    assert.equal(r.lastWeekTotal, 110)
    // Food up $100 is listed; transport down $5 and the $15 book are too small
    assert.deepEqual(
      r.changes.map((c) => [c.name, c.total, c.lastWeek]),
      [["Food", 160, 60]]
    )
    assert.equal(r.topMerchants[0].total, 100)
    assert.deepEqual(r.topMerchants[1], {
      payee: r.topMerchants[1].payee,
      count: 2,
      total: 60,
    })
    // October so far: taxis $95 of $100
    assert.deepEqual(
      r.budgets.map((b) => [b.category, b.spent, b.pace]),
      [["Transport", 95, "ahead of pace"]]
    )

    const text = formatWeeklyReview(r)
    assert.match(
      text,
      /^📊 Week of 19 Oct to 25 Oct\n\nSpent \$220 \(last week \$110, \+\$110\)/
    )
    assert.match(
      text,
      /Biggest changes from last week:\n🍜 Food  \$160 \(was \$60, \+\$100\)\n/
    )
    assert.match(text, /Top merchants:\n• MADE UP BISTRO \$100\n• .*×2 \$60\n/)
    assert.match(
      text,
      /Budgets \(day 25 of 31, 81% of the month gone\):\n⚠️ Transport: \$95 of \$100 \(95%\) · ahead of pace$/
    )

    // A quiet week: no change or merchant sections, no budgets section
    const quiet = formatWeeklyReview({
      ...r,
      total: 0,
      changes: [],
      topMerchants: [],
      budgets: [],
    })
    assert.doesNotMatch(quiet, /Biggest|Top merchants|Budgets/)

    console.log("weekly review test passed")
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
