/**
 * Income leaves out transfers between the owner's own accounts and share
 * repayments; savings is income minus spending; balances carry their recorded date.
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
      ('salary', '2026-09-10', 'SALARY ACME', 5000, 'dbs', 'Income', 0, 'h1', 'x'),
      ('own', '2026-09-11', 'PAYMENT/TRANSFER from ONG KONG TAT', 2000, 'ocbc', 'Income', 0, 'h2', 'x'),
      ('repay', '2026-09-12', 'PAYMENT/TRANSFER from JANE repay dinner', 80, 'dbs', 'Repayment', 0, 'h3', 'x'),
      ('dinner', '2026-09-05', 'SUSHI TEI', -120, 'dbs', 'Food & Drink', 0, 'h4', 'x'),
      ('cab', '2026-09-08', 'GRAB RIDE', -20, 'dbs', 'Transport', 0, 'h5', 'x'),
      ('aug-salary', '2026-08-10', 'SALARY ACME', 4800, 'dbs', 'Income', 0, 'h6', 'x');
    INSERT INTO owed_entries (id, transaction_id, person, kind, amount, created_at) VALUES
      ('s1', 'dinner', 'Jane', 'share', 80, 'x');
    INSERT INTO balance_history (bank, balance, account_type, recorded_at) VALUES
      ('dbs', 9000, 'savings', '2026-08-31T10:00:00.000Z'),
      ('dbs', 9500.5, 'savings', '2026-09-30T10:00:00.000Z'),
      ('uob', -300, 'credit_card', '2026-09-25T10:00:00.000Z');
  `)
  db.close()
}

async function main() {
  const tmpDir = mkdtempSync(path.join(tmpdir(), "finance-agent-cash-flow-"))
  const dbPath = path.join(tmpDir, "test.db")
  seed(dbPath)
  process.env.FINANCE_DB_PATH = dbPath
  delete process.env.DATABASE_URL
  delete process.env.TURSO_DATABASE_URL
  delete process.env.TURSO_AUTH_TOKEN
  delete process.env.DATABASE_AUTH_TOKEN

  try {
    const { queryCashFlow, getBalances } =
      await import("../lib/agent/query-cash-flow")
    const { querySpending } = await import("../lib/agent/query-spending")

    const sept = await queryCashFlow("2026-09-01", "2026-09-30")
    // Own-account transfer and Jane's repayment are not income
    assert.equal(sept.income, 5000)
    // $120 dinner with Jane's $80 share counts $40, plus the $20 cab
    assert.equal(sept.spending, 60)
    assert.equal(
      sept.spending,
      (await querySpending(undefined, "2026-09-01", "2026-09-30")).total,
      "spending agrees with query_spending"
    )
    assert.equal(sept.savings, 5000 - 60)
    assert.equal(sept.date_from, "2026-09-01")
    assert.equal(sept.date_to, "2026-09-30")

    const aug = await queryCashFlow("2026-08-01", "2026-08-31")
    assert.deepEqual([aug.income, aug.spending, aug.savings], [4800, 0, 4800])

    const balances = await getBalances()
    // Latest per account, each with the day it was recorded
    assert.deepEqual(balances.balances, [
      {
        bank: "dbs",
        account_type: "savings",
        balance: 9500.5,
        recorded_on: "2026-09-30",
      },
      {
        bank: "uob",
        account_type: "credit_card",
        balance: -300,
        recorded_on: "2026-09-25",
      },
    ])
    console.log("agent-cash-flow: passed")
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
