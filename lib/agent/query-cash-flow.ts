import { db } from "../db"
import { balanceHistory, BANKS, OFF_BANK, transactions } from "../schema"
import { and, desc, eq, gte, lte } from "drizzle-orm"
import { classifyCashFlow } from "../cash-flow"
import { querySpending } from "./query-spending"
import type Anthropic from "@anthropic-ai/sdk"

export type QueryCashFlowResult = {
  date_from: string
  date_to: string
  income: number
  spending: number
  savings: number
}

export type GetBalancesResult = {
  balances: Array<{
    bank: string
    account_type: string
    balance: number
    // The day the balance was recorded (upload or manual edit). The
    // statement it came from may be older; see ticket 25.
    recorded_on: string
  }>
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

export async function queryCashFlow(
  dateFrom: string,
  dateTo: string
): Promise<QueryCashFlowResult> {
  const rows = await db
    .select()
    .from(transactions)
    .where(
      and(gte(transactions.date, dateFrom), lte(transactions.date, dateTo))
    )
  // Same rules as the dashboard: transfers between the owner's own
  // accounts and share repayments are never income
  let income = 0
  for (const row of rows) {
    if (row.bank === OFF_BANK) continue
    const classification = classifyCashFlow(row)
    if (classification.countsAsIncome) income += classification.effectiveAmount
  }
  // Spending comes from query_spending so the two tools always agree
  const spending = (await querySpending(undefined, dateFrom, dateTo)).total
  return {
    date_from: dateFrom,
    date_to: dateTo,
    income: roundMoney(income),
    spending,
    savings: roundMoney(income - spending),
  }
}

export async function getBalances(): Promise<GetBalancesResult> {
  const latest = await Promise.all(
    BANKS.map(async (bank) => {
      const [row] = await db
        .select()
        .from(balanceHistory)
        .where(eq(balanceHistory.bank, bank))
        .orderBy(desc(balanceHistory.recorded_at))
        .limit(1)
      return row
        ? {
            bank,
            account_type: row.account_type,
            balance: row.balance,
            recorded_on: row.recorded_at.slice(0, 10),
          }
        : null
    })
  )
  return { balances: latest.filter((row) => row !== null) }
}

export const queryCashFlowTool = {
  name: "query_cash_flow",
  strict: true,
  description:
    "Income, spending and savings for a period. Income is earned money only: transfers between the owner's own accounts and repayments of shares are left out. Spending is the owner's spending, the same as query_spending. Savings is income minus spending.",
  input_schema: {
    type: "object" as const,
    properties: {
      date_from: {
        type: "string",
        description: "ISO date YYYY-MM-DD, inclusive",
      },
      date_to: {
        type: "string",
        description: "ISO date YYYY-MM-DD, inclusive",
      },
    },
    additionalProperties: false,
    required: ["date_from", "date_to"],
  },
} satisfies Anthropic.Tool

export const getBalancesTool = {
  name: "get_balances",
  strict: true,
  description:
    "The latest recorded balance of each of the owner's accounts. recorded_on is the day the balance was uploaded or typed in; the statement it came from may be older. Credit card balances are owed amounts. There is no live balance.",
  input_schema: {
    type: "object" as const,
    properties: {},
    additionalProperties: false,
    required: [],
  },
} satisfies Anthropic.Tool
