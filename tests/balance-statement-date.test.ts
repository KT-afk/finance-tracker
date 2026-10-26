/**
 * Each balance keeps the date it was true for (statement_date) apart from
 * when it was saved (recorded_at). The latest balance is picked by that
 * date, with old rows falling back to the day they were saved.
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

function seed(dbPath: string) {
  const db = new DatabaseSync(dbPath)
  db.exec(`
    ${migratedSchemaSql()};
    INSERT INTO balance_history (bank, balance, account_type, recorded_at, statement_date) VALUES
      -- An old row: an August statement uploaded on 5 Oct, before ticket 25
      ('dbs', 8000, 'savings', '2026-10-05T03:00:00.000Z', NULL),
      -- September statement uploaded later the same day: newer, must win
      ('dbs', 9500, 'savings', '2026-10-05T04:00:00.000Z', '2026-09-30'),
      -- An older July statement uploaded after both: must not win
      ('dbs', 7000, 'savings', '2026-10-06T04:00:00.000Z', '2026-07-31'),
      ('uob', 1200, 'savings', '2026-09-02T04:00:00.000Z', NULL);
  `)
  db.close()
}

async function main() {
  const tmpDir = mkdtempSync(path.join(tmpdir(), "finance-balance-date-"))
  const dbPath = path.join(tmpDir, "test.db")
  seed(dbPath)
  process.env.FINANCE_DB_PATH = dbPath
  delete process.env.DATABASE_URL
  delete process.env.TURSO_DATABASE_URL
  delete process.env.TURSO_AUTH_TOKEN
  delete process.env.DATABASE_AUTH_TOKEN

  try {
    // CSV statements carry a running balance: the last one is dated by its row
    const { parseDBS } = await import("../lib/parsers/dbs")
    const dbs = parseDBS(
      [
        "Date,Reference,Debit Amount,Credit Amount,Balance",
        "03 Sep 2026,GRAB,12.00,,988.00",
        "28 Sep 2026,SALARY,,5000.00,5988.00",
      ].join("\n")
    )
    assert.equal(dbs.endingBalance, 5988)
    assert.equal(dbs.statementDate, "2026-09-28")

    const { statementDateFor } = await import("../lib/balance-history")
    // Parser's own date first; else the statement's last transaction
    assert.equal(
      statementDateFor({ statementDate: "2026-09-30" }, ["2026-09-28"]),
      "2026-09-30"
    )
    assert.equal(
      statementDateFor({}, ["2026-09-03", "2026-09-28", "2026-09-15"]),
      "2026-09-28"
    )
    assert.equal(statementDateFor({}, []), undefined)

    const { getBalances } = await import("../lib/agent/query-cash-flow")
    assert.deepEqual((await getBalances()).balances, [
      {
        bank: "dbs",
        account_type: "savings",
        balance: 9500,
        as_of: "2026-09-30",
        exact: true,
      },
      {
        bank: "uob",
        account_type: "savings",
        balance: 1200,
        as_of: "2026-09-02",
        exact: false,
      },
    ])

    const { GET } = await import("../app/api/balances/route")
    const body = await (await GET()).json()
    assert.deepEqual(
      body.balances.map((b: { bank: string; balance: number }) => [
        b.bank,
        b.balance,
      ]),
      [
        ["dbs", 9500],
        ["uob", 1200],
      ],
      "dashboard agrees with the agent"
    )

    // Manual edits are dated the day they are typed, in Singapore
    const { POST } = await import("../app/api/balances/route")
    await POST(
      new Request("http://localhost/api/balances", {
        method: "POST",
        body: JSON.stringify({ bank: "uob", balance: 1500 }),
      }) as never
    )
    const uob = (await getBalances()).balances.find((b) => b.bank === "uob")
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Singapore",
    }).format(new Date())
    assert.deepEqual(
      [uob?.balance, uob?.as_of, uob?.exact],
      [1500, today, true]
    )
    const { balanceDateLabel } = await import("../lib/display")
    assert.equal(
      balanceDateLabel({
        recorded_at: "2026-10-05T04:00:00.000Z",
        as_of: "2026-09-30",
        exact: true,
      }),
      "As of 30 Sept"
    )
    assert.match(
      balanceDateLabel({
        recorded_at: "2026-09-02T04:00:00.000Z",
        as_of: "2026-09-02",
        exact: false,
      }),
      /^Updated /
    )
    console.log("balance-statement-date: passed")
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
