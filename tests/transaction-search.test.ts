/**
 * Transaction search for the agent: filters by text, category, amount and
 * dates; lists at most 20 payments, newest first; shows shared payments
 * with the owner's share.
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
  // 25 Grab rides on 1-25 Aug, $1 to $25
  const rides = Array.from({ length: 25 }, (_, i) => {
    const day = String(i + 1).padStart(2, "0")
    return `('grab${day}', '2026-08-${day}', 'GRAB RIDE ${day}', -${i + 1}, 'dbs', 'Transport', 0, 'g${day}', 'x')`
  }).join(",\n")
  const db = new DatabaseSync(dbPath)
  db.exec(`
    ${migratedSchemaSql()};
    INSERT INTO transactions (id, date, description, amount, bank, category, is_corrected, hash, uploaded_at) VALUES
      ${rides},
      ('dinner', '2026-09-05', 'SUSHI TEI', -120, 'dbs', 'Food & Drink', 0, 'h1', 'x'),
      ('shopee', '2026-09-06', 'SHOPEE SINGAPORE', -80, 'dbs', 'Shopping', 0, 'h2', 'x'),
      ('salary', '2026-09-10', 'SALARY GRAB HOLDINGS', 5000, 'dbs', 'Income', 0, 'h3', 'x');
    INSERT INTO owed_entries (id, transaction_id, person, kind, amount, created_at) VALUES
      ('s1', 'dinner', 'Jane', 'share', 80, 'x');
  `)
  db.close()
}

async function main() {
  const tmpDir = mkdtempSync(path.join(tmpdir(), "finance-search-"))
  const dbPath = path.join(tmpDir, "test.db")
  seed(dbPath)
  process.env.FINANCE_DB_PATH = dbPath
  delete process.env.DATABASE_URL
  delete process.env.TURSO_DATABASE_URL
  delete process.env.TURSO_AUTH_TOKEN
  delete process.env.DATABASE_AUTH_TOKEN

  try {
    const { searchTransactions, parseSearchInput } =
      await import("../lib/agent/search-transactions")

    // Text matches merchant, case-insensitively; income is not a payment
    const grab = await searchTransactions({ text: "grab" })
    assert.equal(grab.count, 25)
    assert.equal(grab.transactions.length, 20, "at most 20 listed")
    assert.equal(grab.more, 5)
    assert.equal(grab.transactions[0].date, "2026-08-25", "newest first")
    assert.equal(grab.total, (25 * 26) / 2, "total covers every match")

    // Shared payment shows the full amount and the owner's share
    const dinner = await searchTransactions({ text: "sushi" })
    assert.equal(dinner.count, 1)
    assert.equal(dinner.transactions[0].amount, 120)
    assert.equal(dinner.transactions[0].your_share, 40)
    assert.match(dinner.transactions[0].display, /\$120.*\(your share \$40/)
    assert.equal(dinner.total, 40, "total is the owner's spending")
    assert.equal(dinner.gross_total, 120)
    assert.equal(dinner.more, 0)

    const shopee = await searchTransactions({ text: "shopee" })
    assert.equal(shopee.transactions[0].your_share, undefined)
    assert.doesNotMatch(shopee.transactions[0].display, /your share/)

    // Category, amount range (full payment amount) and dates
    const food = await searchTransactions({ category: "Food & Drink" })
    assert.deepEqual(
      food.transactions.map((t) => t.id),
      ["dinner"]
    )
    const big = await searchTransactions({ min_amount: 50, max_amount: 100 })
    assert.deepEqual(
      big.transactions.map((t) => t.id),
      ["shopee"]
    )
    const week = await searchTransactions({
      date_from: "2026-08-03",
      date_to: "2026-08-05",
    })
    assert.deepEqual(
      week.transactions.map((t) => t.id),
      ["grab05", "grab04", "grab03"]
    )

    const none = await searchTransactions({ text: "netflix" })
    assert.deepEqual(none, {
      transactions: [],
      total: 0,
      gross_total: 0,
      count: 0,
      more: 0,
    })

    // Input validation
    assert.deepEqual(parseSearchInput({ text: "  grab  " }), { text: "grab" })
    for (const bad of [
      null,
      [],
      { unknown: "x" },
      { text: "" },
      { text: 5 },
      { text: "x".repeat(101) },
      { category: "Snacks" },
      { min_amount: -1 },
      { min_amount: "10" },
      { min_amount: 50, max_amount: 10 },
      { date_from: "2026-02-30" },
      { date_from: "2026-09-02", date_to: "2026-09-01" },
    ]) {
      assert.throws(() => parseSearchInput(bad), Error, JSON.stringify(bad))
    }
    console.log("transaction-search: passed")
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
