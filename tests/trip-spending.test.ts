/**
 * Trip spending: only payments abroad (a country code other than SG at the
 * end of the bank text, or a foreign currency), between the dates, at the
 * owner's share. All values are made up.
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
  const tmpDir = mkdtempSync(path.join(tmpdir(), "finance-trip-test-"))
  const dbPath = path.join(tmpDir, "test.db")
  const seed = new DatabaseSync(dbPath)
  seed.exec(`
    ${migratedSchemaSql()};
    INSERT INTO transactions (id, date, description, amount, bank, category, is_corrected, hash, uploaded_at, currency) VALUES
      ('olive', '2026-04-26', 'CJ OLIVE YOUNG DONGDAEMUNSEOUL KR', -185.51, 'trust', 'Shopping', 0, 'h1', 'x', NULL),
      ('bbq', '2026-04-28', 'MADE UP BBQ SEOUL KR', -80, 'trust', 'Food & Drink', 0, 'h2', 'x', NULL),
      ('taxi', '2026-05-08', 'Kakao Mobility 16448830 KR', -14.79, 'trust', 'Transport', 0, 'h3', 'x', NULL),
      ('tokyo', '2026-05-02', 'MADE UP SHOP TOKYO JP', -50, 'trust', 'Shopping', 0, 'h4', 'x', NULL),
      ('fx', '2026-05-03', 'MADE UP ONLINE STORE', -20, 'wise', 'Shopping', 0, 'h5', 'x', 'KRW'),
      ('grab', '2026-04-26', 'GRAB RIDE SINGAPORE SG', -25, 'uob', 'Transport', 0, 'h6', 'x', NULL),
      ('rent', '2026-05-01', 'RENT TO LANDLORD', -3000, 'ocbc', 'Housing', 0, 'h7', 'x', NULL),
      ('refund', '2026-04-29', 'MADE UP REFUND SEOUL KR', 30, 'trust', 'Shopping', 0, 'h8', 'x', NULL),
      ('amaes', '2026-05-11', '(JOO)AMAESCOTES SEOUL KR                       394,200.', -344.66, 'trust', 'Shopping', 0, 'h10', 'x', NULL),
      ('after', '2026-05-20', 'MADE UP CAFE SEOUL KR', -9, 'trust', 'Food & Drink', 0, 'h9', 'x', NULL);
    INSERT INTO owed_entries (id, transaction_id, person, kind, amount, created_at)
      VALUES ('o1', 'bbq', 'Yoon Thiri', 'share', 40, 'x');
  `)
  seed.close()
  process.env.FINANCE_DB_PATH = dbPath
  delete process.env.DATABASE_URL
  delete process.env.TURSO_DATABASE_URL
  delete process.env.TURSO_AUTH_TOKEN

  try {
    const { tripSpending, parseTripInput, countryOf } =
      await import("../lib/agent/trip-spending")
    const korea = await tripSpending({
      date_from: "2026-04-26",
      date_to: "2026-05-13",
      country: "KR",
    })
    // Olive Young, the owner's $40 of the barbecue, the taxi, and a shop
    // whose bank text ends with the amount in won; not Singapore,
    // not Japan, not money in, not after the trip
    assert.equal(korea.count, 4)
    assert.equal(korea.total, 584.96)
    assert.equal(korea.gross_total, 624.96)
    assert.equal(korea.days, 18)
    assert.equal(korea.per_day, 32.5)
    assert.deepEqual(
      korea.by_category.map((c) => c.category),
      ["Shopping", "Food & Drink", "Transport"]
    )
    assert.deepEqual(
      [korea.first_payment, korea.last_payment],
      ["2026-04-26", "2026-05-11"]
    )
    assert.equal(korea.biggest[0].amount, 344.66)

    // Every country: Japan, and a payment in won with no code
    const all = await tripSpending({
      date_from: "2026-04-26",
      date_to: "2026-05-13",
    })
    assert.deepEqual(
      all.by_country.map((c) => [c.country, c.count]),
      [
        ["KR", 4],
        ["JP", 1],
        ["KRW", 1],
      ]
    )

    assert.equal(
      countryOf({ description: "NTUC FAIRPRICE SINGAPORE", currency: null }),
      null
    )
    assert.equal(
      countryOf({ description: "SHOP SINGAPORE SG", currency: "SGD" }),
      null
    )
    for (const bad of [
      {},
      { date_from: "2026-05-13", date_to: "2026-04-26", country: null },
      { date_from: "2026-01-01", date_to: "2026-06-30", country: null },
      { date_from: "2026-04-26", date_to: "2026-05-13", country: "Korea" },
      {
        date_from: "2026-04-26",
        date_to: "2026-05-13",
        country: null,
        extra: 1,
      },
    ])
      assert.throws(() => parseTripInput(bad))
    assert.deepEqual(
      parseTripInput({
        date_from: "2026-04-26",
        date_to: "2026-05-13",
        country: "kr",
      }),
      {
        date_from: "2026-04-26",
        date_to: "2026-05-13",
        country: "KR",
      }
    )
    console.log("trip spending test passed")
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
