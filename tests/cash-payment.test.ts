/**
 * Cash payments from chat: proposed, added only on confirm as a payment
 * with no bank, optionally added to a saved trip, logged and undoable.
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

async function main() {
  const tmpDir = mkdtempSync(path.join(tmpdir(), "finance-cash-test-"))
  const dbPath = path.join(tmpDir, "test.db")
  const seed = new DatabaseSync(dbPath)
  seed.exec(`
    ${migratedSchemaSql()};
    INSERT INTO transactions (id, date, description, amount, bank, category, is_corrected, hash, uploaded_at) VALUES
      ('olive', '2026-04-26', 'CJ OLIVE YOUNG SEOUL KR', -185.51, 'trust', 'Shopping', 0, 'h1', 'x');
    INSERT INTO trips (key, name, date_from, date_to, country, updated_at)
      VALUES ('korea', 'Korea', '2026-04-26', '2026-05-13', 'KR', 'x');
  `)
  seed.close()
  process.env.FINANCE_DB_PATH = dbPath
  delete process.env.DATABASE_URL
  delete process.env.TURSO_DATABASE_URL
  delete process.env.TURSO_AUTH_TOKEN

  try {
    const { proposeCashPayment, decideProposal } =
      await import("../lib/agent/proposals")
    const { listChanges, undoChange } = await import("../lib/agent/change-log")
    const { tripSpending } = await import("../lib/agent/trip-spending")
    const { querySpending } = await import("../lib/agent/query-spending")
    const { db } = await import("../lib/db")
    const { transactions, owedEntries } = await import("../lib/schema")
    const { eq } = await import("drizzle-orm")
    const now = new Date("2026-10-31T04:00:00Z")
    const ctx = { source: "telegram" as const, request: "undo", now }
    const travel = async () =>
      (await querySpending("Travel", "2026-04-01", "2026-04-30")).total
    const base = {
      source: "telegram" as const,
      request: "I spent 1k cash in Korea",
      now,
    }

    const p = await proposeCashPayment({
      date: "2026-04-26",
      amount: 1000,
      category: "Travel",
      description: "  Korea   trip cash ",
      trip: "korea",
      ...base,
    })
    assert.equal(
      p.summary,
      "New cash payment: $1,000 cash, Travel, 26 Apr 2026, “Korea trip cash”, added to the Korea trip"
    )
    assert.equal(await travel(), 0, "nothing before confirm")
    assert.equal(
      (await decideProposal(p.id, "confirm", now)).outcome,
      "applied"
    )
    assert.equal(await travel(), 1000)
    const [row] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.description, "Korea trip cash"))
    assert.deepEqual(
      [row.bank, row.amount, row.is_corrected, row.hash.startsWith("manual:")],
      ["off_bank", -1000, true, true]
    )
    const trip = await tripSpending({ trip: "Korea" })
    assert.deepEqual([trip.total_abroad, trip.total_added], [185.51, 1000])
    // A second tap does nothing
    assert.equal((await decideProposal(p.id, "confirm", now)).outcome, "used")

    // Logged, and undo removes it (and its place in the trip)
    const [entry] = await listChanges({ limit: 1 })
    assert.deepEqual(
      [entry.kind, entry.what, entry.before, entry.after],
      [
        "cash_payment",
        "cash payment “Korea trip cash”",
        "none",
        "$1,000 cash, Travel, 26 Apr 2026",
      ]
    )
    assert.equal((await undoChange(entry.id, ctx)).outcome, "undone")
    assert.equal(await travel(), 0)
    assert.equal((await tripSpending({ trip: "Korea" })).total_added, 0)
    // Undo the undo: back, in the trip again
    const [undoEntry] = await listChanges({ limit: 1 })
    assert.equal((await undoChange(undoEntry.id, ctx)).outcome, "undone")
    assert.equal(await travel(), 1000)
    assert.equal((await tripSpending({ trip: "Korea" })).total_added, 1000)

    // Not undone once someone's share is on it
    await db.insert(owedEntries).values({
      id: "o1",
      transaction_id: row.id,
      person: "Yoon Thiri",
      kind: "share",
      amount: 500,
      created_at: "x",
    })
    assert.equal((await undoChange(entry.id, ctx)).outcome, "conflict")
    assert.equal(await travel(), 500, "the owner's half")

    // Without a trip
    const plain = await proposeCashPayment({
      date: "2026-04-28",
      amount: 12.5,
      category: "Food & Drink",
      description: "Street food",
      trip: null,
      ...base,
    })
    assert.equal(
      plain.summary,
      "New cash payment: $12.50 cash, Food & Drink, 28 Apr 2026, “Street food”"
    )

    // The trip removed between the proposal and the tap: nothing is added
    const { trips } = await import("../lib/schema")
    const late = await proposeCashPayment({
      date: "2026-05-01",
      amount: 50,
      category: "Travel",
      description: "Late cash",
      trip: "Korea",
      ...base,
    })
    const tripRow = (await db.select().from(trips))[0]
    await db.delete(trips).where(eq(trips.key, "korea"))
    assert.equal(
      (await decideProposal(late.id, "confirm", now)).outcome,
      "conflict"
    )
    assert.deepEqual(
      await db
        .select()
        .from(transactions)
        .where(eq(transactions.description, "Late cash")),
      []
    )
    await db.insert(trips).values(tripRow)

    for (const [change, why] of [
      [{ amount: 0 }, /more than 0/],
      [{ amount: 20_000 }, /Transactions page/],
      [{ category: "Income" }, /spending category/],
      [{ category: "Repayment" }, /spending category/],
      [{ description: "x" }, /2 to 80/],
      [{ date: "2026-11-02" }, /future/],
      [{ trip: "Japan" }, /No saved trip/],
    ] as const) {
      await assert.rejects(
        proposeCashPayment({
          ...{
            date: "2026-04-26",
            amount: 100,
            category: "Travel",
            description: "Cash",
            trip: null as string | null,
          },
          ...base,
          ...change,
        }),
        why,
        JSON.stringify(change)
      )
    }
    console.log("cash payment test passed")
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
