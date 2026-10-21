/**
 * Changing the category of money someone sent you applies to that row only:
 * no look-alike rows change, no sender rule is saved, and the dashboard counts
 * the category picked.
 */
import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { migratedSchemaSql } from "./migrated-schema"
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (path: string) => {
    exec(sql: string): void
    prepare(sql: string): { all(): unknown[] }
    close(): void
  }
}

const GIFT =
  "PAYMENT/TRANSFER via PayNow-DBSS from AUNTIE MAY OTHR PayNow Transfer"

async function main() {
  const tmpDir = mkdtempSync(path.join(tmpdir(), "finance-incoming-test-"))
  const dbPath = path.join(tmpDir, "test.db")
  const seed = new DatabaseSync(dbPath)
  seed.exec(`
    ${migratedSchemaSql()};
    INSERT INTO transactions VALUES
      ('gift', '2026-09-10', '${GIFT}', 200, 'ocbc', 'Transfer', 0, 'h1', 'x'),
      ('later', '2026-09-20', '${GIFT}', 50, 'ocbc', 'Transfer', 0, 'h2', 'x'),
      ('shop', '2026-09-11', 'FAIRPRICE FINEST', -20, 'ocbc', 'Others', 0, 'h3', 'x'),
      ('shop2', '2026-09-12', 'FAIRPRICE FINEST', -30, 'ocbc', 'Others', 0, 'h4', 'x');
  `)
  seed.close()

  process.env.FINANCE_DB_PATH = dbPath
  delete process.env.DATABASE_URL
  delete process.env.TURSO_DATABASE_URL
  delete process.env.TURSO_AUTH_TOKEN
  delete process.env.DATABASE_AUTH_TOKEN
  delete process.env.APP_PASSWORD

  try {
    const patch = await import("../app/api/transactions/[id]/route")
    const dashboard = await import("../app/api/dashboard/route")
    const recategorize = (id: string, category: string) =>
      patch.PATCH(
        new Request(`http://localhost/api/transactions/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ category }),
        }) as never,
        { params: Promise.resolve({ id }) }
      )
    const read = (sql: string) => {
      const db = new DatabaseSync(dbPath)
      const rows = db
        .prepare(sql)
        .all()
        .map((r) => ({ ...(r as object) }))
      db.close()
      return rows
    }

    const res = await recategorize("gift", "Income")
    assert.equal(res.status, 200)
    assert.equal((await res.json()).siblingsUpdated, 0)

    assert.deepEqual(
      read(
        "SELECT id, category FROM transactions WHERE id IN ('gift','later') ORDER BY id"
      ),
      [
        { id: "gift", category: "Income" },
        { id: "later", category: "Transfer" },
      ]
    )
    assert.deepEqual(
      read("SELECT keyword FROM category_rules"),
      [],
      "no sender rule"
    )

    const sep = await (
      await dashboard.GET(
        new Request("http://localhost/api/dashboard?month=2026-09") as never
      )
    ).json()
    assert.equal(sep.totalIncome, 200, "the picked category counts")
    assert.equal(
      sep.unclassifiedTransfers,
      50,
      "the untouched one stays in review"
    )

    // Merchants keep the learn-once behaviour
    await recategorize("shop", "Groceries")
    assert.deepEqual(
      read("SELECT category FROM transactions WHERE id = 'shop2'"),
      [{ category: "Groceries" }]
    )
    assert.equal(read("SELECT keyword FROM category_rules").length, 1)

    console.log("incoming transfer recategorize test passed")
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
