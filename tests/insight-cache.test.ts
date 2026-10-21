/**
 * The dashboard insight is reused for a week, and made again as soon as
 * the data behind it changes, so the model is only called when needed.
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

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`
}

function seed(dbPath: string) {
  const db = new DatabaseSync(dbPath)
  db.exec(`
    ${migratedSchemaSql()};
    INSERT INTO transactions (id, date, description, amount, bank, category, is_corrected, hash, uploaded_at) VALUES
      ('a', '${today()}', 'FAIRPRICE FINEST', -100, 'dbs', 'Groceries', 0, 'h0', 'x');
  `)
  db.close()
}

async function main() {
  const tmpDir = mkdtempSync(path.join(tmpdir(), "finance-insight-test-"))
  const dbPath = path.join(tmpDir, "test.db")
  seed(dbPath)
  process.env.FINANCE_DB_PATH = dbPath
  process.env.ANTHROPIC_API_KEY = "test-key"
  delete process.env.ANTHROPIC_BASE_URL
  delete process.env.DATABASE_URL
  delete process.env.TURSO_DATABASE_URL
  delete process.env.TURSO_AUTH_TOKEN
  delete process.env.DATABASE_AUTH_TOKEN

  try {
    // Stand in for the Anthropic API
    let calls = 0
    let reply: () => Response = () =>
      Response.json({
        id: "m",
        type: "message",
        role: "assistant",
        model: "x",
        content: [{ type: "text", text: `insight ${calls}` }],
        stop_reason: "end_turn",
        usage: { input_tokens: 1, output_tokens: 1 },
      })
    globalThis.fetch = (async () => {
      calls++
      return reply()
    }) as typeof fetch

    const cache = await import("../lib/insight-cache")
    const route = await import("../app/api/insight/route")
    const { db } = await import("../lib/db")
    const { sql } = await import("drizzle-orm")
    const ask = async () => {
      const body = await (await route.POST()).json()
      if (body.error) throw new Error(body.error)
      return body.text
    }

    assert.equal(await ask(), "insight 1")
    assert.equal(await ask(), "insight 1", "same data reuses the saved insight")
    assert.equal(calls, 1)

    // New transaction changes the input, so it is made again
    await db.run(sql`
      INSERT INTO transactions (id, date, description, amount, bank, category, is_corrected, hash, uploaded_at) VALUES
        ('b', ${today()}, 'GRAB', -20, 'dbs', 'Transport', 0, 'h1', 'x')
    `)
    assert.equal(await ask(), "insight 2", "new data makes a new insight")
    assert.equal(await ask(), "insight 2")

    // A new memory changes the input too
    await db.run(sql`
      INSERT INTO ai_memory (key, value, source, created_at)
      VALUES ('rent', 'normal', 'user', 'x')
    `)
    assert.equal(await ask(), "insight 3", "new memory makes a new insight")
    assert.equal(calls, 3)

    // Two requests at once share one model call
    await db.run(sql`DELETE FROM insight_cache`)
    const [x, y] = await Promise.all([route.POST(), route.POST()])
    assert.equal((await x.json()).text, (await y.json()).text)
    assert.equal(calls, 4, "concurrent requests share one call")

    // Expiry: fine just before a week, stale at a week
    const now = Date.now()
    await cache.saveInsight("h", "old", now - cache.INSIGHT_TTL_MS + 1000)
    assert.equal(await cache.getCachedInsight("h", now), "old")
    assert.equal(await cache.getCachedInsight("other", now), null)
    await cache.saveInsight("h", "old", now - cache.INSIGHT_TTL_MS)
    assert.equal(await cache.getCachedInsight("h", now), null, "a week old")

    // Model errors are not saved
    const ok = reply
    reply = () =>
      Response.json(
        {
          type: "error",
          error: { type: "invalid_request_error", message: "boom" },
        },
        { status: 400 }
      )
    await cache.saveInsight("h", "old", now - cache.INSIGHT_TTL_MS)
    const failed = await route.POST()
    assert.equal(failed.status, 500)
    reply = ok
    const before = calls
    await ask()
    assert.equal(calls, before + 1, "a failed call left nothing saved")

    console.log("insight-cache: all assertions passed")
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
