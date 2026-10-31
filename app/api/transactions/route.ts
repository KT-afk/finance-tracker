import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { db } from "@/lib/db"
import { BANKS, CATEGORIES, transactions, type Bank } from "@/lib/schema"
import { and, eq, gte, lte, desc } from "drizzle-orm"
import { classifyCashFlow } from "@/lib/cash-flow"
import { applyOwedRulesTo, loadOwedEntriesFor } from "@/lib/owed"
import {
  findTrip,
  listTrips,
  tripsByTransaction,
} from "@/lib/agent/trip-spending"

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false

  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const month = searchParams.get("month") // YYYY-MM
    const category = searchParams.get("category")
    const bank = searchParams.get("bank")
    // 'transfers' = the dashboard's "Transfers to review" set;
    // 'unlabelled' = outgoing payments nobody has labelled yet
    const review = searchParams.get("review")
    // A saved trip's key: its payments, whatever their month
    const tripParam = searchParams.get("trip")
    const trip = tripParam ? await findTrip(tripParam) : undefined
    const page = parseInt(searchParams.get("page") ?? "1", 10)
    const pageSize = parseInt(searchParams.get("pageSize") ?? "50", 10)

    const conditions = []

    if (month && !trip) {
      conditions.push(gte(transactions.date, `${month}-01`))
      conditions.push(lte(transactions.date, `${month}-31`))
    }
    if (category && category !== "all") {
      conditions.push(eq(transactions.category, category))
    }
    if (bank && bank !== "all") {
      conditions.push(eq(transactions.bank, bank as Bank))
    }

    const matchingTxns = await db
      .select()
      .from(transactions)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(transactions.date), desc(transactions.uploaded_at))
    const inTrips = await tripsByTransaction()
    const reviewed =
      review === "transfers"
        ? matchingTxns.filter(
            (tx) => classifyCashFlow(tx).isUnclassifiedTransfer
          )
        : review === "unlabelled"
          ? matchingTxns.filter((tx) => classifyCashFlow(tx).isUnlabelled)
          : matchingTxns
    const allTxns = trip
      ? reviewed.filter((tx) => inTrips.get(tx.id) === trip.name)
      : tripParam
        ? []
        : reviewed

    const total = allTxns.length
    const offset = (page - 1) * pageSize
    const pageTxns = allTxns.slice(offset, offset + pageSize)
    const owed = await loadOwedEntriesFor(pageTxns.map((tx) => tx.id))
    const paged = pageTxns.map((tx) => {
      const entry = owed.get(tx.id)
      return {
        ...tx,
        is_manual: tx.hash.startsWith("manual:"),
        trip: inTrips.get(tx.id) ?? null,
        owed: entry
          ? { kind: entry.kind, person: entry.person, amount: entry.amount }
          : null,
      }
    })

    return NextResponse.json({
      // Saved trips, for the filter
      trips: (await listTrips()).map((t) => ({ key: t.key, name: t.name })),
      transactions: paged,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const date = typeof body.date === "string" ? body.date.trim() : ""
    const description =
      typeof body.description === "string" ? body.description.trim() : ""
    const bank = typeof body.bank === "string" ? body.bank : ""
    const category = typeof body.category === "string" ? body.category : ""
    const amount = Number(body.amount)

    if (!isValidIsoDate(date)) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 })
    }
    if (description.length < 2) {
      return NextResponse.json(
        { error: "Description is required" },
        { status: 400 }
      )
    }
    if (!Number.isFinite(amount) || amount === 0) {
      return NextResponse.json(
        { error: "Amount must be non-zero" },
        { status: 400 }
      )
    }
    if (!(BANKS as readonly string[]).includes(bank)) {
      return NextResponse.json({ error: "Invalid bank" }, { status: 400 })
    }
    if (
      !(CATEGORIES as readonly string[]).includes(category) ||
      category === "Repayment" ||
      category === "Paid by Others"
    ) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 })
    }

    const id = randomUUID()
    const now = new Date().toISOString()
    const transaction = {
      id,
      date,
      description,
      amount,
      bank: bank as (typeof BANKS)[number],
      category,
      is_corrected: true,
      hash: `manual:${id}`,
      uploaded_at: now,
    }

    await db.insert(transactions).values(transaction)
    await applyOwedRulesTo([id])

    return NextResponse.json({ transaction }, { status: 201 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
