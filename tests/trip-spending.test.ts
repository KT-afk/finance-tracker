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
    // Saved trips: proposed, confirmed, then a flight from Singapore and a
    // cash entry added, a payment abroad left out; logged and undoable
    const { proposeTrip, proposeTripPayment, decideProposal } =
      await import("../lib/agent/proposals")
    const { listChanges, undoChange } = await import("../lib/agent/change-log")
    const { db } = await import("../lib/db")
    const { transactions } = await import("../lib/schema")
    await db.insert(transactions).values([
      {
        id: "flight",
        date: "2026-03-02",
        description: "SINGAPORE AIRLINES SINGAPORE",
        amount: -780,
        bank: "uob",
        category: "Travel",
        is_corrected: false,
        hash: "f1",
        uploaded_at: "x",
      },
      {
        id: "cash",
        date: "2026-04-26",
        description: "Korea trip cash",
        amount: -1000,
        bank: "off_bank",
        category: "Travel",
        is_corrected: false,
        hash: "c1",
        uploaded_at: "x",
      },
    ])
    const now = new Date("2026-10-31T04:00:00Z")
    const ctx = { source: "web" as const, request: "undo", now }
    const confirm = async (p: Promise<{ id: string; summary: string }>) => {
      const proposal = await p
      assert.equal(
        (await decideProposal(proposal.id, "confirm", now)).outcome,
        "applied",
        proposal.summary
      )
      return proposal
    }
    const saved = await confirm(
      proposeTrip({
        name: " Korea ",
        date_from: "2026-04-26",
        date_to: "2026-05-13",
        country: "KR",
        source: "telegram",
        request: "save korea",
        now,
      })
    )
    assert.equal(
      saved.summary,
      "Trip: Korea, 26 Apr 2026 to 13 May 2026 (KR): 4 payments abroad, $584.96"
    )
    await confirm(
      proposeTripPayment({
        trip: "korea",
        transactionId: "flight",
        include: true,
        source: "web",
        request: "x",
        now,
      })
    )
    await confirm(
      proposeTripPayment({
        trip: "Korea",
        transactionId: "cash",
        include: true,
        source: "web",
        request: "x",
        now,
      })
    )
    const left = await confirm(
      proposeTripPayment({
        trip: "Korea",
        transactionId: "taxi",
        include: false,
        source: "web",
        request: "x",
        now,
      })
    )
    assert.equal(
      left.summary,
      "Leave out of Korea trip: Kakao Mobility 16448830 KR $14.79 on 8 May 2026"
    )

    const trip = await tripSpending({ trip: "KOREA" })
    // 584.96 − taxi 14.79 + flight 780 + cash 1,000
    assert.equal(trip.trip, "Korea")
    assert.equal(trip.total, 2350.17)
    assert.equal(trip.count, 5)
    assert.equal(trip.left_out, 1)
    assert.deepEqual([trip.total_abroad, trip.total_added], [570.17, 1780])
    assert.equal(trip.per_day_abroad, 31.68)
    assert.deepEqual(
      trip.by_country.map((c) => c.country),
      ["KR"]
    )
    assert.deepEqual(
      trip.added.map((a) => [a.date, a.amount]),
      [
        ["2026-03-02", 780],
        ["2026-04-26", 1000],
      ]
    )
    await assert.rejects(
      tripSpending({ trip: "Japan" }),
      /No saved trip called “Japan”\. Saved trips: Korea\./
    )

    // Refusals
    await assert.rejects(
      proposeTripPayment({
        trip: "Japan",
        transactionId: "flight",
        include: true,
        source: "web",
        request: "x",
        now,
      }),
      /propose_trip first/
    )
    await assert.rejects(
      proposeTripPayment({
        trip: "Korea",
        transactionId: "flight",
        include: true,
        source: "web",
        request: "x",
        now,
      }),
      /already added/
    )
    await assert.rejects(
      proposeTrip({
        name: "Korea",
        date_from: "2026-04-26",
        date_to: "2026-05-13",
        country: "KR",
        source: "web",
        request: "x",
        now,
      }),
      /already saved/
    )

    // Changing the dates says what it replaces
    const moved = await confirm(
      proposeTrip({
        name: "Korea",
        date_from: "2026-04-25",
        date_to: "2026-05-13",
        country: "KR",
        source: "web",
        request: "x",
        now,
      })
    )
    assert.match(
      moved.summary,
      /\(replaces Korea, 26 Apr 2026 to 13 May 2026 \(KR\)\)$/
    )

    // The log reads well, and undo works for both kinds
    const log = await listChanges({ limit: 5 })
    assert.deepEqual(
      log.map((c) => [c.kind, c.what, c.before, c.after]),
      [
        [
          "trip",
          "trip “Korea”",
          "Korea, 26 Apr 2026 to 13 May 2026 (KR)",
          "Korea, 25 Apr 2026 to 13 May 2026 (KR)",
        ],
        [
          "trip_payment",
          "Korea trip: Kakao Mobility 16448830 KR $14.79 on 8 May 2026",
          "neither",
          "left out",
        ],
        [
          "trip_payment",
          "Korea trip: Korea trip cash $1,000 on 26 Apr 2026",
          "neither",
          "added",
        ],
        [
          "trip_payment",
          "Korea trip: SINGAPORE AIRLINES SINGAPORE $780 on 2 Mar 2026",
          "neither",
          "added",
        ],
        [
          "trip",
          "trip “Korea”",
          "none",
          "Korea, 26 Apr 2026 to 13 May 2026 (KR)",
        ],
      ]
    )
    assert.equal((await undoChange(log[0].id, ctx)).outcome, "undone")
    assert.equal(
      (await tripSpending({ trip: "Korea" })).date_from,
      "2026-04-26"
    )
    assert.equal((await undoChange(log[1].id, ctx)).outcome, "undone")
    assert.equal((await tripSpending({ trip: "Korea" })).left_out, 0)
    // Undo the trip itself: gone; undo that undo: back
    const created = log[4]
    assert.equal((await undoChange(created.id, ctx)).outcome, "undone")
    await assert.rejects(tripSpending({ trip: "Korea" }), /No saved trip/)
    const [undoEntry] = await listChanges({ limit: 1 })
    assert.equal((await undoChange(undoEntry.id, ctx)).outcome, "undone")
    assert.equal((await tripSpending({ trip: "Korea" })).trip, "Korea")

    // A refund added by mistake isn't counted, and is named
    await db.insert(transactions).values({
      id: "refund-sg",
      date: "2026-05-20",
      description: "MADE UP AIRLINE REFUND",
      amount: 50,
      bank: "uob",
      category: "Shopping",
      is_corrected: false,
      hash: "r1",
      uploaded_at: "x",
    })
    await confirm(
      proposeTripPayment({
        trip: "Korea",
        transactionId: "refund-sg",
        include: true,
        source: "web",
        request: "x",
        now,
      })
    )
    const withRefund = await tripSpending({ trip: "Korea" })
    assert.equal(withRefund.total, 2364.96)
    assert.deepEqual(withRefund.added_not_counted, [
      "MADE UP AIRLINE REFUND on 2026-05-20",
    ])

    // A mark can't be added to a trip that's gone: the write itself checks
    // (the trip is removed between the proposal and the tap)
    const { trips: tripsTable } = await import("../lib/schema")
    const { eq } = await import("drizzle-orm")
    const late = await proposeTripPayment({
      trip: "Korea",
      transactionId: "bbq",
      include: false,
      source: "web",
      request: "x",
      now,
    })
    const savedRow = (await db.select().from(tripsTable))[0]
    const realBatch = db.batch.bind(db)
    ;(db as { batch: unknown }).batch = async (
      ...args: Parameters<typeof db.batch>
    ) => {
      await db.delete(tripsTable).where(eq(tripsTable.key, "korea"))
      return realBatch(...args)
    }
    try {
      assert.equal(
        (await decideProposal(late.id, "confirm", now)).outcome,
        "conflict"
      )
    } finally {
      ;(db as { batch: unknown }).batch = realBatch
    }
    // Nothing was written: the trip comes back with no mark for the barbecue
    await db.insert(tripsTable).values(savedRow)
    assert.equal((await tripSpending({ trip: "Korea" })).left_out, 0)

    // Which trip each payment belongs to, and the Transactions page filter
    const { tripsByTransaction } = await import("../lib/agent/trip-spending")
    const inTrips = await tripsByTransaction()
    assert.equal(inTrips.get("olive"), "Korea")
    assert.equal(inTrips.get("flight"), "Korea", "added, though months before")
    assert.equal(inTrips.get("grab"), undefined, "in Singapore")
    assert.equal(inTrips.get("tokyo"), undefined, "Japan, not Korea")
    const { GET } = await import("../app/api/transactions/route")
    const { NextRequest } = await import("next/server")
    const page = await (
      await GET(
        new NextRequest(
          "http://localhost/api/transactions?trip=korea&month=2026-05"
        )
      )
    ).json()
    assert.deepEqual(page.trips, [{ key: "korea", name: "Korea" }])
    const ids = page.transactions.map((t: { id: string }) => t.id)
    assert.ok(
      ids.includes("flight") && ids.includes("olive"),
      "the whole trip, whatever the month"
    )
    assert.ok(!ids.includes("grab") && !ids.includes("rent"))
    assert.ok(
      page.transactions.every((t: { trip: string }) => t.trip === "Korea")
    )
    const unknown = await (
      await GET(new NextRequest("http://localhost/api/transactions?trip=mars"))
    ).json()
    assert.equal(unknown.total, 0)

    console.log("trip spending test passed")
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
