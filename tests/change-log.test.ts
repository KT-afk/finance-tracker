/**
 * Reading the change log and undo: undo puts back the "before" value at
 * once, only if the target still has the "after" value, and is itself
 * logged. Log entries are never edited or deleted.
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
  const tmpDir = mkdtempSync(path.join(tmpdir(), "finance-change-log-"))
  const dbPath = path.join(tmpDir, "test.db")
  const seed = new DatabaseSync(dbPath)
  seed.exec(`
    ${migratedSchemaSql()};
    INSERT INTO transactions (id, date, description, payee, amount, bank, category, is_corrected, hash, uploaded_at) VALUES
      ('shopee', '2026-09-06', 'SHOPEE SINGAPORE MP', 'Shopee', -80, 'dbs', 'Shopping', 0, 'h1', 'x'),
      ('ring', '2026-06-08', 'FAST PAYMENT to YOXX THIXX', NULL, -1277, 'dbs', 'Shopping', 0, 'h2', 'x');
  `)
  seed.close()
  process.env.FINANCE_DB_PATH = dbPath
  delete process.env.DATABASE_URL
  delete process.env.TURSO_DATABASE_URL
  delete process.env.TURSO_AUTH_TOKEN
  delete process.env.DATABASE_AUTH_TOKEN

  try {
    const { proposeRecategorise, proposeNote, proposeMemory, decideProposal } =
      await import("../lib/agent/proposals")
    const { listChanges, undoChange } = await import("../lib/agent/change-log")
    const { db } = await import("../lib/db")
    const { transactions, changeLog, aiMemory } = await import("../lib/schema")
    const { eq } = await import("drizzle-orm")
    const tx = async (id: string) =>
      (await db.select().from(transactions).where(eq(transactions.id, id)))[0]
    const memory = async (key: string) =>
      (await db.select().from(aiMemory).where(eq(aiMemory.key, key)))[0]
    const at = (h: number) => new Date(Date.UTC(2026, 9, 20, h))
    const apply = async (p: Promise<{ id: string }>, h: number) =>
      assert.equal(
        (await decideProposal((await p).id, "confirm", at(h))).outcome,
        "applied"
      )
    const ctx = (h: number, request = "undo") => ({
      source: "telegram" as const,
      request,
      now: at(h),
    })

    // Four confirmed changes: a category, a note, a new memory, a replacement
    await apply(
      proposeRecategorise({
        transactionId: "shopee",
        category: "Personal",
        source: "telegram",
        request: "shopee was a gift",
        now: at(1),
      }),
      1
    )
    await apply(
      proposeNote({
        transactionId: "ring",
        note: "Wedding ring",
        source: "telegram",
        request: "that was my ring",
        now: at(2),
      }),
      2
    )
    await apply(
      proposeMemory({
        key: "gym",
        value: "Gym is $150 a month",
        ownerAsked: true,
        source: "web",
        request: "remember gym",
        now: at(3),
      }),
      3
    )
    await apply(
      proposeMemory({
        key: "gym",
        value: "Gym is $120 a month",
        ownerAsked: true,
        source: "web",
        request: "gym is cheaper now",
        now: at(4),
      }),
      4
    )

    // Reading the log: newest first, with before, after and what it was
    const recent = await listChanges({ since: "2026-10-20" })
    assert.deepEqual(
      recent.map((c) => [c.id, c.kind, c.before, c.after]),
      [
        [4, "memory", "Gym is $150 a month", "Gym is $120 a month"],
        [3, "memory", "", "Gym is $150 a month"],
        [2, "note", "", "Wedding ring"],
        [1, "recategorise", "Shopping", "Personal"],
      ]
    )
    assert.match(recent[3].what, /^Shopee \$80 on 6 Sept? 2026$/)
    assert.match(recent[2].what, /YOXX THIXX \$1,277 on 8 Jun 2026/)
    assert.equal(recent[0].what, "memory “gym”")
    assert.equal(recent[3].source, "telegram")
    assert.equal(recent[3].request, "shopee was a gift")
    assert.deepEqual(await listChanges({ since: "2026-10-21" }), [])
    assert.equal((await listChanges({ limit: 2 })).length, 2)

    // "Undo the last change": the memory goes back to $150, and the undo is
    // its own entry pointing at #4
    const u1 = await undoChange(undefined, ctx(5, "undo the last change"))
    assert.equal(u1.outcome, "undone")
    assert.match(u1.message, /^Undid #4 .*Change #5/)
    assert.equal((await memory("gym")).value, "Gym is $150 a month")
    const [e5] = await db.select().from(changeLog).where(eq(changeLog.id, 5))
    assert.deepEqual(
      [e5.kind, e5.before, e5.after, e5.reverses_id, e5.request],
      [
        "memory",
        "Gym is $120 a month",
        "Gym is $150 a month",
        4,
        "undo the last change",
      ]
    )

    // "Undo #3": a memory that didn't exist before is removed
    // Saying "undo the last change" again undoes the next one (#3), it
    // doesn't redo #4
    const u2 = await undoChange(undefined, ctx(6, "undo the last change"))
    assert.equal(u2.outcome, "undone")
    assert.match(u2.message, /^Undid #3 /)
    assert.equal(await memory("gym"), undefined)

    // Undo a note: it goes back to no note
    assert.equal((await undoChange(2, ctx(7))).outcome, "undone")
    assert.equal((await tx("ring")).note, null)

    // Undo a category, then try again: already back, so nothing changes
    assert.equal((await undoChange(1, ctx(8))).outcome, "undone")
    assert.equal((await tx("shopee")).category, "Shopping")
    const twice = await undoChange(1, ctx(9))
    assert.equal(twice.outcome, "conflict")
    assert.match(twice.message, /now Shopping, not Personal/)

    // Changed since by someone else: refuses, explains, changes nothing
    await apply(
      proposeRecategorise({
        transactionId: "shopee",
        category: "Travel",
        source: "web",
        request: "shopee was travel",
        now: at(10),
      }),
      10
    )
    const travelId = (await listChanges({ limit: 1 }))[0].id
    await db
      .update(transactions)
      .set({ category: "Entertainment" })
      .where(eq(transactions.id, "shopee"))
    const stale = await undoChange(travelId, ctx(11))
    assert.equal(stale.outcome, "conflict")
    assert.equal((await tx("shopee")).category, "Entertainment")

    // Undoing an undo puts the change back (redo)
    await db
      .update(transactions)
      .set({ category: "Shopping" })
      .where(eq(transactions.id, "shopee"))
    const undoOfOne = (await listChanges({})).find((c) => c.reverses_id === 1)!
    assert.equal((await undoChange(undoOfOne.id, ctx(12))).outcome, "undone")
    assert.equal((await tx("shopee")).category, "Personal")

    // Unknown entries and an empty log
    assert.equal((await undoChange(999, ctx(13))).outcome, "not_found")

    // The log only grew: earlier entries are untouched
    const all = await db.select().from(changeLog).orderBy(changeLog.id)
    assert.deepEqual(
      all.slice(0, 4).map((e) => [e.id, e.before, e.after, e.reverses_id]),
      [
        [1, "Shopping", "Personal", null],
        [2, "", "Wedding ring", null],
        [3, "", "Gym is $150 a month", null],
        [4, "Gym is $150 a month", "Gym is $120 a month", null],
      ]
    )
    assert.equal(all.filter((e) => e.reverses_id !== null).length, 5)

    // "since" is a Singapore date: 01:00 on 21 Oct in Singapore is 17:00 UTC
    // on 20 Oct, and still counts as the 21st
    await apply(
      proposeNote({
        transactionId: "ring",
        note: "Ring",
        source: "telegram",
        request: "x",
        now: at(17),
      }),
      17
    )
    assert.deepEqual(
      (await listChanges({ since: "2026-10-21" })).map((c) => c.after),
      ["Ring"]
    )

    // The newest real change not yet undone is that note, #11
    assert.match((await undoChange(undefined, ctx(18))).message, /^Undid #11 /)
    // Forgetting a memory on the Ask page is logged, and undo brings it back
    const { forgetMemory } = await import("../lib/agent/change-log")
    await apply(
      proposeMemory({
        key: "rent",
        value: "Rent is split with Jane",
        ownerAsked: true,
        source: "web",
        request: "remember rent",
        now: at(19),
      }),
      19
    )
    const rent = await memory("rent")
    assert.equal(await forgetMemory(rent.id, { now: at(20) }), true)
    assert.equal(await memory("rent"), undefined)
    assert.equal(await forgetMemory(rent.id, { now: at(20) }), false)
    const [forgot] = await listChanges({ limit: 1 })
    assert.deepEqual(
      [forgot.what, forgot.before, forgot.after, forgot.source, forgot.request],
      [
        "memory “rent”",
        "Rent is split with Jane",
        "",
        "web",
        "Ask page: forget rent",
      ]
    )
    assert.equal((await undoChange(forgot.id, ctx(21))).outcome, "undone")
    assert.equal((await memory("rent")).value, "Rent is split with Jane")
    // Again: it's back already, so refused
    assert.equal((await undoChange(forgot.id, ctx(22))).outcome, "conflict")
    // Forgotten, then saved again with other capitals: undo refuses and
    // adds nothing, though the table's unique key is case-sensitive
    await forgetMemory((await memory("rent")).id, { now: at(23) })
    const [again] = await listChanges({ limit: 1 })
    await db.insert(aiMemory).values({
      key: "Rent",
      value: "Rent is $2,000",
      source: "user",
      created_at: "x",
    })
    const refused = await undoChange(again.id, ctx(24))
    assert.equal(refused.outcome, "conflict")
    assert.match(refused.message, /is now Rent is \$2,000/)
    assert.deepEqual(
      (await db.select().from(aiMemory))
        .filter((m) => m.key.toLowerCase() === "rent")
        .map((m) => m.value),
      ["Rent is $2,000"]
    )

    console.log("change-log: passed")
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
