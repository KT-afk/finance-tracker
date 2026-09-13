import { db } from "../db"
import { transactions, EXCLUDED_FROM_SPEND, CATEGORIES } from "../schema"
import { and, eq, gte, lte, lt, notInArray } from "drizzle-orm"
import type Anthropic from "@anthropic-ai/sdk"

export type GroupBy = "category" | "month" | "none"

export type QuerySpendingResult = {
  rows: Array<{ group: string; total: number; count: number }>
  total: number
  count: number
}

export async function querySpending(
  category?: string,
  dateFrom?: string,
  dateTo?: string,
  groupBy: GroupBy = "none"
): Promise<QuerySpendingResult> {
  const conditions = [
    lt(transactions.amount, 0),
    notInArray(transactions.category, [...EXCLUDED_FROM_SPEND]),
  ]

  if (category) {
    conditions.push(eq(transactions.category, category))
  }

  if (dateFrom) {
    conditions.push(gte(transactions.date, dateFrom))
  }

  if (dateTo) {
    conditions.push(lte(transactions.date, dateTo))
  }

  const rows = await db
    .select({
      category: transactions.category,
      amount: transactions.amount,
      date: transactions.date,
    })
    .from(transactions)
    .where(and(...conditions))

  const map = new Map<string, { total: number; count: number }>()
  let total = 0

  for (const row of rows) {
    const key =
      groupBy === "month"
        ? row.date.slice(0, 7)
        : groupBy === "category"
          ? row.category
          : "all"

    const spend = Math.abs(row.amount)
    const current = map.get(key) ?? { total: 0, count: 0 }
    map.set(key, { total: current.total + spend, count: current.count + 1 })
    total += spend
  }

  return {
    rows: [...map]
      .map(([group, v]) => ({ group, total: v.total, count: v.count }))
      .sort((a, b) => b.total - a.total),
    total,
    count: rows.length,
  }
}

export const querySpendingTool = {
  name: "query_spending",
  strict: true,
  description: "Query spending data with optional filters",
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
    },
    additionalProperties: false,
    required: [],
  },
} satisfies Anthropic.Tool
