import { db } from "../db"
import { transactions, CATEGORIES } from "../schema"
import { and, gte, lte } from "drizzle-orm"
import { classifyCashFlow } from "../cash-flow"
import { describeTransaction } from "../describe-transaction"
import { isValidIsoDate, withOwedShares } from "../owed"
import type Anthropic from "@anthropic-ai/sdk"

export type SearchInput = {
  text?: string
  category?: string
  min_amount?: number
  max_amount?: number
  date_from?: string
  date_to?: string
}

export type FoundTransaction = {
  id: string
  date: string
  title: string
  category: string
  amount: number // full payment
  your_share?: number // only when someone else covers part of it
  display: string
}

export type SearchResult = {
  transactions: FoundTransaction[]
  total: number // the owner's spending across every match, not just those listed
  count: number
  more: number // matches not listed
}

const LIMIT = 20
const MAX_TEXT = 100

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value)
}

export function parseSearchInput(input: unknown): SearchInput {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Tool input must be an object")
  const values = input as Record<string, unknown>
  const filters: SearchInput = {}
  for (const [key, value] of Object.entries(values)) {
    switch (key) {
      case "text": {
        if (typeof value !== "string") throw new Error("text must be a string")
        const text = value.replace(/\s+/g, " ").trim()
        if (!text || text.length > MAX_TEXT)
          throw new Error(`text must be 1 to ${MAX_TEXT} characters`)
        filters.text = text
        break
      }
      case "category":
        if (!(CATEGORIES as readonly unknown[]).includes(value))
          throw new Error("Use a category from the tool schema")
        filters.category = value as string
        break
      case "min_amount":
      case "max_amount":
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
          throw new Error(key + " must be a number of at least 0")
        filters[key] = value
        break
      case "date_from":
      case "date_to":
        if (!isValidIsoDate(value))
          throw new Error("Dates must be valid YYYY-MM-DD dates")
        filters[key] = value
        break
      default:
        throw new Error("Unknown filter")
    }
  }
  if (
    filters.min_amount !== undefined &&
    filters.max_amount !== undefined &&
    filters.min_amount > filters.max_amount
  )
    throw new Error("max_amount must not be below min_amount")
  if (
    filters.date_from &&
    filters.date_to &&
    filters.date_from > filters.date_to
  )
    throw new Error("date_to must not be before date_from")
  return filters
}

/** Payments matching every filter, newest first; amounts filter on the full payment. */
export async function searchTransactions(
  filters: SearchInput
): Promise<SearchResult> {
  const conditions = []
  if (filters.date_from)
    conditions.push(gte(transactions.date, filters.date_from))
  if (filters.date_to) conditions.push(lte(transactions.date, filters.date_to))
  const rows = await withOwedShares(
    await db
      .select()
      .from(transactions)
      .where(and(...conditions))
  )
  const text = filters.text?.toLowerCase()

  const matches: Array<FoundTransaction & { time: string | null }> = []
  let total = 0
  for (const row of rows) {
    // Same classification as the dashboard, so only payments count
    const classification = classifyCashFlow(row)
    if (!classification.countsAsSpend) continue
    if (filters.category && classification.category !== filters.category)
      continue
    const amount = roundMoney(Math.abs(row.amount))
    if (filters.min_amount !== undefined && amount < filters.min_amount)
      continue
    if (filters.max_amount !== undefined && amount > filters.max_amount)
      continue
    if (
      text &&
      ![row.description, row.payee, row.memo].some((field) =>
        field?.toLowerCase().includes(text)
      )
    )
      continue

    const share = roundMoney(Math.abs(classification.effectiveAmount))
    const title = row.payee ?? describeTransaction(row.description).title
    const shared = share !== amount
    total += share
    matches.push({
      id: row.id,
      date: row.date,
      time: row.time,
      title,
      category: classification.category,
      amount,
      ...(shared ? { your_share: share } : {}),
      display:
        `${title} ${formatMoney(amount)}` +
        (shared ? ` (your share ${formatMoney(share)})` : ""),
    })
  }

  matches.sort((a, b) =>
    `${b.date} ${b.time ?? ""}`.localeCompare(`${a.date} ${a.time ?? ""}`)
  )
  return {
    transactions: matches.slice(0, LIMIT).map(({ time: _, ...t }) => t),
    total: roundMoney(total),
    count: matches.length,
    more: Math.max(0, matches.length - LIMIT),
  }
}

export const searchTransactionsTool = {
  name: "search_transactions",
  strict: true,
  description:
    "Find the payments behind a number. Matches text in the merchant, description or memo, plus optional category, full-payment amount range and dates. Returns at most 20 payments, newest first, each with a display line to show the owner; total is the owner's spending across every match, and more is how many matches were not listed.",
  input_schema: {
    type: "object" as const,
    properties: {
      text: {
        type: "string",
        description: "Merchant or description text, e.g. Grab",
      },
      category: {
        type: "string",
        enum: [...CATEGORIES],
      },
      min_amount: {
        type: "number",
        description: "Smallest full payment amount in SGD, inclusive",
      },
      max_amount: {
        type: "number",
        description: "Largest full payment amount in SGD, inclusive",
      },
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
    required: [],
  },
} satisfies Anthropic.Tool
