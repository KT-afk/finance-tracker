import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { balanceHistory, BANKS } from '@/lib/schema'
import { eq, desc } from 'drizzle-orm'

export async function GET() {
  try {
    const balances = BANKS.map(bank => {
      const latest = db
        .select()
        .from(balanceHistory)
        .where(eq(balanceHistory.bank, bank))
        .orderBy(desc(balanceHistory.recorded_at))
        .limit(1)
        .get()

      return latest
        ? { bank, balance: latest.balance, recorded_at: latest.recorded_at }
        : null
    }).filter(Boolean) as { bank: string; balance: number; recorded_at: string }[]

    const total = balances.reduce((sum, b) => sum + b.balance, 0)

    return NextResponse.json({ balances, total })
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

    db.insert(balanceHistory)
      .values({
        bank: bank as (typeof BANKS)[number],
        balance,
        recorded_at: new Date().toISOString(),
      })
      .run()

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
