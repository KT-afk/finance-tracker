import { db } from "../db"
import { OFF_BANK, transactions } from "../schema"
import { and, gte, lte } from "drizzle-orm"
import { classifyCashFlow } from "../cash-flow"
import { latestBalances } from "../balance-history"
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
    // The date the balance was true for
    as_of: string
    // False for balances saved before statement dates were kept: as_of is
    // then the day saved, and the balance may be older
    exact: boolean
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
  const latest = await latestBalances()
  return {
    balances: latest.map((b) => ({
      bank: b.bank,
      account_type: b.account_type,
      balance: b.balance,
      as_of: b.as_of,
      exact: b.exact,
    })),
  }
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
    "The latest balance of each of the owner's accounts. as_of is the date the balance was true for. When exact is false, as_of is only the day it was saved and the balance may be older. Credit card balances are owed amounts. There is no live balance.",
  input_schema: {
    type: "object" as const,
    properties: {},
    additionalProperties: false,
    required: [],
  },
} satisfies Anthropic.Tool
