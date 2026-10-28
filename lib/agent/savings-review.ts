/**
 * The savings review tool: average monthly income, spending and savings
 * over the last few full months, each spending category's average against
 * this month so far, and where the money goes, so the agent can answer
 * “how much do I save?” and “what could I cut?” from one lookup.
 */
import type Anthropic from "@anthropic-ai/sdk"
import { and, gte, lte } from "drizzle-orm"
import { budgetMonth } from "../budgets"
import { classifyCashFlow } from "../cash-flow"
import { db } from "../db"
import { displayName, merchantKey } from "../monthly-recap"
import { withOwedShares } from "../owed"
import { transactions } from "../schema"
import { queryCashFlow } from "./query-cash-flow"

// Costs that are hard to change month to month; everything else is spending
// the owner chooses
export const FIXED_CATEGORIES: readonly string[] = [
  "Housing",
  "Bills & Utilities",
]

export type SavingsReview = {
  months: { month: string; income: number; spending: number; savings: number }[]
  average: {
    income: number
    spending: number
    savings: number
    // Share of income kept, 0–100; null without income
    savings_rate: number | null
  }
  this_month: { from: string; to: string; day: number; days_in_month: number }
  categories: {
    category: string
    kind: "fixed" | "flexible"
    monthly_average: number
    this_month_so_far: number
    // This month so far, scaled to the whole month; null for fixed costs,
    // which are paid once (rent on the 1st isn't a pace)
    this_month_on_pace_for: number | null
    above_average: boolean
    top_merchants: { name: string; monthly_average: number }[]
  }[]
}

const round = (n: number) => Math.round(n * 100) / 100

/** YYYY-MM-01 and the month's last day, `back` months before `start`. */
function monthBefore(start: string, back: number) {
  const [y, m] = start.split("-").map(Number)
  const first = new Date(Date.UTC(y, m - 1 - back, 1))
  const last = new Date(Date.UTC(y, m - back, 0))
  return {
    month: first.toISOString().slice(0, 7),
    from: first.toISOString().slice(0, 10),
    to: last.toISOString().slice(0, 10),
  }
}

/** Spending by category, and by merchant within it, between two dates. */
async function spendByCategory(from: string, to: string) {
  const rows = await withOwedShares(
    await db
      .select()
      .from(transactions)
      .where(and(gte(transactions.date, from), lte(transactions.date, to)))
  )
  const byCategory = new Map<
    string,
    { total: number; merchants: Map<string, { name: string; total: number }> }
  >()
  for (const row of rows) {
    const c = classifyCashFlow(row)
    if (!c.countsAsSpend) continue
    const amount = Math.abs(c.effectiveAmount)
    const entry = byCategory.get(c.category) ?? {
      total: 0,
      merchants: new Map(),
    }
    entry.total += amount
    const key = merchantKey(row)
    const m = entry.merchants.get(key) ?? { name: displayName(row), total: 0 }
    m.total += amount
    entry.merchants.set(key, m)
    byCategory.set(c.category, entry)
  }
  return byCategory
}

/**
 * The last `months` full calendar months in Singapore (not this one), and
 * this month so far. Months before the first transaction are left out of
 * the averages.
 */
export async function savingsReview(
  now: Date,
  months: number
): Promise<SavingsReview> {
  const current = budgetMonth(now)
  const periods = Array.from({ length: months }, (_, i) =>
    monthBefore(current.start, months - i)
  )
  const flows = await Promise.all(
    periods.map(async (p) => ({
      month: p.month,
      ...(await queryCashFlow(p.from, p.to)),
    }))
  )
  // A month with neither income nor spending is before the data starts
  const counted = flows.filter((f) => f.income !== 0 || f.spending !== 0)
  const n = Math.max(counted.length, 1)
  const avg = (pick: (f: (typeof flows)[number]) => number) =>
    round(counted.reduce((sum, f) => sum + pick(f), 0) / n)
  const average = {
    income: avg((f) => f.income),
    spending: avg((f) => f.spending),
    savings: avg((f) => f.savings),
    savings_rate: null as number | null,
  }
  if (average.income > 0)
    average.savings_rate = Math.round((average.savings / average.income) * 100)

  const window = counted.length
    ? await spendByCategory(
        periods.find((p) => p.month === counted[0].month)!.from,
        periods[periods.length - 1].to
      )
    : new Map()
  const soFar = await spendByCategory(current.start, current.today)
  const share = current.dayOfMonth / current.daysInMonth

  const categories: SavingsReview["categories"] = [
    ...new Set([...window.keys(), ...soFar.keys()]),
  ]
    .map((category) => {
      const past = window.get(category)
      const monthly_average = round((past?.total ?? 0) / n)
      const this_month_so_far = round(soFar.get(category)?.total ?? 0)
      const fixed = FIXED_CATEGORIES.includes(category)
      const this_month_on_pace_for = fixed
        ? null
        : round(this_month_so_far / share)
      const compared = this_month_on_pace_for ?? this_month_so_far
      return {
        category,
        kind: fixed ? ("fixed" as const) : ("flexible" as const),
        monthly_average,
        this_month_so_far,
        this_month_on_pace_for,
        // Clearly above: 20% and $30 over the average
        above_average:
          compared > monthly_average * 1.2 && compared - monthly_average >= 30,
        top_merchants: past
          ? [...past.merchants.values()]
              .sort((a, b) => b.total - a.total)
              .slice(0, 3)
              .map((m) => ({
                name: m.name,
                monthly_average: round(m.total / n),
              }))
          : [],
      }
    })
    .sort((a, b) => b.monthly_average - a.monthly_average)

  return {
    months: flows.map(({ month, income, spending, savings }) => ({
      month,
      income,
      spending,
      savings,
    })),
    average,
    this_month: {
      from: current.start,
      to: current.today,
      day: current.dayOfMonth,
      days_in_month: current.daysInMonth,
    },
    categories,
  }
}

export const savingsReviewTool = {
  name: "savings_review",
  strict: true,
  description:
    "Averages over the last 3 or 6 full calendar months (not this month): monthly income, spending, savings and savings rate (share of income kept), each month's figures, and each spending category's monthly average with this month so far, what this month is on pace for, whether it is clearly above average, whether it is a fixed cost (housing, bills) or flexible, and its top merchants. Use it for average spending or savings, how much the owner could save, and what they could cut.",
  input_schema: {
    type: "object" as const,
    properties: {
      months: { type: "integer", enum: [3, 6] },
    },
    additionalProperties: false,
    required: ["months"],
  },
} satisfies Anthropic.Tool

/** Strict check of the savings_review input. */
export function parseSavingsReviewInput(input: unknown): { months: 3 | 6 } {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Tool input must be an object")
  const { months, ...rest } = input as Record<string, unknown>
  if (Object.keys(rest).length)
    throw new Error("Unknown field " + Object.keys(rest)[0])
  if (months !== 3 && months !== 6) throw new Error("months must be 3 or 6")
  return { months }
}
