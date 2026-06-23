import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { transactions } from '@/lib/schema'
import { CATEGORIES } from '@/lib/schema'
import { and, eq, gte, lt } from 'drizzle-orm'

function getMonthRange(monthsBack: number): { start: string; label: string } {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return {
    start: `${year}-${month}-01`,
    label: `${year}-${month}`,
  }
}

function getMonthEnd(monthsBack: number): string {
  const now = new Date()
  // First day of the month AFTER the target month
  const d = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 1)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}-01`
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ category: string }> }
) {
  try {
    const { category } = await params

    // Validate category
    if (!(CATEGORIES as readonly string[]).includes(category)) {
      return NextResponse.json({ error: `Unknown category: ${category}` }, { status: 400 })
    }

    const sixMonthsAgoStart = getMonthRange(5).start

    // --- 1. 6-month trend ---
    const trendTxns = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.category, category),
          gte(transactions.date, sixMonthsAgoStart),
          lt(transactions.amount, 0)
        )
      )

    const monthLabels = Array.from({ length: 6 }, (_, i) => getMonthRange(5 - i).label)
    const monthTotals: Record<string, number> = {}
    for (const label of monthLabels) monthTotals[label] = 0

    for (const t of trendTxns) {
      const month = t.date.slice(0, 7)
      if (month in monthTotals) {
        monthTotals[month] += Math.abs(t.amount)
      }
    }

    const trend = monthLabels.map(month => ({
      month,
      total: Math.round(monthTotals[month] * 100) / 100,
    }))

    // --- 2. All-time expense txns for this category ---
    const allTxns = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.category, category),
          lt(transactions.amount, 0)
        )
      )

    // --- 3. Top merchants ---
    const merchantTotals: Record<string, number> = {}
    for (const t of allTxns) {
      merchantTotals[t.description] =
        (merchantTotals[t.description] ?? 0) + Math.abs(t.amount)
    }
    const topMerchants = Object.entries(merchantTotals)
      .map(([description, total]) => ({
        description,
        total: Math.round(total * 100) / 100,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)

    // --- 4. Count & average ---
    const count = allTxns.length
    const average =
      count > 0
        ? Math.round((allTxns.reduce((s, t) => s + Math.abs(t.amount), 0) / count) * 100) / 100
        : 0

    // --- 5. Recent transactions (50 most recent, newest first) ---
    const recentTransactions = [...allTxns]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 50)

    return NextResponse.json({
      category,
      trend,
      topMerchants,
      count,
      average,
      recentTransactions,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
