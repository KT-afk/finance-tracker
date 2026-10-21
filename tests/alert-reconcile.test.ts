/**
 * Reconciliation: a Statement upload confirms the Transactions already known
 * from Payment Alerts instead of adding second copies, and re-uploading the
 * same Statement adds nothing. All values are made up.
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

const UOB = "unialerts@uobgroup.com"
const OCBC = "notifications@ocbc.com"

function card(id: string, amount: string, date: string, merchant: string) {
  return {
    id,
    receivedAt: `${date}T04:00:00Z`,
    from: UOB,
    subject: "UOB - Transaction Alert",
    body: `A transaction of SGD ${amount} was made with your UOB Card ending 2222 on ${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(2, 4)} at ${merchant}. If unauthorised, call now.`,
  }
}

function nets(id: string, amount: string, day: string, merchant: string) {
  return {
    id,
    receivedAt: `2026-10-${day}T05:00:00Z`,
    from: OCBC,
    subject: "NETS QR payment",
    body: `The following NETS QR payment has been made:
Date : ${day} Oct 2026
Time : 01:48pm SGT
Amount : SGD ${amount}
From your account : 360 Account (-000111)
To : ${merchant}`,
  }
}

let n = 0
function line(date: string, description: string, amount: number, bank: string) {
  n++
  return {
    id: `line-${n}`,
    date,
    description,
    amount,
    bank,
    category: "Others",
    is_corrected: false,
    hash: `statement-hash-${n}`,
    uploaded_at: "2026-11-01T00:00:00.000Z",
  }
}

async function main() {
  const tmpDir = mkdtempSync(path.join(tmpdir(), "finance-reconcile-test-"))
  const dbPath = path.join(tmpDir, "test.db")
  const seed = new DatabaseSync(dbPath)
  seed.exec(migratedSchemaSql())
  seed.close()
  process.env.FINANCE_DB_PATH = dbPath
  delete process.env.DATABASE_URL
  delete process.env.TURSO_DATABASE_URL
  delete process.env.TURSO_AUTH_TOKEN
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.APP_PASSWORD

  try {
    const { ingestPaymentAlerts } = await import("../lib/payment-alerts/ingest")
    const { POST } = await import("../app/api/upload/confirm/route")
    const { db } = await import("../lib/db")
    const { transactions, owedRules, owedEntries } =
      await import("../lib/schema")
    // Owed rules apply to alerts as they do to uploads
    await db.insert(owedRules).values({
      id: "rule1",
      keyword: "made up noodles",
      person: "Partner",
      amount: 3,
      starts_on: "2026-10-01",
      created_at: "x",
    })

    await ingestPaymentAlerts({
      since: new Date("2026-10-01"),
      dryRun: false,
      emails: [
        card("c1", "12.30", "2026-10-04", "MADE UP CABS"),
        nets("n1", "2.50", "13", "THE MADE UP CAFE"),
        nets("n2", "2.50", "14", "THE MADE UP CAFE"),
        nets("n3", "9.90", "20", "MADE UP NOODLES"),
      ],
    })
    assert.equal((await db.select().from(transactions)).length, 4)
    const shares = await db.select().from(owedEntries)
    assert.equal(shares.length, 1)
    assert.equal(shares[0].amount, 3)

    const statement = [
      // Card purchase posted two days after the alert
      line("2026-10-06", "MADE UP CABS SINGAPORE", -12.3, "uob"),
      // Two identical coffees: each confirms one alert
      line("2026-10-13", "NETS QR THE MADE UP CAFE", -2.5, "ocbc"),
      line("2026-10-14", "NETS QR THE MADE UP CAFE", -2.5, "ocbc"),
      // Something the alerts missed
      line("2026-10-15", "GIRO MADE UP INSURANCE", -80, "ocbc"),
      // Same amount as an alert but on another bank: not a match
      line("2026-10-20", "MADE UP NOODLES", -9.9, "uob"),
      // Money in is never matched against alerts
      line("2026-10-25", "SALARY", 5000, "ocbc"),
    ]
    const upload = () =>
      POST(
        new Request("http://localhost/api/upload/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transactions: statement }),
        }) as never
      )

    const first = await (await upload()).json()
    assert.deepEqual(first, { inserted: 3, skipped: 0, matched: 3 })

    const rows = await db.select().from(transactions)
    // 4 alerts + 3 new Statement Lines, no copies
    assert.equal(rows.length, 7)
    const confirmed = rows.filter((r) => r.confirmed_at)
    assert.equal(confirmed.length, 3)
    // The alert keeps its details
    const cab = rows.find((r) => r.payee === "MADE UP CABS")
    assert.ok(cab?.confirmed_at)
    assert.equal(cab?.source, "alert")
    // The OCBC noodles alert had no OCBC line, so it is still unconfirmed
    const noodles = rows.find(
      (r) => r.source === "alert" && r.payee === "MADE UP NOODLES"
    )
    assert.equal(noodles?.confirmed_at, null)

    const second = await (await upload()).json()
    assert.deepEqual(second, { inserted: 0, skipped: 6, matched: 0 })
    assert.equal((await db.select().from(transactions)).length, 7)

    console.log("alert reconcile test passed")
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
