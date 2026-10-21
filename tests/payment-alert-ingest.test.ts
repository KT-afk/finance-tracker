/**
 * Payment Alert ingest end to end on a throwaway database: each email is
 * processed once, a reversal removes the charge it cancels, and a dry run
 * writes nothing. All values are made up.
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

const emails = [
  {
    id: "m1",
    receivedAt: "2026-10-04T01:00:00Z",
    from: UOB,
    subject: "UOB - Transaction Alert",
    body: "A transaction of SGD 12.30 was made with your UOB Card ending 2222 on 04/10/26 at MADE UP CABS. If unauthorised, call now.",
  },
  {
    id: "m2",
    receivedAt: "2026-10-04T02:00:00Z",
    from: UOB,
    subject: "Your transaction has been reversed",
    body: "A transaction of 12.30 SGD made with your UOB card ending 2222 on 4 Oct 26, 1:10AM at MADE UP CABS has been reversed.",
  },
  {
    id: "m3",
    receivedAt: "2026-10-05T13:00:00Z",
    from: OCBC,
    subject: "PayNow transfer made",
    body: `The following PayNow transfer has been made to OXX KXXX using his/her Mobile (+******5555)
Date : 05 Oct 2026
Time : 09:15 PM SGT
Amount : SGD 50.00
From your account : 360 Account (-000111)
Description : OTHR`,
  },
  {
    id: "m4",
    receivedAt: "2026-10-06T04:00:00Z",
    from: UOB,
    subject: "Your eStatement/eAdvice is ready for viewing",
    body: "",
  },
]

async function main() {
  const tmpDir = mkdtempSync(path.join(tmpdir(), "finance-alerts-test-"))
  const dbPath = path.join(tmpDir, "test.db")
  const seed = new DatabaseSync(dbPath)
  seed.exec(migratedSchemaSql())
  seed.close()
  process.env.FINANCE_DB_PATH = dbPath
  delete process.env.DATABASE_URL
  delete process.env.TURSO_DATABASE_URL
  delete process.env.TURSO_AUTH_TOKEN
  delete process.env.ANTHROPIC_API_KEY
  process.env.FINANCE_SELF_PAYNOW_MOBILES = "90005555"

  try {
    const { ingestPaymentAlerts } = await import("../lib/payment-alerts/ingest")
    const { db } = await import("../lib/db")
    const { alertEmails, transactions } = await import("../lib/schema")
    const since = new Date("2026-10-01")

    const dry = await ingestPaymentAlerts({ since, dryRun: true, emails })
    assert.equal(
      dry.outcomes.find((o) => o.messageId === "m2")?.status,
      "reversed"
    )
    assert.equal((await db.select().from(transactions)).length, 0)
    assert.equal((await db.select().from(alertEmails)).length, 0)

    const real = await ingestPaymentAlerts({ since, dryRun: false, emails })
    assert.deepEqual(
      real.outcomes.map((o) => o.status),
      ["saved", "reversed", "self-transfer", "ignored"]
    )
    const rows = await db.select().from(transactions)
    // The reversed cab ride is gone; the transfer to the owner's own mobile stays
    assert.equal(rows.length, 1)
    assert.equal(rows[0].category, "Self Transfer")
    assert.equal(rows[0].source, "alert")
    assert.equal(rows[0].time, "21:15")
    assert.equal((await db.select().from(alertEmails)).length, 4)

    const again = await ingestPaymentAlerts({ since, dryRun: false, emails })
    assert.equal(again.alreadyProcessed, 4)
    assert.equal(again.outcomes.length, 0)
    assert.equal((await db.select().from(transactions)).length, 1)

    console.log("payment alert ingest test passed")
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
