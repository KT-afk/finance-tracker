import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { balanceHistory, BANKS } from '@/lib/schema'
import { eq, desc, sql } from 'drizzle-orm'

export async function GET() {
  try {
    // For each bank, get the latest entry. Use COALESCE so missing account_type column
    // (before migration runs) defaults to 'savings' and doesn't cause a 500.
    const balanceRows = await Promise.all(BANKS.map(bank =>
      db.select({
        balance: balanceHistory.balance,
        account_type: sql<string>`COALESCE(${balanceHistory.account_type}, 'savings')`,
        recorded_at: balanceHistory.recorded_at,
      })
        .from(balanceHistory)
        .where(eq(balanceHistory.bank, bank))
        .orderBy(desc(balanceHistory.recorded_at))
        .limit(1)
        .then(([r]) => r ? { bank, balance: r.balance, account_type: r.account_type, recorded_at: r.recorded_at } : null)
    ))

    const balances = balanceRows.filter(Boolean) as { bank: string; balance: number; account_type: string; recorded_at: string }[]
    const savingsBalances = balances.filter(b => b.account_type !== 'credit_card')
    const ccBalances = balances.filter(b => b.account_type === 'credit_card')
    const total = Math.round(savingsBalances.reduce((sum, b) => sum + b.balance, 0) * 100) / 100
    const totalCC = Math.round(ccBalances.reduce((sum, b) => sum + b.balance, 0) * 100) / 100
    const lastUpdated = balances.length > 0
      ? balances.reduce((latest, b) => b.recorded_at > latest ? b.recorded_at : latest, balances[0].recorded_at)
      : new Date().toISOString()

    return NextResponse.json({ balances, total, totalCC, lastUpdated })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { bank, balance } = body

    if (!bank || !(BANKS as readonly string[]).includes(bank)) {
      return NextResponse.json({ error: 'Invalid or missing bank' }, { status: 400 })
    }
    if (typeof balance !== 'number' || isNaN(balance)) {
      return NextResponse.json({ error: 'Invalid balance' }, { status: 400 })
    }

    await db.insert(balanceHistory)
      .values({
        bank: bank as (typeof BANKS)[number],
        balance,
        recorded_at: new Date().toISOString(),
      })

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
