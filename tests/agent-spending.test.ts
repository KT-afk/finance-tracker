/**
 * Agent totals are the owner's spending: payments minus other people's
 * shares, with forgiven shares counted back. Gross is on request, and both
 * agree with the dashboard for the same month.
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

function seed(dbPath: string) {
  const db = new DatabaseSync(dbPath)
  db.exec(`
    ${migratedSchemaSql()};
    INSERT INTO transactions (id, date, description, amount, bank, category, is_corrected, hash, uploaded_at) VALUES
      ('dinner', '2026-09-05', 'SUSHI TEI', -120, 'dbs', 'Food & Drink', 0, 'h1', 'x'),
      ('lunch', '2026-09-06', 'TOAST BOX', -10, 'dbs', 'Food & Drink', 0, 'h2', 'x'),
      ('forgive', '2026-09-07', 'Let Jane off dinner', -30, 'off_bank', 'Food & Drink', 0, 'h3', 'x'),
      ('cab', '2026-09-08', 'GRAB RIDE', -20, 'dbs', 'Transport', 0, 'h4', 'x'),
      ('mystery', '2026-09-09', 'FAST PAYMENT via PayNow to SOMEONE', -50, 'dbs', 'Transfer', 0, 'h5', 'x'),
      ('salary', '2026-09-10', 'SALARY ACME', 5000, 'dbs', 'Income', 0, 'h6', 'x'),
      ('card', '2026-09-11', 'PAYMT THRU E-BANK', -900, 'dbs', 'Credit Card Payment', 0, 'h7', 'x'),
      ('aug', '2026-08-20', 'TOAST BOX', -15, 'dbs', 'Food & Drink', 0, 'h8', 'x');
    INSERT INTO owed_entries (id, transaction_id, person, kind, amount, created_at) VALUES
      ('s1', 'dinner', 'Jane', 'share', 80, 'x'),
      ('f1', 'forgive', 'Jane', 'forgiven', 30, 'x');
  `)
  db.close()
}

async function main() {
  const tmpDir = mkdtempSync(path.join(tmpdir(), "finance-agent-spending-"))
  const dbPath = path.join(tmpDir, "test.db")
  seed(dbPath)
  process.env.FINANCE_DB_PATH = dbPath
  delete process.env.DATABASE_URL
  delete process.env.TURSO_DATABASE_URL
  delete process.env.TURSO_AUTH_TOKEN
  delete process.env.DATABASE_AUTH_TOKEN

  try {
    const { querySpending } = await import("../lib/agent/query-spending")
    const dashboard = await import("../app/api/dashboard/route")
    const from = "2026-09-01"
    const to = "2026-09-30"

    // $120 dinner with an $80 share counts $40; the forgiven $30 counts again
    const food = await querySpending("Food & Drink", from, to)
    assert.equal(food.total, 40 + 10 + 30)
    assert.equal(food.count, 3)

    const grossFood = await querySpending(
      "Food & Drink",
      from,
      to,
      "none",
      "gross"
    )
    assert.equal(grossFood.total, 120 + 10 + 30)

    const byCategory = await querySpending(undefined, from, to, "category")
    const res = await dashboard.GET(
      new Request("http://localhost/api/dashboard?month=2026-09") as never
    )
    const board = await res.json()
    assert.equal(byCategory.total, board.totalSpend, "agrees with dashboard")
    const boardTotals = Object.fromEntries(
      board.topCategories.map((c: { category: string; amount: number }) => [
        c.category,
        c.amount,
      ])
    )
    assert.deepEqual(
      Object.fromEntries(byCategory.rows.map((r) => [r.group, r.total])),
      boardTotals
    )
    assert.equal(boardTotals["Unlabelled"], 50, "unlabelled transfers count")

    const gross = await querySpending(undefined, from, to, "none", "gross")
    assert.equal(gross.total, board.totalSpend + 80)

    const byMonth = await querySpending(
      "Food & Drink",
      undefined,
      undefined,
      "month"
    )
    assert.deepEqual(
      byMonth.rows.map((r) => [r.group, r.total]),
      [
        ["2026-09", 80],
        ["2026-08", 15],
      ]
    )
    console.log("agent-spending: passed")
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
