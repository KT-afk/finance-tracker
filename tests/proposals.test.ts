/**
 * Proposed changes: nothing changes until the owner confirms; confirming
 * re-checks the transaction, applies once and records it in the change log.
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

const HOUR = 60 * 60 * 1000

async function main() {
  const tmpDir = mkdtempSync(path.join(tmpdir(), "finance-proposals-"))
  const dbPath = path.join(tmpDir, "test.db")
  const seed = new DatabaseSync(dbPath)
  seed.exec(`
    ${migratedSchemaSql()};
    INSERT INTO transactions (id, date, description, payee, amount, bank, category, is_corrected, hash, uploaded_at) VALUES
      ('shopee', '2026-09-06', 'SHOPEE SINGAPORE MP', 'Shopee', -80, 'dbs', 'Shopping', 0, 'h1', 'x'),
      ('grab', '2026-09-07', 'GRAB RIDE', NULL, -12.5, 'dbs', 'Transport', 0, 'h2', 'x'),
      ('cash', '2026-09-08', 'Lunch Jane paid', NULL, -20, 'off_bank', 'Food & Drink', 0, 'h3', 'x'),
      ('back', '2026-09-09', 'PAYNOW FROM JANE', NULL, 50, 'dbs', 'Repayment', 0, 'h4', 'x');
  `)
  seed.close()
  process.env.FINANCE_DB_PATH = dbPath
  delete process.env.DATABASE_URL
  delete process.env.TURSO_DATABASE_URL
  delete process.env.TURSO_AUTH_TOKEN
  delete process.env.DATABASE_AUTH_TOKEN

  try {
    const { proposeRecategorise, decideProposal } =
      await import("../lib/agent/proposals")
    const { db } = await import("../lib/db")
    const { transactions, changeLog, agentProposals } =
      await import("../lib/schema")
    const { eq } = await import("drizzle-orm")
    const category = async (id: string) =>
      (
        await db
          .select({ category: transactions.category })
          .from(transactions)
          .where(eq(transactions.id, id))
      )[0].category

    const t0 = new Date("2026-09-10T12:00:00Z")
    const request = "that $80 Shopee was a gift"

    // Proposing names the exact transaction and before and after, and
    // changes nothing
    const p1 = await proposeRecategorise({
      transactionId: "shopee",
      category: "Personal",
      source: "telegram",
      request,
      now: t0,
    })
    assert.match(
      p1.summary,
      /^Shopee \$80 on 6 Sept? 2026: Shopping → Personal$/
    )
    assert.ok(/^[A-Za-z0-9]{8,24}$/.test(p1.id), "short id for button data")
    assert.equal(await category("shopee"), "Shopping")
    assert.equal((await db.select().from(changeLog)).length, 0)

    // Confirm applies it once and records it
    const done = await decideProposal(p1.id, "confirm", t0)
    assert.equal(done.outcome, "applied")
    assert.match(done.message, /Shopee \$80/)
    assert.equal(await category("shopee"), "Personal")
    const [entry] = await db.select().from(changeLog)
    assert.deepEqual(
      {
        kind: entry.kind,
        target: entry.target,
        before: entry.before,
        after: entry.after,
        source: entry.source,
        request: entry.request,
        proposal_id: entry.proposal_id,
      },
      {
        kind: "recategorise",
        target: "shopee",
        before: "Shopping",
        after: "Personal",
        source: "telegram",
        request,
        proposal_id: p1.id,
      }
    )
    assert.match(done.message, new RegExp(`#${entry.id}`))
    const [corrected] = await db
      .select({ is_corrected: transactions.is_corrected })
      .from(transactions)
      .where(eq(transactions.id, "shopee"))
    assert.equal(corrected.is_corrected, true, "counts as the owner's choice")

    // A second tap (or a tap on reject afterwards) does nothing and says so
    const again = await decideProposal(p1.id, "confirm", t0)
    assert.equal(again.outcome, "used")
    assert.match(again.message, /already/i)
    assert.equal((await decideProposal(p1.id, "reject", t0)).outcome, "used")
    assert.equal((await db.select().from(changeLog)).length, 1)

    // Two taps at once: only one applies
    const p2 = await proposeRecategorise({
      transactionId: "grab",
      category: "Travel",
      source: "web",
      request: "grab was for a trip",
      now: t0,
    })
    const both = await Promise.all([
      decideProposal(p2.id, "confirm", t0),
      decideProposal(p2.id, "confirm", t0),
    ])
    assert.deepEqual(both.map((r) => r.outcome).sort(), ["applied", "used"])
    assert.equal((await db.select().from(changeLog)).length, 2)

    // Reject changes nothing
    const p3 = await proposeRecategorise({
      transactionId: "grab",
      category: "Transport",
      source: "web",
      request: "actually it was transport",
      now: t0,
    })
    const no = await decideProposal(p3.id, "reject", t0)
    assert.equal(no.outcome, "rejected")
    assert.equal(await category("grab"), "Travel")
    assert.equal((await db.select().from(changeLog)).length, 2)

    // After 24 hours a proposal expires and changes nothing
    const p4 = await proposeRecategorise({
      transactionId: "grab",
      category: "Transport",
      source: "telegram",
      request: "grab was transport",
      now: t0,
    })
    const late = await decideProposal(
      p4.id,
      "confirm",
      new Date(t0.getTime() + 24 * HOUR + 1)
    )
    assert.equal(late.outcome, "expired")
    assert.match(late.message, /expired/i)
    assert.equal(await category("grab"), "Travel")
    const [p4row] = await db
      .select()
      .from(agentProposals)
      .where(eq(agentProposals.id, p4.id))
    assert.equal(p4row.status, "expired")

    // The transaction changed since the proposal: nothing changes, and why
    const p5 = await proposeRecategorise({
      transactionId: "grab",
      category: "Transport",
      source: "telegram",
      request: "grab was transport",
      now: t0,
    })
    await db
      .update(transactions)
      .set({ category: "Entertainment" })
      .where(eq(transactions.id, "grab"))
    const stale = await decideProposal(p5.id, "confirm", t0)
    assert.equal(stale.outcome, "conflict")
    assert.match(stale.message, /now Entertainment, not Travel/)
    assert.equal(await category("grab"), "Entertainment")

    // Off-bank rows take spending categories only, and no keyword side
    // effects; still a normal confirmed change
    const p6 = await proposeRecategorise({
      transactionId: "cash",
      category: "Groceries",
      source: "web",
      request: "that lunch was groceries",
      now: t0,
    })
    assert.equal(
      (await decideProposal(p6.id, "confirm", t0)).outcome,
      "applied"
    )
    assert.equal(await category("cash"), "Groceries")

    // Refused before anything is stored
    for (const [transactionId, to, why] of [
      ["missing", "Personal", /not found/i],
      ["grab", "Snacks", /category/i],
      ["grab", "Entertainment", /already/i],
      ["grab", "Repayment", /Owed/i],
      ["grab", "Paid by Others", /Owed/i],
      ["back", "Income", /Owed/i],
      ["cash", "Transfer", /spending category/i],
    ] as const) {
      await assert.rejects(
        proposeRecategorise({
          transactionId,
          category: to,
          source: "web",
          request: "x",
          now: t0,
        }),
        why,
        `${transactionId} → ${to}`
      )
    }
    assert.equal(
      (await decideProposal("nope", "confirm", t0)).outcome,
      "not_found"
    )

    console.log("proposals: passed")
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
