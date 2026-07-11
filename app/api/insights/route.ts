import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { transactions, EXCLUDED_FROM_SPEND } from "@/lib/schema"
import { and, asc, eq, gte, lte } from "drizzle-orm"

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function roundPercent(value: number): number {
  return Math.round(value * 10) / 10
}

function getMonthRange(monthsBack: number): {
  start: string
  end: string
  label: string
} {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  return {
    start: `${year}-${month}-01`,
    end: `${year}-${month}-31`,
    label: `${year}-${month}`,
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const bank = searchParams.get("bank")

    const bankCondition =
      bank && bank !== "all"
        ? [eq(transactions.bank, bank as "ocbc" | "dbs" | "uob" | "trust")]
        : []

    // Fetch last 6 months of data
    const sixMonthsAgo = getMonthRange(5)
    const allTxns = await db
      .select()
      .from(transactions)
      .where(and(gte(transactions.date, sixMonthsAgo.start), ...bankCondition))

    // Group by month and category (expenses only for trend/mom)
    const monthlyData: Record<string, Record<string, number>> = {}
    // Also track income and spend per month for P&L
    const monthlyIncome: Record<string, number> = {}
    const monthlySpend: Record<string, number> = {}

    for (const t of allTxns) {
      const month = t.date.slice(0, 7) // YYYY-MM
      if (t.amount >= 0) {
        // Skip CC payment credits (card statement inbound) — not real income
        if (t.category === "Credit Card Payment") continue
        monthlyIncome[month] = (monthlyIncome[month] ?? 0) + t.amount
        continue
      }
      // expense — skip non-spend categories
      if (EXCLUDED_FROM_SPEND.includes(t.category)) continue
      if (!monthlyData[month]) monthlyData[month] = {}
      monthlyData[month][t.category] =
        (monthlyData[month][t.category] ?? 0) + Math.abs(t.amount)
      monthlySpend[month] = (monthlySpend[month] ?? 0) + Math.abs(t.amount)
    }

    // Build last 6 months labels
    const monthLabels = Array.from(
      { length: 6 },
      (_, i) => getMonthRange(5 - i).label
    )

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
      .map((cat) => {
        const current = roundMoney(currentData[cat] ?? 0)
        const previous = roundMoney(prevData[cat] ?? 0)
        const delta = roundMoney(current - previous)
        const deltaPct =
          previous > 0 ? roundPercent((delta / previous) * 100) : null
        return { category: cat, current, previous, delta, deltaPct }
      })
      .filter((r) => r.current > 0 || r.previous > 0)
      .sort((a, b) => b.current - a.current)

    // 6-month trend — array of { month, [category]: amount }
    const trendData = monthLabels.map((m) => {
      const row: Record<string, string | number> = { month: m }
      const cats = monthlyData[m] ?? {}
      for (const [cat, amt] of Object.entries(cats)) {
        row[cat] = roundMoney(amt)
      }
      return row
    })

    // Monthly P&L — newest first (index 5 = current month)
    const monthlyPnL = [...monthLabels].reverse().map((month) => {
      const [y, m] = month.split("-").map(Number)
      const label = new Date(y, m - 1, 1).toLocaleString("en-SG", {
        month: "short",
        year: "2-digit",
      })
      const income = roundMoney(monthlyIncome[month] ?? 0)
      const spend = roundMoney(monthlySpend[month] ?? 0)
      const hasIncome = income > 0
      const net = hasIncome ? roundMoney(income - spend) : null
      // Category breakdown for this month sorted desc
      const cats = monthlyData[month] ?? {}
      const categories = Object.entries(cats)
        .map(([category, amount]) => ({ category, amount: roundMoney(amount) }))
        .sort((a, b) => b.amount - a.amount)
      return { month, label, income, spend, net, categories }
    })

    // Top 5 biggest transactions this month
    const biggestTxns = (
      await db
        .select()
        .from(transactions)
        .where(
          and(
            gte(transactions.date, getMonthRange(0).start),
            lte(transactions.date, getMonthRange(0).end),
            ...bankCondition
          )
        )
        .orderBy(asc(transactions.amount))
    )
      .filter((t) => t.amount < 0 && !EXCLUDED_FROM_SPEND.includes(t.category))
      .slice(0, 5)

    return NextResponse.json({
      momComparison,
      trendData,
      monthLabels,
      monthlyPnL,
      biggestTransactions: biggestTxns,
      currentMonth,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
