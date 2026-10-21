/**
 * The 10pm message: since-last-night uses alerts that arrived in the last
 * 24 hours, month totals match the dashboard's rules, rent and unusual
 * spending are split out, and the cron endpoint needs CRON_SECRET.
 * All values are made up.
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

// 21 Oct 2026, 10pm in Singapore
const NOW = new Date("2026-10-21T14:00:00Z")

function seed(dbPath: string) {
  const db = new DatabaseSync(dbPath)
  const history = Array.from(
    { length: 6 },
    (_, i) =>
      `('h${i}', '2026-09-${10 + i}', 'NETS QR CAFE', -10, 'ocbc', 'Food & Drink', 0, 'hh${i}', 'x', 'statement')`
  ).join(",\n")
  db.exec(`
    ${migratedSchemaSql()};
    INSERT INTO transactions
      (id, date, description, amount, bank, category, is_corrected, hash, uploaded_at, source)
    VALUES
      ${history},
      ('interest', '2026-09-30', 'INTEREST CREDIT', 0.5, 'ocbc', 'Income', 0, 'i1', 'x', 'statement'),
      ('salary', '2026-09-28', 'IBG GIRO SALA MADE UP CO Salary', 4500, 'ocbc', 'Income', 0, 's1', 'x', 'statement'),
      ('rent', '2026-10-03', 'FAST PAYMENT OTHR-rent to LANDLORD via PayNow-Mobile', -1200, 'ocbc', 'Housing', 0, 'r1', 'x', 'alert'),
      ('dinner', '2026-10-10', 'NETS QR FANCY PLACE', -128, 'ocbc', 'Food & Drink', 0, 'd1', 'x', 'alert'),
      ('lunch', '2026-10-21', 'NETS QR CAFE', -12, 'ocbc', 'Food & Drink', 0, 'l1', 'x', 'alert'),
      ('bus', '2026-10-21', 'BUS', -2, 'uob', 'Transport', 0, 'b1', 'x', 'alert'),
      ('friend', '2026-10-21', 'FAST PAYMENT OTHR-OTHR to JXXX via PayNow-Mobile', -30, 'ocbc', 'Unlabelled', 0, 'f1', 'x', 'alert'),
      ('wise', '2026-10-21', 'FAST PAYMENT to WISE', -100, 'ocbc', 'Self Transfer', 0, 'w1', 'x', 'alert');
    INSERT INTO alert_emails (message_id, bank, received_at, status, transaction_id, processed_at) VALUES
      ('e-old', 'ocbc', '2026-10-10T05:00:00Z', 'saved', 'dinner', 'x'),
      ('e1', 'ocbc', '2026-10-21T04:00:00Z', 'saved', 'lunch', 'x'),
      ('e2', 'uob', '2026-10-21T05:00:00Z', 'saved', 'bus', 'x'),
      ('e3', 'ocbc', '2026-10-21T06:00:00Z', 'saved', 'friend', 'x'),
      ('e4', 'ocbc', '2026-10-21T07:00:00Z', 'self-transfer', 'wise', 'x'),
      ('e5', 'uob', '2026-10-21T08:00:00Z', 'unrecognised', NULL, 'x');
  `)
  db.close()
}

async function main() {
  const tmpDir = mkdtempSync(path.join(tmpdir(), "finance-daily-test-"))
  const dbPath = path.join(tmpDir, "test.db")
  seed(dbPath)
  process.env.FINANCE_DB_PATH = dbPath
  delete process.env.DATABASE_URL
  delete process.env.TURSO_DATABASE_URL
  delete process.env.TURSO_AUTH_TOKEN

  try {
    const { buildDailySummary, formatDailyMessage } =
      await import("../lib/daily-message")
    const s = await buildDailySummary(NOW)

    // Since last night: lunch, bus and the unlabelled transfer; not Wise
    assert.equal(s.sinceLastNight.total, 44)
    assert.deepEqual(s.sinceLastNight.byCategory, [
      ["Unlabelled", 30],
      ["Food & Drink", 12],
      ["Transport", 2],
    ])
    // Month: rent 1200 + dinner 128 + 44, Self Transfer excluded
    assert.equal(s.monthTotal, 1372)
    assert.equal(s.rent, 1200)
    assert.deepEqual(
      s.unusual.map((u) => [u.payee, u.amount]),
      [["NETS QR FANCY PLACE", 128]]
    )
    assert.equal(s.dayToDay, 44)
    assert.equal(s.daysElapsed, 21)
    assert.equal(s.averagePerDay, 44 / 21)
    assert.equal(s.salary, 4500)
    assert.equal(s.pace, 1200 + 128 + (44 / 21) * 31)
    assert.deepEqual(s.unlabelled, { count: 1, total: 30 })
    assert.equal(s.warnings.length, 1)

    const text = formatDailyMessage(s, "https://example.test")
    assert.match(text, /^⚠ 1 bank email I couldn't read/)
    assert.match(text, /Since last night: \$44.00\n/)
    // One line per payment, with the Payee and category
    assert.match(text, /^• \$12.00  NETS QR CAFE · Food & Drink$/m)
    assert.match(text, /^• \$2.00  BUS · Transport$/m)
    assert.match(text, /^• \$30.00  .* · ❓ Unlabelled$/m)
    // Unusual spending sits with the month, not since last night
    assert.match(text, /Oct so far: .*\n  ⚠ \$128 at NETS QR FANCY PLACE/)
    assert.match(
      text,
      /Oct so far: \$1,372 \(rent \$1,200 · unusual \$128 · day-to-day \$44\)/
    )
    assert.match(text, /of \$4,500 salary/)
    assert.match(
      text,
      /Unlabelled: 1 payment, \$30 → https:\/\/example.test\/transactions\?month=2026-10&review=unlabelled/
    )

    // The endpoint refuses without the secret, and when none is configured
    const { GET } = await import("../app/api/cron/daily/route")
    const { NextRequest } = await import("next/server")
    delete process.env.CRON_SECRET
    assert.equal(
      (await GET(new NextRequest("http://localhost/api/cron/daily"))).status,
      503
    )
    process.env.CRON_SECRET = "test-secret"
    assert.equal(
      (
        await GET(
          new NextRequest("http://localhost/api/cron/daily", {
            headers: { authorization: "Bearer wrong" },
          })
        )
      ).status,
      401
    )

    console.log("daily message test passed")
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
