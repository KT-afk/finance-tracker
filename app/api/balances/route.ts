import { NextRequest, NextResponse } from "next/server"
import { BANKS } from "@/lib/schema"
import { latestBalances, saveBalanceHistory } from "@/lib/balance-history"

export async function GET() {
  try {
    // Latest per bank by the date each balance was true for. Works on a
    // database behind on migrations too (see lib/balance-history.ts).
    const balances = await latestBalances()
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
      // A typed-in balance is true on the day it is typed, in Singapore
      statementDate: new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Singapore",
      }).format(new Date()),
    })

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
