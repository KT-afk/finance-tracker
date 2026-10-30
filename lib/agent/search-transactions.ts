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
  // Money coming in (refunds, interest, transfers in) instead of payments
  money_in?: boolean
}

export type FoundTransaction = {
  id: string
  date: string
  title: string
  category: string
  amount: number // full payment
  your_share?: number // only when someone else covers part of it
  note?: string // the owner's own note on this payment
  bank: string // the account it was paid from
  bank_text: string // the bank's own description, shortened
  // The same amount came into another of the owner's accounts that day:
  // possibly money moved between their own accounts, not spending
  same_day_in?: { bank: string; bank_text: string }
  display: string
}

export type SearchResult = {
  transactions: FoundTransaction[]
  total: number // the owner's spending across every match, not just those listed
  gross_total: number // full payments across every match
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

const BANK_TEXT = 120

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
      case "money_in":
        if (typeof value !== "boolean")
          throw new Error("money_in must be true or false")
        filters.money_in = value
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
  // Money in, by day and amount, to spot a payment matched by a transfer in
  const incoming = new Map<string, typeof rows>()
  for (const row of rows)
    if (row.amount > 0) {
      const key = `${row.date}|${roundMoney(row.amount)}`
      incoming.set(key, [...(incoming.get(key) ?? []), row])
    }

  const sameDayIn = (row: (typeof rows)[number]) => {
    const match = incoming
      .get(`${row.date}|${roundMoney(Math.abs(row.amount))}`)
      ?.find((other) => other.bank !== row.bank)
    return match
      ? {
          same_day_in: {
            bank: match.bank,
            bank_text: match.description.slice(0, BANK_TEXT),
          },
        }
      : {}
  }
  const matches: Array<FoundTransaction & { time: string | null }> = []
  let total = 0
  let grossTotal = 0
  for (const row of rows) {
    // Same classification as the dashboard, so only payments count; or,
    // when asked, only money in
    const classification = classifyCashFlow(row)
    if (filters.money_in ? row.amount <= 0 : !classification.countsAsSpend)
      continue
    if (filters.category && classification.category !== filters.category)
      continue
    const amount = roundMoney(Math.abs(row.amount))
    if (filters.min_amount !== undefined && amount < filters.min_amount)
      continue
    if (filters.max_amount !== undefined && amount > filters.max_amount)
      continue
    if (
      text &&
      ![row.description, row.payee, row.memo, row.note].some((field) =>
        field?.toLowerCase().includes(text)
      )
    )
      continue

    const share = filters.money_in
      ? amount
      : roundMoney(Math.abs(classification.effectiveAmount))
    const title = row.payee ?? describeTransaction(row.description).title
    const shared = share !== amount
    total += share
    grossTotal += amount
    matches.push({
      id: row.id,
      date: row.date,
      time: row.time,
      title,
      category: classification.category,
      amount,
      ...(shared ? { your_share: share } : {}),
      ...(row.note ? { note: row.note } : {}),
      bank: row.bank,
      bank_text: row.description.slice(0, BANK_TEXT),
      ...sameDayIn(row),
      display:
        `${title} ${formatMoney(amount)}` +
        (shared ? ` (your share ${formatMoney(share)})` : "") +
        (row.note ? ` (your note: ${row.note})` : ""),
    })
  }

  matches.sort((a, b) =>
    `${b.date} ${b.time ?? ""}`.localeCompare(`${a.date} ${a.time ?? ""}`)
  )
  return {
    transactions: matches.slice(0, LIMIT).map(({ time: _, ...t }) => t),
    total: roundMoney(total),
    gross_total: roundMoney(grossTotal),
    count: matches.length,
    more: Math.max(0, matches.length - LIMIT),
  }
}

export const searchTransactionsTool = {
  name: "search_transactions",
  strict: true,
  description:
    "Find the payments behind a number, or with money_in true, money that came in (refunds, interest, transfers in). Matches text in the merchant, description, memo or the owner's note, plus optional category, full-payment amount range and dates. Returns at most 20 payments, newest first, each with a display line to show the owner, the account it was paid from (bank), the bank's own text (bank_text), and same_day_in when the same amount came into another of the owner's accounts that day; total is the owner's spending (with money_in, the money in) and gross_total the full payments, both across every match, and more is how many matches were not listed.",
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
      money_in: {
        type: "boolean",
        description:
          "True to find money coming in (refunds, interest, salary, transfers in) instead of payments",
      },
    },
    additionalProperties: false,
    required: [],
  },
} satisfies Anthropic.Tool
