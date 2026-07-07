import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { transactions, EXCLUDED_FROM_SPEND } from '@/lib/schema'
import { and, gte, lt, eq, ne, notInArray } from 'drizzle-orm'

type Period = 'this_month' | 'last_month' | '2_months_ago' | '3_months_ago' | 'all_time'

function getDateRange(period: Period): { start: string | null; end: string | null } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() // 0-indexed

  const isoDate = (year: number, month: number, day: number) => {
    const mm = String(month + 1).padStart(2, '0')
    const dd = String(day).padStart(2, '0')
    return `${year}-${mm}-${dd}`
  }

  const lastDayOf = (year: number, month: number) =>
    new Date(year, month + 1, 0).getDate()

  switch (period) {
    case 'this_month':
      return {
        start: isoDate(y, m, 1),
        end: null, // up to today (no upper bound needed, gte start suffices with ≤ today)
      }
    case 'last_month': {
      const pm = m - 1 < 0 ? 11 : m - 1
      const py = m - 1 < 0 ? y - 1 : y
      return {
        start: isoDate(py, pm, 1),
        end: isoDate(py, pm, lastDayOf(py, pm)),
      }
    }
    case '2_months_ago': {
      let pm = m - 2
      let py = y
      if (pm < 0) { pm += 12; py -= 1 }
      return {
        start: isoDate(py, pm, 1),
        end: isoDate(py, pm, lastDayOf(py, pm)),
      }
    }
    case '3_months_ago': {
      let pm = m - 3
      let py = y
      if (pm < 0) { pm += 12; py -= 1 }
      return {
        start: isoDate(py, pm, 1),
        end: isoDate(py, pm, lastDayOf(py, pm)),
      }
    }
    case 'all_time':
      return { start: null, end: null }
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const rawPeriod = searchParams.get('period') ?? 'this_month'
    const bank = searchParams.get('bank') ?? 'all'

    const validPeriods: Period[] = ['this_month', 'last_month', '2_months_ago', '3_months_ago', 'all_time']
    const period: Period = validPeriods.includes(rawPeriod as Period)
      ? (rawPeriod as Period)
      : 'this_month'

    const { start, end } = getDateRange(period)

    // Build conditions array
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conditions: any[] = []

    // Expenses only (amount < 0) — using raw SQL via lt
    conditions.push(lt(transactions.amount, 0))

    // Exclude non-spend categories (Transfer, Credit Card Payment, Income)
    conditions.push(notInArray(transactions.category, [...EXCLUDED_FROM_SPEND]))

    // Date range
    if (start) conditions.push(gte(transactions.date, start))
    if (end) conditions.push(lt(transactions.date, end + 'z')) // include end day

    // Bank filter
    if (bank !== 'all') {
      conditions.push(eq(transactions.bank, bank as 'ocbc' | 'dbs' | 'uob' | 'trust'))
    }

    const rows = await db
      .select({
        category: transactions.category,
        amount: transactions.amount,
      })
      .from(transactions)
      .where(and(...conditions))

    if (rows.length === 0) {
      return NextResponse.json({ items: [], grandTotal: 0 })
    }

    // Group by category
    const map = new Map<string, number>()
    const countMap = new Map<string, number>()
    for (const row of rows) {
      const abs = Math.abs(row.amount)
      map.set(row.category, (map.get(row.category) ?? 0) + abs)
      countMap.set(row.category, (countMap.get(row.category) ?? 0) + 1)
    }

    const grandTotal = Math.round(Array.from(map.values()).reduce((a, b) => a + b, 0) * 100) / 100

    const items = Array.from(map.entries())
      .map(([category, total]) => ({
        category,
        total: Math.round(total * 100) / 100,
        count: countMap.get(category) ?? 0,
        pct: grandTotal > 0 ? Math.round((total / grandTotal) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.total - a.total)

    return NextResponse.json({ items, grandTotal })
  } catch (err) {
    console.error('[GET /api/categories]', err)
    return NextResponse.json({ error: 'Failed to load categories' }, { status: 500 })
  }
}
