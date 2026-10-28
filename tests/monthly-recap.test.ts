/**
 * Monthly recap: one-offs and SPayLater bills are set aside, and each group
 * is compared with the three months before. All values are made up.
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

function seed(dbPath: string) {
  const rows: string[] = []
  // Three ordinary months: rent, ~$300 food, ~$100 shopping
  for (const m of ["07", "08", "09"]) {
    rows.push(row(`2026-${m}-01`, "RENT TO LANDLORD", 2000, "Housing"))
    for (let d = 10; d < 20; d++)
      rows.push(
        row(`2026-${m}-${d}`, "NETS QR MADE UP KOPITIAM", 30, "Food & Drink")
      )
    rows.push(row(`2026-${m}-20`, "MADE UP BOOKSHOP", 100, "Shopping"))
  }
  // October: same rent, a trip, a SPayLater bill, and much more food
  rows.push(row("2026-10-01", "RENT TO LANDLORD", 2000, "Housing"))
  rows.push(row("2026-10-03", "MADE UP AIRLINE", 500, "Travel"))
  rows.push(row("2026-10-04", "MADE UP HOTEL", 400, "Travel"))
  rows.push(row("2026-10-09", "SPAYLATER SG", 300, "Shopping"))
  for (let d = 10; d < 25; d++)
    rows.push(
      row(`2026-10-${d}`, "NETS QR MADE UP KOPITIAM", 30, "Food & Drink")
    )
  rows.push(row("2026-10-25", "MADE UP BISTRO", 80, "Food & Drink"))
  rows.push(row("2026-10-26", "MADE UP BOOKSHOP", 90, "Shopping"))

  const db = new DatabaseSync(dbPath)
  db.exec(`
    ${migratedSchemaSql()};
    INSERT INTO transactions
      (id, date, description, amount, bank, category, is_corrected, hash, uploaded_at)
    VALUES ${rows.join(",\n")};
    INSERT INTO budgets (category, monthly_limit, updated_at) VALUES
      ('Food & Drink', 600, 'x'),
      ('Travel', 500, 'x');
  `)
  db.close()
}

async function main() {
  const tmpDir = mkdtempSync(path.join(tmpdir(), "finance-recap-test-"))
  const dbPath = path.join(tmpDir, "test.db")
  seed(dbPath)
  process.env.FINANCE_DB_PATH = dbPath
  delete process.env.DATABASE_URL
  delete process.env.TURSO_DATABASE_URL
  delete process.env.TURSO_AUTH_TOKEN

  try {
    const { buildMonthlyRecap, formatMonthlyRecap } =
      await import("../lib/monthly-recap")
    const r = await buildMonthlyRecap("2026-10")

    assert.equal(r.total, 2000 + 500 + 400 + 300 + 450 + 80 + 90)
    assert.equal(r.usualTotal, 2400)
    // The trip is one-offs; the bookshop, seen before, is not
    assert.deepEqual(
      r.oneOffs.map((o) => [o.payee, o.amount]),
      [
        ["MADE UP AIRLINE", 500],
        ["MADE UP HOTEL", 400],
      ]
    )
    assert.equal(r.laterBills, 300)

    const group = (name: string) => r.groups.find((g) => g.name === name)
    assert.deepEqual(
      [group("Home")?.total, group("Home")?.usual, group("Home")?.direction],
      [2000, 2000, null]
    )
    // Food: $530 against a usual $300, with the kopitiam habit named
    assert.equal(group("Food")?.total, 530)
    assert.equal(group("Food")?.usual, 300)
    assert.equal(group("Food")?.direction, "up")
    assert.equal(group("Food")?.topMerchants[0].count, 15)
    // Shopping without the SPayLater bill is normal
    assert.equal(group("Shopping")?.total, 90)
    assert.equal(group("Shopping")?.direction, null)
    // The trip doesn't make Fun & travel look high
    assert.equal(group("Fun & travel"), undefined)

    const text = formatMonthlyRecap(r)
    assert.match(
      text,
      /^📊 October recap\n\nSpent \$3,820 \(usual month ~\$2,400\)/
    )
    assert.match(text, /One-offs: \$900\n• \$500  MADE UP AIRLINE · 3 Oct/)
    assert.match(text, /SPayLater bill: \$300/)
    assert.match(
      text,
      /🍜 Food  \$530   usual \$300   ⬆ \+\$230\n    .*×15 \$450/
    )

    // How the month compared with the one before, and each budget's result
    assert.deepEqual(r.lastMonth, { label: "September", total: 2400 })
    assert.match(text, /\nSeptember: \$2,400 \(\+\$1,420 this month\)\n/)
    assert.deepEqual(
      r.budgets.map((b) => [b.category, b.spent, b.monthPct]),
      [
        ["Food & Drink", 530, 100],
        ["Travel", 900, 100],
      ]
    )
    assert.match(
      text,
      /\nBudgets in October:\n✅ Food & Drink: \$530 of \$600 \(88%\) · within budget, \$70 left\n⚠️ Travel: \$900 of \$500 \(180%\) · over by \$400$/
    )

    console.log("monthly recap test passed")
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
