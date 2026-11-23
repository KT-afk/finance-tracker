/**
 * The owner's money in three groups (spending money, savings, investments),
 * balances told to the agent, and IBKR: put in (counted from the monthly
 * debits) and its value. All values are made up.
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
  const tmpDir = mkdtempSync(path.join(tmpdir(), "finance-groups-test-"))
  const dbPath = path.join(tmpDir, "test.db")
  const seed = new DatabaseSync(dbPath)
  seed.exec(`
    ${migratedSchemaSql()};
    INSERT INTO balance_history (bank, balance, account_type, recorded_at, statement_date) VALUES
      ('ocbc', 17000, 'savings', '2026-10-01T00:00:00Z', '2026-09-30'),
      ('ocbc', 17877.93, 'savings', '2026-10-13T00:00:00Z', '2026-10-13'),
      ('uob', 2126.87, 'credit_card', '2026-10-13T00:00:00Z', '2026-10-13'),
      ('trust', 31.38, 'savings', '2026-11-02T00:00:00Z', '2026-10-31'),
      ('trust', 140.22, 'credit_card', '2026-11-19T00:00:00Z', '2026-11-18');
    INSERT INTO transactions (id, date, description, amount, bank, category, is_corrected, hash, uploaded_at) VALUES
      ('i1', '2026-09-28', 'COLLECTION/TRANSFER OTHR Interactive Br U17113938', -500, 'ocbc', 'Self Transfer', 0, 'h1', 'x'),
      ('i2', '2026-10-28', 'COLLECTION/TRANSFER OTHR Interactive Br U17113938', -500, 'ocbc', 'Self Transfer', 0, 'h2', 'x'),
      ('c1', '2026-10-14', 'COLLECTION/TRANSFER COLL Chocfin top-up', -100, 'ocbc', 'Self Transfer', 0, 'h3', 'x');
  `)
  seed.close()
  process.env.FINANCE_DB_PATH = dbPath
  delete process.env.DATABASE_URL
  delete process.env.TURSO_DATABASE_URL
  delete process.env.TURSO_AUTH_TOKEN

  try {
    const { balanceGroups } = await import("../lib/balance-groups")
    const { proposeBalance, proposeInvestment, decideProposal } =
      await import("../lib/agent/proposals")
    const { listChanges, undoChange } = await import("../lib/agent/change-log")
    const now = new Date("2026-11-23T04:00:00Z")
    const ctx = { source: "telegram" as const, request: "undo", now }
    const confirm = async (p: Promise<{ id: string; summary: string }>) => {
      const x = await p
      assert.equal(
        (await decideProposal(x.id, "confirm", now)).outcome,
        "applied",
        x.summary
      )
      return x
    }

    const g = await balanceGroups()
    // Spending: Trust $31.38 minus what's owed on both cards
    assert.equal(g.spending.total, 31.38 - 140.22 - 2126.87)
    assert.deepEqual(
      g.spending.accounts
        .map((a) => [a.bank, a.account_type, a.counts_as])
        .sort(),
      [
        ["trust", "credit_card", -140.22],
        ["trust", "savings", 31.38],
        ["uob", "credit_card", -2126.87],
      ]
    )
    // Savings: the latest OCBC balance, not the older one
    assert.equal(g.savings.total, 17877.93)
    assert.equal(g.savings.accounts[0].as_of, "2026-10-13")
    // Investments: two IBKR debits; the Chocolate top-up isn't one
    assert.deepEqual(
      [
        g.investments.put_in,
        g.investments.debits,
        g.investments.first_debit,
        g.investments.value,
      ],
      [1000, 2, "2026-09-28", null]
    )
    assert.deepEqual(g.missing.sort(), ["chocolate", "dbs", "uob", "wise"])

    // A balance told to the agent
    const told = await confirm(
      proposeBalance({
        bank: "wise",
        accountType: "savings",
        balance: 250.5,
        asOf: "2026-11-23",
        source: "telegram",
        request: "wise is 250.50",
        now,
      })
    )
    assert.equal(told.summary, "Balance: WISE account $250.50 on 23 Nov 2026")
    assert.equal(
      (await balanceGroups()).spending.accounts.find((a) => a.bank === "wise")
        ?.counts_as,
      250.5
    )

    // IBKR: put in before the records, then its value; each says what it replaces
    const before = await confirm(
      proposeInvestment({
        putInBefore: 4000,
        value: null,
        valueAsOf: null,
        source: "telegram",
        request: "x",
        now,
      })
    )
    assert.equal(before.summary, "IBKR: put in before records $4,000")
    const worth = await confirm(
      proposeInvestment({
        putInBefore: null,
        value: 6100,
        valueAsOf: null,
        source: "telegram",
        request: "x",
        now,
      })
    )
    assert.equal(
      worth.summary,
      "IBKR: put in before records $4,000, worth $6,100 on 23 Nov 2026 (was put in before records $4,000)"
    )
    const inv = (await balanceGroups()).investments
    assert.deepEqual(
      [inv.put_in, inv.put_in_before, inv.value, inv.value_as_of],
      [5000, 4000, 6100, "2026-11-23"]
    )

    // Logged and undoable
    const log = await listChanges({ limit: 3 })
    assert.deepEqual(
      log.map((c) => [c.kind, c.what]),
      [
        ["investment", "IBKR"],
        ["investment", "IBKR"],
        ["balance", "balance of WISE account"],
      ]
    )
    assert.equal((await undoChange(log[0].id, ctx)).outcome, "undone")
    assert.equal((await balanceGroups()).investments.value, null)
    assert.equal((await undoChange(log[2].id, ctx)).outcome, "undone")
    assert.equal(
      (await balanceGroups()).spending.accounts.find((a) => a.bank === "wise"),
      undefined
    )
    assert.equal((await undoChange(log[1].id, ctx)).outcome, "undone")
    assert.equal((await balanceGroups()).investments.put_in_before, null)

    // Refusals
    await assert.rejects(
      proposeBalance({
        bank: "ibkr",
        accountType: "savings",
        balance: 1,
        asOf: "2026-11-23",
        source: "web",
        request: "x",
        now,
      }),
      /Use one of/
    )
    await assert.rejects(
      proposeBalance({
        bank: "trust",
        accountType: "savings",
        balance: 1,
        asOf: "2026-12-01",
        source: "web",
        request: "x",
        now,
      }),
      /future/
    )
    await assert.rejects(
      proposeInvestment({
        putInBefore: null,
        value: null,
        valueAsOf: null,
        source: "web",
        request: "x",
        now,
      }),
      /Give the amount/
    )
    console.log("balance groups test passed")
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
