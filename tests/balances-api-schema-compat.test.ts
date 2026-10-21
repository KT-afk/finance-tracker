/**
 * Regression test: /api/balances must not 500 even when the DB schema is
 * behind (e.g. account_type column missing before migration runs).
 */
import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (path: string) => { exec(sql: string): void; close(): void }
}

async function withOldSchema(dbPath: string, fn: () => Promise<void>) {
  // Create the DB with the OLD schema (no account_type column)
  const db = new DatabaseSync(dbPath)
  db.exec(`
    CREATE TABLE IF NOT EXISTS balance_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bank TEXT NOT NULL,
      balance REAL NOT NULL,
      recorded_at TEXT NOT NULL
    );
    INSERT INTO balance_history (bank, balance, recorded_at)
    VALUES ('ocbc', 12345.67, '2026-01-01T00:00:00.000Z');
  `)
  db.close()
  await fn()
}

async function main() {
  const tmpDir = mkdtempSync(path.join(tmpdir(), "finance-test-"))
  const dbPath = path.join(tmpDir, "test.db")

  try {
    await withOldSchema(dbPath, async () => {
      // Point the app at this old-schema DB
      process.env.FINANCE_DB_PATH = dbPath
      delete process.env.DATABASE_URL
      delete process.env.TURSO_DATABASE_URL
      delete process.env.TURSO_AUTH_TOKEN
      delete process.env.DATABASE_AUTH_TOKEN

      // Force fresh module imports so db picks up the env var
      const { GET } = await import("../app/api/balances/route")

      const res = await GET()
      const body = await res.json()

      assert.equal(
        res.status,
        200,
        `Expected 200 but got ${res.status}: ${JSON.stringify(body)}`
      )
      assert.ok(
        Array.isArray(body.balances),
        "body.balances should be an array"
      )
      assert.equal(typeof body.total, "number", "body.total should be a number")
      assert.equal(
        typeof body.totalCC,
        "number",
        "body.totalCC should be a number"
      )

      // The one balance should have defaulted to savings
      assert.equal(body.balances.length, 1)
      assert.equal(body.balances[0].bank, "ocbc")
      assert.equal(body.balances[0].account_type, "savings")
    })

    console.log("balances-api-schema-compat test passed")
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
