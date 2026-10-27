import { asc } from "drizzle-orm"
import { db } from "./db"
import { budgets } from "./schema"
import { querySpending } from "./agent/query-spending"

const SGT_OFFSET_MS = 8 * 60 * 60 * 1000

/**
 * The budget month containing `now`: the calendar month in Singapore. The
 * owner chose calendar months on 2026-10-27; if that changes to pay
 * cycles, this is the one place to change.
 */
export function budgetMonth(now: Date) {
  const today = new Date(now.getTime() + SGT_OFFSET_MS)
    .toISOString()
    .slice(0, 10)
  const [year, month, day] = today.split("-").map(Number)
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const mm = String(month).padStart(2, "0")
  return {
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${String(daysInMonth).padStart(2, "0")}`,
    today,
    dayOfMonth: day,
    daysInMonth,
  }
}

export type BudgetPace = "on track" | "ahead of pace" | "over budget"

export type BudgetStatus = {
  category: string
  limit: number
  spent: number // the owner's spending this month so far
  left: number // negative when over
  usedPct: number // share of the budget used, rounded
  monthPct: number // share of the month gone, rounded
  pace: BudgetPace
}

/**
 * Each budget's spending this month against its limit and the share of the
 * month gone. Categories without a budget are not listed.
 */
export async function budgetStatus(now: Date): Promise<BudgetStatus[]> {
  const month = budgetMonth(now)
  const rows = await db.select().from(budgets).orderBy(asc(budgets.category))
  const monthShare = month.dayOfMonth / month.daysInMonth
  return Promise.all(
    rows.map(async (row) => {
      // Same calculation as everywhere else: the owner's share
      const spent = (
        await querySpending(row.category, month.start, month.today)
      ).total
      const used = spent / row.monthly_limit
      return {
        category: row.category,
        limit: row.monthly_limit,
        spent,
        left: Math.round((row.monthly_limit - spent) * 100) / 100,
        usedPct: Math.round(used * 100),
        monthPct: Math.round(monthShare * 100),
        pace:
          used > 1
            ? "over budget"
            : used > monthShare
              ? "ahead of pace"
              : "on track",
      }
    })
  )
}
