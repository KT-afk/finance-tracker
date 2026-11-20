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
  // Its own empty database: rules are looked up, and this must never fall
  // back to the live one (book lesson 1)
  const tmpDir = mkdtempSync(path.join(tmpdir(), "finance-categorize-"))
  const dbPath = path.join(tmpDir, "test.db")
  const seed = new DatabaseSync(dbPath)
  seed.exec(migratedSchemaSql())
  seed.close()
  process.env.FINANCE_DB_PATH = dbPath
  delete process.env.DATABASE_URL
  delete process.env.TURSO_DATABASE_URL
  delete process.env.TURSO_AUTH_TOKEN
  delete process.env.DATABASE_AUTH_TOKEN
  const { categorize, getKnownCategory } = await import("../lib/categorize")

  const previousKey = process.env.ANTHROPIC_API_KEY
  delete process.env.ANTHROPIC_API_KEY

  try {
    assert.equal(
      getKnownCategory(
        "PAYMENT/TRANSFER via PayNow-TRBU from ONG KONG TAT OTHR 20260607TRBUSGSGBRT318506",
        -3000
      ),
      "Self Transfer",
      "self-transfers must be excluded even when an imported amount has the wrong sign"
    )

    assert.equal(
      getKnownCategory("Ong KONG TAT", -4605),
      "Self Transfer",
      "account-holder metadata must not be counted as spending"
    )

    assert.equal(
      getKnownCategory(
        "IBG GIRO SALA Wise Asia-Pacific P Wise SG Salary",
        6733.55
      ),
      "Income",
      "salary credits must override generic merchant rules"
    )
    assert.equal(
      getKnownCategory(
        "FAST PAYMENT via PayNow-Mobile to WOXX KEX MEX OTHR-OTHR",
        -1.9
      ),
      null,
      "ordinary PayNow payments must not be inferred as credit-card payments"
    )
    assert.equal(
      getKnownCategory("Bill Payment mBK-UOB Cards", -1509.92),
      "Credit Card Payment",
      "UOB card bill payments must remain deterministic"
    )

    assert.equal(
      await categorize(
        "PAYMENT/TRANSFER via PayNow-TRBU from ONG KONG TAT OTHR 20260607TRBUSGSGBRT318506",
        { amount: 3000 }
      ),
      "Self Transfer",
      "self-transfers must not be categorized as income or spend"
    )

    assert.equal(
      await categorize(
        "PAYMENT/TRANSFER via PayNow-DBSS from YOON THIRI OTHR Remainder of mar/apr",
        { amount: 500 }
      ),
      "Reimbursement",
      "identified repayments must be separated from salary income"
    )

    assert.equal(
      await categorize("FAST PAYMENT via PayNow-Mobile to LANDLORD OTHR-rent", {
        amount: -2400,
      }),
      "Housing",
      "rent payments must be categorized as Housing"
    )

    assert.equal(
      await categorize(
        "COLLECTION/TRANSFER OTHR Interactive Br U17113938.839959",
        { amount: -500 }
      ),
      "Self Transfer",
      "the monthly IBKR debit is investing: the owner's own money, not spend"
    )
    assert.equal(
      await categorize(
        "COLLECTION/TRANSFER COLL Direct debit (Chocolate or IBKR)",
        {
          amount: -500,
        }
      ),
      "Self Transfer",
      "an OCBC direct-debit alert (Chocolate or IBKR) is not spend"
    )

    await assert.rejects(
      () => categorize("NETS QR PURCHASE PU TIAN", { requireAi: true }),
      /ANTHROPIC_API_KEY is not configured/
    )
  } finally {
    if (previousKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY
    } else {
      process.env.ANTHROPIC_API_KEY = previousKey
    }
    rmSync(tmpDir, { recursive: true, force: true })
  }

  console.log("strict categorization test passed")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
