import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { transactions } from "@/lib/schema"
import { classifyCashFlow, summarizeCashFlow } from "@/lib/cash-flow"
import { and, eq, gte, lte, lt, desc } from "drizzle-orm"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const bank = searchParams.get("bank")
    const monthParam = searchParams.get("month") // YYYY-MM or 'last'

    const now = new Date()

    // Resolve target month
    let targetDate: Date
    if (monthParam === "last" || !monthParam) {
      targetDate = new Date(
        now.getFullYear(),
        now.getMonth() - (monthParam === "last" ? 1 : 0),
        1
      )
    } else {
      const [y, m] = monthParam.split("-").map(Number)
      targetDate = new Date(y, m - 1, 1)
    }

    const year = targetDate.getFullYear()
    const month = String(targetDate.getMonth() + 1).padStart(2, "0")
    const monthStart = `${year}-${month}-01`
    const monthEnd = `${year}-${month}-31`

    // Build where clause
    const whereConditions = [
      gte(transactions.date, monthStart),
      lte(transactions.date, monthEnd),
    ]
    if (bank && bank !== "all") {
      whereConditions.push(
        eq(transactions.bank, bank as "ocbc" | "dbs" | "uob" | "trust")
      )
    }

    const monthTxns = await db
      .select()
      .from(transactions)
      .where(and(...whereConditions))

    // If current month has no data, caller can retry with last month
    const isEmpty = monthTxns.length === 0

    const cashFlow = summarizeCashFlow(monthTxns)
    const {
      spend: totalSpend,
      income: totalIncome,
      reimbursements: totalReimbursements,
      netCashFlow,
      unclassifiedTransfers,
    } = cashFlow

    // Top 5 categories by total spend
    const categoryTotals: Record<string, number> = {}
    for (const t of monthTxns) {
      const classification = classifyCashFlow(t)
      if (classification.countsAsSpend) {
        const category = classification.category
        categoryTotals[category] =
          (categoryTotals[category] ?? 0) +
          Math.abs(classification.effectiveAmount)
      }
    }

    const topCategories = Object.entries(categoryTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, amount]) => ({ category, amount }))

    // 5 most recent transactions
    const recentWhereConditions =
      bank && bank !== "all"
        ? [eq(transactions.bank, bank as "ocbc" | "dbs" | "uob" | "trust")]
        : []

    const recentTxns = await db
      .select()
      .from(transactions)
      .where(
        recentWhereConditions.length ? and(...recentWhereConditions) : undefined
      )
      .orderBy(desc(transactions.date), desc(transactions.uploaded_at))
      .limit(5)

    // Prior month spend (same bank filter) for MoM delta
    const priorDate = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth() - 1,
      1
    )
    const priorYear = priorDate.getFullYear()
    const priorMonth = String(priorDate.getMonth() + 1).padStart(2, "0")
    const priorStart = `${priorYear}-${priorMonth}-01`
    const priorEnd = `${year}-${month}-01`

    const priorWhereConditions = [
      gte(transactions.date, priorStart),
      lt(transactions.date, priorEnd),
    ]
    if (bank && bank !== "all") {
      priorWhereConditions.push(
        eq(transactions.bank, bank as "ocbc" | "dbs" | "uob" | "trust")
      )
    }

    const priorTxns = await db
      .select({
        amount: transactions.amount,
        category: transactions.category,
        description: transactions.description,
      })
      .from(transactions)
      .where(and(...priorWhereConditions))

    const priorSpend = summarizeCashFlow(priorTxns).spend

    const hasPrior = priorTxns.length > 0
    const momDelta = hasPrior ? totalSpend - priorSpend : null
    const momDeltaPct =
      hasPrior && priorSpend > 0
        ? ((totalSpend - priorSpend) / priorSpend) * 100
        : null
    const priorMonthLabel = priorDate.toLocaleString("en-SG", { month: "long" })

    const isCurrentMonth =
      year === now.getFullYear() && Number(month) === now.getMonth() + 1
    const daysElapsed = isCurrentMonth
      ? now.getDate()
      : new Date(year, Number(month), 0).getDate()

    return NextResponse.json({
      totalSpend,
      totalIncome,
      totalReimbursements,
      netCashFlow,
      unclassifiedTransfers,
      daysElapsed,
      month: `${year}-${month}`,
      isEmpty,
      isCurrentMonth,
      topCategories,
      recentTransactions: recentTxns,
      momDelta,
      momDeltaPct,
      priorMonthLabel,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
