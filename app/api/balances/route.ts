import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { balanceHistory, BANKS } from "@/lib/schema"
import { saveBalanceHistory } from "@/lib/balance-history"
import { eq, desc, sql } from "drizzle-orm"

export async function GET() {
  try {
    // For each bank, get the latest entry.
    // Falls back to a simple query (no account_type) if the column doesn't exist yet
    // (i.e. migration hasn't run on this DB instance).
    const balanceRows = await Promise.all(
      BANKS.map(async (bank) => {
        try {
          const [r] = await db
            .select({
              balance: balanceHistory.balance,
              account_type: sql<string>`COALESCE(${balanceHistory.account_type}, 'savings')`,
              recorded_at: balanceHistory.recorded_at,
            })
            .from(balanceHistory)
            .where(eq(balanceHistory.bank, bank))
            .orderBy(desc(balanceHistory.recorded_at))
            .limit(1)
          return r
            ? {
                bank,
                balance: r.balance,
                account_type: r.account_type,
                recorded_at: r.recorded_at,
              }
            : null
        } catch {
          // Column doesn't exist yet — fall back to query without account_type
          const [r] = await db
            .select({
              balance: balanceHistory.balance,
              recorded_at: balanceHistory.recorded_at,
            })
            .from(balanceHistory)
            .where(eq(balanceHistory.bank, bank))
            .orderBy(desc(balanceHistory.recorded_at))
            .limit(1)
          return r
            ? {
                bank,
                balance: r.balance,
                account_type: "savings",
                recorded_at: r.recorded_at,
              }
            : null
        }
      })
    )

    const balances = balanceRows.filter(Boolean) as {
      bank: string
      balance: number
      account_type: string
      recorded_at: string
    }[]
    const savingsBalances = balances.filter(
      (b) => b.account_type !== "credit_card"
    )
    const ccBalances = balances.filter((b) => b.account_type === "credit_card")
    const total =
      Math.round(savingsBalances.reduce((sum, b) => sum + b.balance, 0) * 100) /
      100
    const totalCC =
      Math.round(ccBalances.reduce((sum, b) => sum + b.balance, 0) * 100) / 100
    const lastUpdated =
      balances.length > 0
        ? balances.reduce(
            (latest, b) => (b.recorded_at > latest ? b.recorded_at : latest),
            balances[0].recorded_at
          )
        : new Date().toISOString()

    return NextResponse.json({ balances, total, totalCC, lastUpdated })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { bank, balance } = body

    if (!bank || !(BANKS as readonly string[]).includes(bank)) {
      return NextResponse.json(
        { error: "Invalid or missing bank" },
        { status: 400 }
      )
    }
    if (typeof balance !== "number" || isNaN(balance)) {
      return NextResponse.json({ error: "Invalid balance" }, { status: 400 })
    }

    await saveBalanceHistory({
      bank: bank as (typeof BANKS)[number],
      balance,
      accountType: "savings",
      recordedAt: new Date().toISOString(),
    })

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
