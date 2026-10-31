import { db } from "../db"
import { transactions, CATEGORIES, OFF_BANK } from "../schema"
import { and, gte, lte } from "drizzle-orm"
import { classifyCashFlow } from "../cash-flow"
import { withOwedShares } from "../owed"
import type Anthropic from "@anthropic-ai/sdk"

export type GroupBy = "category" | "month" | "none"
// "spending" is the owner's part; "gross" is what left their accounts
export type Measure = "spending" | "gross"

export type QuerySpendingResult = {
  rows: Array<{ group: string; total: number; count: number }>
  total: number
  count: number
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

export async function querySpending(
  category?: string,
  dateFrom?: string,
  dateTo?: string,
  groupBy: GroupBy = "none",
  measure: Measure = "spending"
): Promise<QuerySpendingResult> {
  const conditions = []
  if (dateFrom) conditions.push(gte(transactions.date, dateFrom))
  if (dateTo) conditions.push(lte(transactions.date, dateTo))

  // Same classification as the dashboard, so the agent agrees with it
  const rows = await withOwedShares(
    await db
      .select()
      .from(transactions)
      .where(and(...conditions))
  )

  const map = new Map<string, { total: number; count: number }>()
  let total = 0
  let count = 0

  for (const row of rows) {
    // Gross matches the bank statements: off-bank rows (covered or forgiven
    // amounts, and cash payments, whose money left as an ATM withdrawal)
    // aren't on them
    if (measure === "gross" && row.bank === OFF_BANK) continue
    const classification = classifyCashFlow(
      measure === "gross" ? { ...row, owedShare: 0 } : row
    )
    if (!classification.countsAsSpend) continue
    if (category && classification.category !== category) continue
    const spend = Math.abs(classification.effectiveAmount)
    count++
    const key =
      groupBy === "month"
        ? row.date.slice(0, 7)
        : groupBy === "category"
          ? classification.category
          : "all"

    const current = map.get(key) ?? { total: 0, count: 0 }
    map.set(key, { total: current.total + spend, count: current.count + 1 })
    total += spend
  }

  return {
    rows: [...map]
      .map(([group, v]) => ({
        group,
        total: roundMoney(v.total),
        count: v.count,
      }))
      .sort((a, b) => b.total - a.total),
    total: roundMoney(total),
    count,
  }
}

export const querySpendingTool = {
  name: "query_spending",
  strict: true,
  description:
    "Total spending with optional filters. By default amounts are the owner's spending: each payment minus the shares other people should cover (forgiven shares count again). Set measure to gross only when the owner asks for gross spending or what left their accounts.",
  input_schema: {
    type: "object" as const,
    properties: {
      category: {
        type: "string",
        enum: [...CATEGORIES],
      },
      date_from: {
        type: "string",
        description: "ISO date YYYY-MM-DD, inclusive",
      },
      date_to: {
        type: "string",
        description: "ISO date YYYY-MM-DD, inclusive",
      },
      group_by: {
        type: "string",
        enum: ["category", "month", "none"],
      },
      measure: {
        type: "string",
        enum: ["spending", "gross"],
      },
    },
    additionalProperties: false,
    required: [],
  },
} satisfies Anthropic.Tool
