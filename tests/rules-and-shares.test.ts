/**
 * Category rules and shares from chat: proposed, applied only on confirm,
 * logged, and undoable, using the same checks as the app.
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
  const tmpDir = mkdtempSync(path.join(tmpdir(), "finance-rules-shares-"))
  const dbPath = path.join(tmpDir, "test.db")
  const seed = new DatabaseSync(dbPath)
  seed.exec(`
    ${migratedSchemaSql()};
    INSERT INTO transactions (id, date, description, payee, amount, bank, category, is_corrected, hash, uploaded_at) VALUES
      ('dinner', '2026-09-05', 'SUSHI TEI', NULL, -120, 'dbs', 'Food & Drink', 0, 'h1', 'x'),
      ('grab1', '2026-09-06', 'GRAB RIDE 123', NULL, -15, 'dbs', 'Shopping', 0, 'h2', 'x'),
      ('grab2', '2026-09-07', 'GRAB RIDE 456', NULL, -12, 'dbs', 'Shopping', 0, 'h3', 'x'),
      ('salary', '2026-09-10', 'SALARY ACME', NULL, 5000, 'dbs', 'Income', 0, 'h4', 'x'),
      ('cash', '2026-09-11', 'Lunch Jane paid', NULL, -20, 'off_bank', 'Food & Drink', 0, 'h5', 'x');
    INSERT INTO category_rules (id, keyword, category, created_at) VALUES
      ('r1', 'fairprice', 'Shopping', 'x');
    INSERT INTO owed_entries (id, transaction_id, person, kind, amount, created_at) VALUES
      ('o1', 'grab2', 'Jane', 'share', 6, 'x');
  `)
  seed.close()
  process.env.FINANCE_DB_PATH = dbPath
  delete process.env.DATABASE_URL
  delete process.env.TURSO_DATABASE_URL
  delete process.env.TURSO_AUTH_TOKEN
  delete process.env.DATABASE_AUTH_TOKEN

  try {
    const { proposeRule, proposeShare, decideProposal } =
      await import("../lib/agent/proposals")
    const { undoChange, listChanges } = await import("../lib/agent/change-log")
    const { findRuleCategory } = await import("../lib/rules")
    const { querySpending } = await import("../lib/agent/query-spending")
    const { db } = await import("../lib/db")
    const { owedEntries, transactions } = await import("../lib/schema")
    const { eq } = await import("drizzle-orm")
    const t0 = new Date("2026-10-20T04:00:00Z")
    const ctx = { source: "telegram" as const, request: "undo", now: t0 }
    const shareOf = async (id: string) => {
      const [row] = await db
        .select()
        .from(owedEntries)
        .where(eq(owedEntries.transaction_id, id))
      return row
        ? { person: row.person, amount: row.amount, kind: row.kind }
        : null
    }
    const foodSpend = async () =>
      (await querySpending("Food & Drink", "2026-09-01", "2026-09-30")).total

    // --- Rules ---
    const r1 = await proposeRule({
      keyword: "  GRAB ",
      category: "Transport",
      source: "telegram",
      request: "always put grab in transport",
      now: t0,
    })
    assert.equal(
      r1.summary,
      "Rule: payments containing “grab” go to Transport (2 past payments match; they keep their categories)"
    )
    assert.equal(
      await findRuleCategory("GRAB RIDE 789"),
      null,
      "not before confirm"
    )
    assert.equal(
      (await decideProposal(r1.id, "confirm", t0)).outcome,
      "applied"
    )
    assert.equal(await findRuleCategory("GRAB RIDE 789"), "Transport")
    const [grab1] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, "grab1"))
    assert.equal(
      grab1.category,
      "Shopping",
      "past payments keep their category"
    )

    // Replacing a rule says what it replaces
    const r2 = await proposeRule({
      keyword: "fairprice",
      category: "Groceries",
      source: "web",
      request: "fairprice is groceries",
      now: t0,
    })
    assert.match(r2.summary, /go to Groceries \(replaces Shopping;/)
    assert.equal(
      (await decideProposal(r2.id, "confirm", t0)).outcome,
      "applied"
    )
    assert.equal(await findRuleCategory("FAIRPRICE XTRA"), "Groceries")

    // Undo: a new rule is removed, a replaced rule goes back
    const changes = await listChanges({})
    assert.equal(changes[0].kind, "rule")
    assert.equal(changes[0].what, "rule “fairprice”")
    assert.equal((await undoChange(changes[0].id, ctx)).outcome, "undone")
    assert.equal(await findRuleCategory("FAIRPRICE XTRA"), "Shopping")
    assert.equal((await undoChange(changes[1].id, ctx)).outcome, "undone")
    assert.equal(await findRuleCategory("GRAB RIDE 789"), null)

    for (const [keyword, category, why] of [
      ["g", "Transport", /2 to 40/],
      ["fairprice", "Snacks", /category/i],
      ["fairprice", "Shopping", /already/i],
      ["jane", "Repayment", /Owed/],
    ] as const) {
      await assert.rejects(
        proposeRule({
          keyword,
          category,
          source: "web",
          request: "x",
          now: t0,
        }),
        why,
        `${keyword} → ${category}`
      )
    }

    // --- Shares ---
    assert.equal(await foodSpend(), 140, "dinner $120 + cash lunch $20")
    const s1 = await proposeShare({
      transactionId: "dinner",
      person: "jane",
      amount: 40,
      source: "telegram",
      request: "jane owes me 40 for dinner",
      now: t0,
    })
    assert.equal(
      s1.summary,
      "Share: Jane owes $40 of SUSHI TEI $120 on 5 Sept 2026"
    )
    assert.equal(await shareOf("dinner"), null, "nothing before confirm")
    assert.equal(
      (await decideProposal(s1.id, "confirm", t0)).outcome,
      "applied"
    )
    assert.deepEqual(await shareOf("dinner"), {
      person: "Jane",
      amount: 40,
      kind: "share",
    })
    assert.equal(
      await foodSpend(),
      100,
      "spending counts only the owner's part"
    )

    // Changing an existing share says what it replaces
    const s2 = await proposeShare({
      transactionId: "grab2",
      person: "Jane",
      amount: 12,
      source: "web",
      request: "jane owes all of that grab",
      now: t0,
    })
    assert.match(s2.summary, /\(replaces Jane owes \$6\)$/)
    assert.equal(
      (await decideProposal(s2.id, "confirm", t0)).outcome,
      "applied"
    )
    assert.equal((await shareOf("grab2"))!.amount, 12)

    // Undo both: back to $6, and the dinner share removed
    const shares = (await listChanges({})).filter((c) => c.kind === "share")
    assert.match(shares[0].after, /Jane owes \$12/, "shown readably")
    assert.equal((await undoChange(shares[0].id, ctx)).outcome, "undone")
    assert.equal((await shareOf("grab2"))!.amount, 6)
    assert.equal((await undoChange(shares[1].id, ctx)).outcome, "undone")
    assert.equal(await shareOf("dinner"), null)
    assert.equal(await foodSpend(), 140)

    // A share changed since the proposal: nothing changes
    const s3 = await proposeShare({
      transactionId: "dinner",
      person: "Jane",
      amount: 60,
      source: "web",
      request: "x",
      now: t0,
    })
    await db.insert(owedEntries).values({
      id: "o2",
      transaction_id: "dinner",
      person: "Ali",
      kind: "share",
      amount: 30,
      created_at: "x",
    })
    assert.equal(
      (await decideProposal(s3.id, "confirm", t0)).outcome,
      "conflict"
    )
    assert.equal((await shareOf("dinner"))!.person, "Ali")

    // The app's own checks: only money paid out from a bank, not more than it
    for (const [transactionId, amount, why] of [
      ["salary", 10, /paid out/],
      ["cash", 10, /bank transaction/],
      ["grab1", 20, /more than the payment/],
      ["grab1", 0, /more than 0/],
      ["missing", 5, /not found/i],
    ] as const) {
      await assert.rejects(
        proposeShare({
          transactionId,
          person: "Jane",
          amount,
          source: "web",
          request: "x",
          now: t0,
        }),
        why,
        `${transactionId} ${amount}`
      )
    }
    console.log("rules-and-shares: passed")
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
