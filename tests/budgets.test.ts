/**
 * Budgets: one monthly limit per category, set through a confirmed
 * proposal, measured on the owner's spending for the calendar month in
 * Singapore, with pace against the share of the month gone.
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
  const tmpDir = mkdtempSync(path.join(tmpdir(), "finance-budgets-"))
  const dbPath = path.join(tmpDir, "test.db")
  const seed = new DatabaseSync(dbPath)
  seed.exec(`
    ${migratedSchemaSql()};
    INSERT INTO transactions (id, date, description, payee, amount, bank, category, is_corrected, hash, uploaded_at) VALUES
      ('aug', '2026-08-31', 'SUSHI TEI', NULL, -300, 'dbs', 'Food & Drink', 0, 'h0', 'x'),
      ('d1', '2026-09-01', 'SUSHI TEI', NULL, -120, 'dbs', 'Food & Drink', 0, 'h1', 'x'),
      ('d2', '2026-09-10', 'TOAST BOX', NULL, -30, 'dbs', 'Food & Drink', 0, 'h2', 'x'),
      ('g1', '2026-09-12', 'GRAB RIDE', NULL, -90, 'dbs', 'Transport', 0, 'h3', 'x'),
      ('s1', '2026-09-13', 'UNIQLO', NULL, -50, 'dbs', 'Shopping', 0, 'h4', 'x');
    INSERT INTO owed_entries (id, transaction_id, person, kind, amount, created_at) VALUES
      ('o1', 'd1', 'Jane', 'share', 60, 'x');
  `)
  seed.close()
  process.env.FINANCE_DB_PATH = dbPath
  delete process.env.DATABASE_URL
  delete process.env.TURSO_DATABASE_URL
  delete process.env.TURSO_AUTH_TOKEN
  delete process.env.DATABASE_AUTH_TOKEN

  try {
    const { proposeBudget, decideProposal } =
      await import("../lib/agent/proposals")
    const { budgetMonth, budgetStatus } = await import("../lib/budgets")
    const { undoChange, listChanges } = await import("../lib/agent/change-log")

    // 15 Sep 2026, 20:00 in Singapore
    const now = new Date("2026-09-15T12:00:00Z")
    const confirm = async (p: Promise<{ id: string }>) =>
      assert.equal(
        (await decideProposal((await p).id, "confirm", now)).outcome,
        "applied"
      )

    // The month is the calendar month in Singapore: 23:30 UTC on 30 Sep is
    // already 1 Oct there
    assert.deepEqual(budgetMonth(now), {
      start: "2026-09-01",
      end: "2026-09-30",
      today: "2026-09-15",
      dayOfMonth: 15,
      daysInMonth: 30,
    })
    assert.equal(
      budgetMonth(new Date("2026-09-30T16:30:00Z")).start,
      "2026-10-01"
    )

    // Setting a budget is a proposal
    const p1 = await proposeBudget({
      category: "Food & Drink",
      amount: 200,
      source: "telegram",
      request: "cap food at 200",
      now,
    })
    assert.equal(p1.summary, "Budget: Food & Drink $200 a month")
    assert.deepEqual(await budgetStatus(now), [], "nothing before confirm")
    await confirm(Promise.resolve(p1))
    await confirm(
      proposeBudget({
        category: "Transport",
        amount: 100,
        source: "web",
        request: "x",
        now,
      })
    )

    // Status: spending is the owner's share ($60 of the $120 dinner + $30),
    // this month only; categories without a budget are left out
    const status = await budgetStatus(now)
    assert.deepEqual(
      status.map((b) => [
        b.category,
        b.spent,
        b.limit,
        b.usedPct,
        b.monthPct,
        b.pace,
      ]),
      [
        ["Food & Drink", 90, 200, 45, 50, "on track"],
        ["Transport", 90, 100, 90, 50, "ahead of pace"],
      ]
    )
    assert.equal(status[1].left, 10)

    // Over the limit
    await confirm(
      proposeBudget({
        category: "Transport",
        amount: 80,
        source: "web",
        request: "x",
        now,
      })
    )
    const over = (await budgetStatus(now)).find(
      (b) => b.category === "Transport"
    )!
    assert.deepEqual(
      [over.usedPct, over.pace, over.left],
      [113, "over budget", -10]
    )

    // Changing says what it replaces; it's logged and undoable
    const p4 = await proposeBudget({
      category: "Food & Drink",
      amount: 250,
      source: "web",
      request: "food 250",
      now,
    })
    assert.equal(
      p4.summary,
      "Budget: Food & Drink $250 a month (replaces $200)"
    )
    await confirm(Promise.resolve(p4))
    const [latest] = await listChanges({ limit: 1 })
    assert.deepEqual(
      [latest.kind, latest.what, latest.before, latest.after],
      ["budget", "budget for Food & Drink", "$200", "$250"]
    )
    assert.equal(
      (await undoChange(latest.id, { source: "web", request: "undo", now }))
        .outcome,
      "undone"
    )
    assert.equal((await budgetStatus(now))[0].limit, 200)

    // Undoing a new budget removes it
    const transportFirst = (await listChanges({})).find(
      (c) =>
        c.kind === "budget" &&
        c.what === "budget for Transport" &&
        c.before === "none"
    )!
    // Transport's budget is $80 now, not the $100 that entry set: refused
    assert.equal(
      (
        await undoChange(transportFirst.id, {
          source: "web",
          request: "undo",
          now,
        })
      ).outcome,
      "conflict"
    )

    // No roll-over: October starts clean
    const october = await budgetStatus(new Date("2026-10-02T04:00:00Z"))
    assert.deepEqual(
      october.map((b) => [b.category, b.spent]),
      [
        ["Food & Drink", 0],
        ["Transport", 0],
      ]
    )

    for (const [category, amount, why] of [
      ["Snacks", 100, /category/i],
      ["Income", 100, /spending categor/i],
      ["Shopping", 0, /more than 0/],
      ["Shopping", 2_000_000, /too large/i],
      ["Food & Drink", 200, /already/i],
    ] as const) {
      await assert.rejects(
        proposeBudget({ category, amount, source: "web", request: "x", now }),
        why,
        `${category} ${amount}`
      )
    }
    console.log("budgets: passed")
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
