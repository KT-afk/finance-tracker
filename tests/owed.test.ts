/**
 * Owed money end to end: a split payment counts only the owner's part as
 * spend, a repayment is neither income nor spend, and the running total
 * per person adds up.
 */
import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (path: string) => { exec(sql: string): void; close(): void }
}

const RENT = "FAST PAYMENT via PayNow to LANDLORD LIM OTHR rent"

function seed(dbPath: string) {
  const db = new DatabaseSync(dbPath)
  db.exec(`
    CREATE TABLE transactions (
      id text PRIMARY KEY NOT NULL,
      date text NOT NULL,
      description text NOT NULL,
      amount real NOT NULL,
      bank text NOT NULL,
      category text DEFAULT 'Others' NOT NULL,
      is_corrected integer DEFAULT false NOT NULL,
      hash text NOT NULL UNIQUE,
      uploaded_at text NOT NULL
    );
    CREATE TABLE category_rules (
      id text PRIMARY KEY NOT NULL,
      keyword text NOT NULL UNIQUE,
      category text NOT NULL,
      created_at text NOT NULL
    );
    INSERT INTO transactions VALUES
      ('jun', '2026-06-01', '${RENT} jun', -3000, 'dbs', 'Housing', 0, 'h0', 'x'),
      ('jul', '2026-07-01', '${RENT} jul', -3000, 'dbs', 'Housing', 0, 'h1', 'x'),
      ('aug', '2026-08-01', '${RENT}  aug', -3000, 'dbs', 'Housing', 0, 'h2', 'x'),
      ('food', '2026-08-03', 'FAIRPRICE FINEST', -100, 'dbs', 'Groceries', 0, 'h3', 'x'),
      ('back', '2026-09-15',
        'PAYMENT/TRANSFER via PayNow-DBSS from JANE TAN OTHR rent', 1000,
        'dbs', 'Transfer', 0, 'h4', 'x');
  `)
  db.close()
}

async function json(res: Response) {
  return res.json()
}

async function main() {
  const tmpDir = mkdtempSync(path.join(tmpdir(), "finance-owed-test-"))
  const dbPath = path.join(tmpDir, "test.db")
  seed(dbPath)
  process.env.FINANCE_DB_PATH = dbPath
  delete process.env.DATABASE_URL
  delete process.env.TURSO_DATABASE_URL
  delete process.env.TURSO_AUTH_TOKEN
  delete process.env.DATABASE_AUTH_TOKEN
  delete process.env.APP_PASSWORD

  try {
    const owed = await import("../lib/owed")
    const dashboard = await import("../app/api/dashboard/route")
    const categories = await import("../app/api/categories/route")
    const confirm = await import("../app/api/upload/confirm/route")
    const patch = await import("../app/api/transactions/[id]/route")
    const manual = await import("../app/api/transactions/route")
    const { querySpending } = await import("../lib/agent/query-spending")

    const month = async (m: string) =>
      json(
        await dashboard.GET(
          new Request(`http://localhost/api/dashboard?month=${m}`) as never
        )
      )

    // Rule from July backfills July and August, not June
    const { applied } = await owed.createOwedRule({
      keyword: "LANDLORD LIM",
      person: "Jane",
      amount: 1000,
      startsOn: "2026-07-01",
    })
    assert.equal(applied, 2)

    const jun = await month("2026-06")
    assert.equal(jun.totalSpend, 3000, "before the rule's start date")
    const jul = await month("2026-07")
    assert.equal(jul.totalSpend, 2000, "only the owner's part is spend")
    assert.deepEqual(jul.topCategories, [{ category: "Housing", amount: 2000 }])
    const aug = await month("2026-08")
    assert.equal(aug.totalSpend, 2100)
    assert.equal(aug.momDelta, 100)

    // Repayment arrives months later: not income, not a transfer to review
    await owed.markRepayment("back", { person: "Jane" })
    const sep = await month("2026-09")
    assert.equal(sep.totalIncome, 0)
    assert.equal(sep.totalReimbursements, 0)
    assert.equal(sep.unclassifiedTransfers, 0)
    assert.equal(sep.netCashFlow, 0)

    let summary = await owed.getOwedSummary()
    assert.deepEqual(summary.balances, [{ person: "Jane", balance: 1000 }])
    assert.deepEqual(
      summary.ledger.map((e) => [e.transaction_id, e.balance]),
      [
        ["back", 1000],
        ["aug", 2000],
        ["jul", 1000],
      ]
    )

    // New rent from an upload is split automatically
    const res = await confirm.POST(
      new Request("http://localhost/api/upload/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactions: [
            {
              id: "oct",
              date: "2026-10-01",
              description: `${RENT} oct`,
              amount: -3000,
              bank: "dbs",
              category: "Housing",
              is_corrected: false,
              hash: "h5",
              uploaded_at: "x",
            },
          ],
        }),
      }) as never
    )
    assert.equal(res.status, 200)
    summary = await owed.getOwedSummary()
    assert.deepEqual(summary.balances, [{ person: "Jane", balance: 2000 }])

    // Removing a split by hand isn't undone by the rule later
    await owed.removeOwedEntry("oct")
    assert.equal(await owed.applyOwedRulesTo(["jul"]), 0)

    // Category totals and the agent's spending tool see the owner's part only
    const cats = await json(
      await categories.GET(
        new Request("http://localhost/api/categories?month=2026-07")
      )
    )
    assert.deepEqual(
      cats.items.map((i: { category: string; total: number }) => [
        i.category,
        i.total,
      ]),
      [["Housing", 2000]]
    )
    const housing = await querySpending("Housing")
    assert.equal(housing.total, 3000 + 2000 + 2000 + 3000)

    // Repayment can't be set from the plain category picker...
    const rejected = await patch.PATCH(
      new Request("http://localhost/api/transactions/food", {
        method: "PATCH",
        body: JSON.stringify({ category: "Repayment" }),
      }) as never,
      { params: Promise.resolve({ id: "food" }) }
    )
    assert.equal(rejected.status, 400)

    // ...and recategorising a repayment drops it from the total
    const moved = await patch.PATCH(
      new Request("http://localhost/api/transactions/back", {
        method: "PATCH",
        body: JSON.stringify({ category: "Reimbursement" }),
      }) as never,
      { params: Promise.resolve({ id: "back" }) }
    )
    assert.equal(moved.status, 200)
    summary = await owed.getOwedSummary()
    assert.deepEqual(summary.balances, [{ person: "Jane", balance: 2000 }])

    // She paid for groceries for the owner: lowers what she owes, and is
    // the owner's spend under no bank
    const covered = await owed.addOwedAdjustment({
      kind: "covered",
      person: "Jane",
      amount: 200,
      note: "Groceries",
      category: "",
      date: "2026-09-20",
    })
    assert.equal(covered.category, "Paid by Others")
    summary = await owed.getOwedSummary()
    assert.deepEqual(summary.balances, [{ person: "Jane", balance: 1800 }])
    const sepAll = await month("2026-09")
    assert.equal(sepAll.totalSpend, 200)
    assert.deepEqual(sepAll.topCategories, [
      { category: "Paid by Others", amount: 200 },
    ])
    const sepDbs = await json(
      await dashboard.GET(
        new Request(
          "http://localhost/api/dashboard?month=2026-09&bank=dbs"
        ) as never
      )
    )
    assert.equal(sepDbs.totalSpend, 0, "not attributed to any bank")

    // Off-bank rows can be recategorised but not split or repaid
    const recat = await patch.PATCH(
      new Request("http://localhost/api/transactions/x", {
        method: "PATCH",
        body: JSON.stringify({ category: "Groceries" }),
      }) as never,
      { params: Promise.resolve({ id: covered.transactionId }) }
    )
    assert.equal(recat.status, 200)
    assert.deepEqual((await month("2026-09")).topCategories, [
      { category: "Groceries", amount: 200 },
    ])
    await assert.rejects(
      owed.setOwedShare(covered.transactionId, { person: "Jane", amount: 1 }),
      /bank transaction/
    )
    const paidByOthers = await patch.PATCH(
      new Request("http://localhost/api/transactions/food", {
        method: "PATCH",
        body: JSON.stringify({ category: "Paid by Others" }),
      }) as never,
      { params: Promise.resolve({ id: "food" }) }
    )
    assert.equal(paidByOthers.status, 400)

    // Letting some of it go: capped at what she owes, becomes the owner's spend
    await assert.rejects(
      owed.addOwedAdjustment({
        kind: "forgiven",
        person: "Jane",
        amount: 5000,
        note: "",
        category: "Housing",
        date: "2026-10-05",
      }),
      /more than they owe/
    )
    await owed.addOwedAdjustment({
      kind: "forgiven",
      person: "Jane",
      amount: 800,
      note: "",
      category: "Housing",
      date: "2026-10-05",
    })
    summary = await owed.getOwedSummary()
    assert.deepEqual(summary.balances, [{ person: "Jane", balance: 1000 }])
    assert.equal((await month("2026-10")).totalSpend, 3000 + 800)

    // Removing the groceries entry deletes its transaction and restores the debt
    await owed.removeOwedEntry(covered.transactionId)
    summary = await owed.getOwedSummary()
    assert.deepEqual(summary.balances, [{ person: "Jane", balance: 1200 }])
    assert.equal((await month("2026-09")).totalSpend, 0)

    // To sort: her earlier repayment taught us "JANE TAN" is Jane, so that
    // transfer is suggested even after being recategorised; the October rent
    // whose split was removed is flagged as possibly owed
    let toSort = await owed.getToSort("2026-06-20")
    assert.deepEqual(
      toSort.incoming.map((t) => [t.id, t.suggestedPerson]),
      [["back", "Jane"]]
    )
    assert.deepEqual(
      toSort.outgoing.map((t) => [t.id, t.suggestedPerson]),
      [["oct", "Jane"]]
    )
    await owed.dismissToSort("oct")
    toSort = await owed.getToSort("2026-06-20")
    assert.deepEqual(toSort.outgoing, [])
    await assert.rejects(owed.dismissToSort("missing"), /not found/)

    // --- Regressions from QA ---
    const addManual = async (body: object) =>
      (
        await json(
          await manual.POST(
            new Request("http://localhost/api/transactions", {
              method: "POST",
              body: JSON.stringify(body),
            }) as never
          )
        )
      ).transaction.id as string

    // A repayment whose bank text says "share" is still only a repayment,
    // not also a reimbursement
    const shareText = await addManual({
      date: "2026-11-02",
      description: "PAYMENT/TRANSFER OTHR from JANE TAN rent share",
      amount: 500,
      bank: "dbs",
      category: "Transfer",
    })
    await owed.markRepayment(shareText, { person: "Jane" })
    const nov = await month("2026-11")
    assert.equal(nov.totalReimbursements, 0)
    assert.equal(nov.netCashFlow, 0)

    // Off-bank notes aren't read as bank text
    await owed.addOwedAdjustment({
      kind: "covered",
      person: "Jane",
      amount: 40,
      note: "Jane paid credit card payment for my groceries at rent house",
      category: "Groceries",
      date: "2026-11-03",
    })
    assert.deepEqual((await month("2026-11")).topCategories, [
      { category: "Groceries", amount: 40 },
    ])

    // Saving an existing rule again doesn't bring back a removed split
    const resaved = await owed.createOwedRule({
      keyword: "landlord lim",
      person: "Jane",
      amount: 1200,
      startsOn: "2026-07-01",
    })
    assert.equal(resaved.applied, 0)
    assert.equal((await owed.loadOwedEntriesFor(["oct"])).size, 0)

    // Names: same person whatever the case or spacing
    const lower = await owed.addOwedAdjustment({
      kind: "covered",
      person: "  jane ",
      amount: 1,
      note: "",
      category: "",
      date: "2026-11-04",
    })
    assert.equal(lower.person, "Jane")

    // Amounts typed with commas are fine
    const comma = await owed.addOwedAdjustment({
      kind: "covered",
      person: "Jane",
      amount: "1,000",
      note: "",
      category: "",
      date: "2026-11-04",
    })
    assert.equal(comma.amount, 1000)
    await owed.removeOwedEntry(comma.transactionId)

    // Impossible dates and silly amounts
    await assert.rejects(
      owed.addOwedAdjustment({
        kind: "covered",
        person: "Jane",
        amount: 1,
        note: "",
        category: "",
        date: "2026-13-45",
      }),
      /Pick a date/
    )
    await assert.rejects(
      owed.createOwedRule({
        keyword: "something",
        person: "Jane",
        amount: 1,
        startsOn: "2026-02-30",
      }),
      /start date/
    )
    for (const amount of [1e15, [5], null, "0x10", "1e3"]) {
      await assert.rejects(
        owed.addOwedAdjustment({
          kind: "covered",
          person: "Jane",
          amount,
          note: "",
          category: "",
          date: "2026-11-04",
        })
      )
    }

    // Deleting a manual transaction takes its split with it
    const grab = await addManual({
      date: "2026-11-05",
      description: "GRAB FOOD",
      amount: -50,
      bank: "dbs",
      category: "Food & Drink",
    })
    await owed.setOwedShare(grab, { person: "Bob", amount: 25 })
    await patch.DELETE(
      new Request(`http://localhost/api/transactions/${grab}`, {
        method: "DELETE",
      }) as never,
      { params: Promise.resolve({ id: grab }) }
    )
    assert.equal((await owed.loadOwedEntriesFor([grab])).size, 0)

    // Imports can't smuggle in owner-only categories
    await confirm.POST(
      new Request("http://localhost/api/upload/confirm", {
        method: "POST",
        body: JSON.stringify({
          transactions: [
            {
              id: "smuggled",
              date: "2026-11-06",
              description: "PAYMENT/TRANSFER from SOMEONE",
              amount: 10,
              bank: "dbs",
              category: "Repayment",
              is_corrected: false,
              hash: "h-smuggled",
              uploaded_at: "x",
            },
          ],
        }),
      }) as never
    )
    const smuggled = await json(
      await manual.GET(
        new Request(
          "http://localhost/api/transactions?month=2026-11&category=Repayment"
        ) as never
      )
    )
    assert.deepEqual(
      smuggled.transactions.map((t: { id: string }) => t.id),
      [shareText]
    )

    // Validation
    await assert.rejects(
      owed.setOwedShare("jul", { person: "Jane", amount: 5000 }),
      /more than the payment/
    )
    await assert.rejects(
      owed.markRepayment("jul", { person: "Jane" }),
      /money you received/
    )
    await assert.rejects(
      owed.setOwedShare("jul", { person: " ", amount: 10 }),
      /who owes/
    )

    console.log("owed test passed")
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
