import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { balanceHistory, BANKS } from '@/lib/schema'
import { desc } from 'drizzle-orm'

function getMonthLabel(monthsBack: number): string {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

export async function GET() {
  try {
    // Get all balance history entries
    const allEntries = db
      .select()
      .from(balanceHistory)
      .orderBy(desc(balanceHistory.recorded_at))
      .all()

    // Build 6-month labels (newest last)
    const monthLabels = Array.from({ length: 6 }, (_, i) => getMonthLabel(5 - i))

    // For each month, find the latest balance per bank up to that month's end
    const trend = monthLabels.map(monthLabel => {
      let total = 0
      let hasBankData = false

      for (const bank of BANKS) {
        // Find the latest entry for this bank on or before the end of this month
        const monthEnd = `${monthLabel}-31T23:59:59`
        const latest = allEntries.find(
          e => e.bank === bank && e.recorded_at <= monthEnd
        )
        if (latest) {
          total += latest.balance
          hasBankData = true
        }
      }

      return {
        month: monthLabel,
        total: hasBankData ? Math.round(total * 100) / 100 : null,
      }
    })

    return NextResponse.json({ trend, monthLabels })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
