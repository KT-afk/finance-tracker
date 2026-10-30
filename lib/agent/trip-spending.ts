/**
 * Trip spending: payments made abroad between two dates. “Abroad” is a
 * foreign currency, or a country code other than SG at the end of the
 * bank's text (“OLIVE YOUNG SEOUL KR”). Flights and hotels paid from
 * Singapore, and cash, don't look foreign, so they are never included.
 */
import type Anthropic from "@anthropic-ai/sdk"
import { and, gte, lte } from "drizzle-orm"
import { classifyCashFlow } from "../cash-flow"
import { db } from "../db"
import { displayName } from "../monthly-recap"
import { isValidIsoDate, withOwedShares } from "../owed"
import { transactions } from "../schema"

export type TripSpending = {
  date_from: string
  date_to: string
  days: number
  count: number
  total: number // the owner's spending
  gross_total: number // full payments
  per_day: number
  by_category: { category: string; total: number }[]
  by_country: { country: string; total: number; count: number }[]
  first_payment: string | null
  last_payment: string | null
  biggest: { date: string; name: string; amount: number; category: string }[]
}

const round = (n: number) => Math.round(n * 100) / 100

/** The country a payment was made in, if not Singapore; else null. */
export function countryOf(row: {
  description: string
  currency: string | null
}): string | null {
  // Some banks add the amount in the local currency after the code
  // (“SEOUL KR    394,200.”)
  const code = /\s([A-Z]{2})(?:\s+[\d,]+\.?\d*)?\s*$/.exec(row.description)?.[1]
  if (code && code !== "SG") return code
  if (row.currency && row.currency.toUpperCase() !== "SGD")
    return row.currency.toUpperCase()
  return null
}

export async function tripSpending(input: {
  date_from: string
  date_to: string
  country?: string
}): Promise<TripSpending> {
  const rows = await withOwedShares(
    await db
      .select()
      .from(transactions)
      .where(
        and(
          gte(transactions.date, input.date_from),
          lte(transactions.date, input.date_to)
        )
      )
  )
  const byCategory = new Map<string, number>()
  const byCountry = new Map<string, { total: number; count: number }>()
  const found: TripSpending["biggest"] = []
  let total = 0
  let gross = 0
  for (const row of rows) {
    const country = countryOf(row)
    if (!country) continue
    if (input.country && country !== input.country) continue
    const c = classifyCashFlow(row)
    if (!c.countsAsSpend) continue
    const share = Math.abs(c.effectiveAmount)
    total += share
    gross += Math.abs(row.amount)
    byCategory.set(c.category, (byCategory.get(c.category) ?? 0) + share)
    const k = byCountry.get(country) ?? { total: 0, count: 0 }
    byCountry.set(country, { total: k.total + share, count: k.count + 1 })
    found.push({
      date: row.date,
      name: displayName(row),
      amount: round(share),
      category: c.category,
    })
  }
  const days =
    Math.round(
      (Date.parse(`${input.date_to}T00:00:00Z`) -
        Date.parse(`${input.date_from}T00:00:00Z`)) /
        86_400_000
    ) + 1
  const dates = found.map((f) => f.date).sort()
  return {
    date_from: input.date_from,
    date_to: input.date_to,
    days,
    count: found.length,
    total: round(total),
    gross_total: round(gross),
    per_day: round(total / days),
    by_category: [...byCategory]
      .map(([category, t]) => ({ category, total: round(t) }))
      .sort((a, b) => b.total - a.total),
    by_country: [...byCountry]
      .map(([country, v]) => ({
        country,
        total: round(v.total),
        count: v.count,
      }))
      .sort((a, b) => b.total - a.total),
    first_payment: dates[0] ?? null,
    last_payment: dates[dates.length - 1] ?? null,
    biggest: found.sort((a, b) => b.amount - a.amount).slice(0, 5),
  }
}

export const tripSpendingTool = {
  name: "trip_spending",
  strict: true,
  description:
    "Spending abroad between two dates, for a trip: payments in a foreign currency or whose bank text ends in a country code other than SG (e.g. SEOUL KR). Optional country is a two-letter code (KR, JP, MY…). Returns the owner's spending total and gross_total, per_day, by_category, by_country, the first and last payment dates, and the 5 biggest payments. Flights and hotels paid from Singapore, and cash, are never included.",
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
      country: {
        type: ["string", "null"],
        description: "Two-letter country code, or null for every country",
      },
    },
    additionalProperties: false,
    required: ["date_from", "date_to", "country"],
  },
} satisfies Anthropic.Tool

/** Strict check of the trip_spending input. */
export function parseTripInput(input: unknown): {
  date_from: string
  date_to: string
  country?: string
} {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Tool input must be an object")
  const { date_from, date_to, country, ...rest } = input as Record<
    string,
    unknown
  >
  if (Object.keys(rest).length)
    throw new Error("Unknown field " + Object.keys(rest)[0])
  if (!isValidIsoDate(date_from) || !isValidIsoDate(date_to))
    throw new Error("Dates must be valid YYYY-MM-DD dates")
  if ((date_from as string) > (date_to as string))
    throw new Error("date_to must not be before date_from")
  const days =
    (Date.parse(date_to as string) - Date.parse(date_from as string)) /
    86_400_000
  if (days > 92) throw new Error("A trip can be at most 3 months")
  if (country !== null && country !== undefined) {
    if (typeof country !== "string" || !/^[A-Za-z]{2}$/.test(country))
      throw new Error("country must be a two-letter code such as KR")
    return {
      date_from: date_from as string,
      date_to: date_to as string,
      country: country.toUpperCase(),
    }
  }
  return { date_from: date_from as string, date_to: date_to as string }
}
