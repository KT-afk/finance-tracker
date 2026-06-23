import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { transactions } from '@/lib/schema'
import { and, eq, gte, lte, desc } from 'drizzle-orm'

function getMonthRange(monthsBack: number): { start: string; end: string; label: string } {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return {
    start: `${year}-${month}-01`,
    end: `${year}-${month}-31`,
    label: `${year}-${month}`,
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const bank = searchParams.get('bank')

    const bankCondition =
      bank && bank !== 'all'
        ? [eq(transactions.bank, bank as 'ocbc' | 'dbs' | 'uob' | 'trust')]
        : []

    // Fetch last 6 months of data
    const sixMonthsAgo = getMonthRange(5)
    const allTxns = await db
      .select()
      .from(transactions)
      .where(
        and(
          gte(transactions.date, sixMonthsAgo.start),
          ...bankCondition
        )
      )

    // Group by month and category
    const monthlyData: Record<string, Record<string, number>> = {}
    for (const t of allTxns) {
      if (t.amount >= 0) continue // skip income
      const month = t.date.slice(0, 7) // YYYY-MM
      if (!monthlyData[month]) monthlyData[month] = {}
      monthlyData[month][t.category] =
        (monthlyData[month][t.category] ?? 0) + Math.abs(t.amount)
    }

    // Build last 6 months labels
    const monthLabels = Array.from({ length: 6 }, (_, i) => getMonthRange(5 - i).label)

    // Month-over-month (current vs previous)
    const currentMonth = monthLabels[5]
    const prevMonth = monthLabels[4]
    const currentData = monthlyData[currentMonth] ?? {}
    const prevData = monthlyData[prevMonth] ?? {}

    const allCategories = new Set([
      ...Object.keys(currentData),
      ...Object.keys(prevData),
    ])

    const momComparison = Array.from(allCategories)
      .map(cat => {
        const current = currentData[cat] ?? 0
        const previous = prevData[cat] ?? 0
        const delta = current - previous
        const deltaPct = previous > 0 ? (delta / previous) * 100 : null
        return { category: cat, current, previous, delta, deltaPct }
      })
      .filter(r => r.current > 0 || r.previous > 0)
      .sort((a, b) => b.current - a.current)

    // 6-month trend — array of { month, [category]: amount }
    const trendData = monthLabels.map(m => {
      const row: Record<string, string | number> = { month: m }
      const cats = monthlyData[m] ?? {}
      for (const [cat, amt] of Object.entries(cats)) {
        row[cat] = Math.round(amt * 100) / 100
      }
      return row
    })

    // Top 5 biggest transactions this month
    const biggestTxns = (await db
      .select()
      .from(transactions)
      .where(
        and(
          gte(transactions.date, getMonthRange(0).start),
          lte(transactions.date, getMonthRange(0).end),
          ...bankCondition
        )
      )
      .orderBy(desc(transactions.amount))
    )
      .filter(t => t.amount < 0) // expenses only
      .sort((a, b) => a.amount - b.amount) // most negative first
      .slice(0, 5)

    return NextResponse.json({
      momComparison,
      trendData,
      monthLabels,
      biggestTransactions: biggestTxns,
      currentMonth,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
