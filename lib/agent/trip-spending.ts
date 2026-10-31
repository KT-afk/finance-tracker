/**
 * Trip spending. A trip's payments are those made abroad between its dates
 * (a foreign currency, or a country code other than SG at the end of the
 * bank's text, “OLIVE YOUNG SEOUL KR”), plus payments the owner added to
 * it (flights, hotels, a cash entry), minus payments they left out. A
 * saved trip has a name; dates alone give the abroad part only.
 */
import type Anthropic from "@anthropic-ai/sdk"
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm"
import { classifyCashFlow } from "../cash-flow"
import { db } from "../db"
import { displayName } from "../monthly-recap"
import { isValidIsoDate, withOwedShares } from "../owed"
import { transactions, tripPayments, trips } from "../schema"

export type Trip = typeof trips.$inferSelect

type Payment = { date: string; name: string; amount: number; category: string }

export type TripSpending = {
  trip: string | null // the saved trip's name
  date_from: string
  date_to: string
  country: string | null
  days: number
  count: number
  total: number // the owner's spending
  gross_total: number // full payments
  per_day: number
  by_category: { category: string; total: number }[]
  by_country: { country: string; total: number; count: number }[]
  first_payment: string | null
  last_payment: string | null
  biggest: Payment[]
  // The two parts of total: payments abroad in the dates, and payments the
  // owner added (flights, hotels, cash); per_day_abroad is the first per day
  total_abroad: number
  total_added: number
  per_day_abroad: number
  added: Payment[]
  // Added, but not spending (a refund, a transfer), so not counted
  added_not_counted: string[]
  left_out: number
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

/** A saved trip by name, ignoring case. */
export async function findTrip(name: string): Promise<Trip | undefined> {
  const [row] = await db
    .select()
    .from(trips)
    .where(eq(trips.key, tripKey(name)))
    .limit(1)
  return row
}

export function cleanTripName(name: string) {
  return name.replace(/\s+/g, " ").trim()
}

export function tripKey(name: string) {
  return cleanTripName(name).toLowerCase()
}

/** “Korea trip”, or the name as it is when it already says trip. */
export function tripLabel(name: string) {
  return /\btrip$/i.test(name) ? name : `${name} trip`
}

export async function listTrips(): Promise<Trip[]> {
  return db
    .select()
    .from(trips)
    .orderBy(sql`${trips.date_from} desc`)
}

/** The owner named a trip that isn't saved; the message goes to the agent. */
export class TripError extends Error {}

export async function tripSpending(
  input:
    { trip: string } | { date_from: string; date_to: string; country?: string }
): Promise<TripSpending> {
  let trip: Trip | undefined
  if ("trip" in input) {
    trip = await findTrip(input.trip)
    if (!trip) {
      const saved = (await listTrips()).map((t) => t.name)
      throw new TripError(
        `No saved trip called “${input.trip}”.` +
          (saved.length
            ? ` Saved trips: ${saved.join(", ")}.`
            : " No trips are saved yet.")
      )
    }
  }
  const range = trip ?? (input as { date_from: string; date_to: string })
  const country = trip
    ? (trip.country ?? undefined)
    : (input as { country?: string }).country
  const marks = trip
    ? await db
        .select()
        .from(tripPayments)
        .where(eq(tripPayments.trip_key, trip.key))
    : []
  const leftOut = new Set(
    marks.filter((m) => !m.included).map((m) => m.transaction_id)
  )
  const addedIds = marks.filter((m) => m.included).map((m) => m.transaction_id)

  const inRange = await withOwedShares(
    await db
      .select()
      .from(transactions)
      .where(
        and(
          gte(transactions.date, range.date_from),
          lte(transactions.date, range.date_to)
        )
      )
  )
  const addedRows = addedIds.length
    ? await withOwedShares(
        await db
          .select()
          .from(transactions)
          .where(inArray(transactions.id, addedIds))
      )
    : []

  const byCategory = new Map<string, number>()
  const byCountry = new Map<string, { total: number; count: number }>()
  const found: Payment[] = []
  const added: Payment[] = []
  const counted = new Set<string>()
  const notCounted: string[] = []
  let total = 0
  let gross = 0
  let abroadTotal = 0
  const count = (
    row: (typeof inRange)[number],
    where: string | null,
    list: Payment[]
  ) => {
    if (counted.has(row.id)) return
    const c = classifyCashFlow(row)
    if (!c.countsAsSpend) {
      if (!where) notCounted.push(`${displayName(row)} on ${row.date}`)
      return
    }
    counted.add(row.id)
    const share = Math.abs(c.effectiveAmount)
    total += share
    gross += Math.abs(row.amount)
    byCategory.set(c.category, (byCategory.get(c.category) ?? 0) + share)
    if (where) {
      abroadTotal += share
      const k = byCountry.get(where) ?? { total: 0, count: 0 }
      byCountry.set(where, { total: k.total + share, count: k.count + 1 })
    }
    list.push({
      date: row.date,
      name: displayName(row),
      amount: round(share),
      category: c.category,
    })
  }
  for (const row of addedRows) count(row, null, added)
  for (const row of inRange) {
    const where = countryOf(row)
    if (!where || leftOut.has(row.id)) continue
    if (country && where !== country) continue
    count(row, where, found)
  }

  const days =
    Math.round(
      (Date.parse(`${range.date_to}T00:00:00Z`) -
        Date.parse(`${range.date_from}T00:00:00Z`)) /
        86_400_000
    ) + 1
  const dates = found.map((f) => f.date).sort()
  return {
    trip: trip?.name ?? null,
    date_from: range.date_from,
    date_to: range.date_to,
    country: country ?? null,
    days,
    count: found.length + added.length,
    total: round(total),
    gross_total: round(gross),
    per_day: round(total / days),
    by_category: [...byCategory]
      .map(([category, t]) => ({ category, total: round(t) }))
      .sort((a, b) => b.total - a.total),
    by_country: [...byCountry]
      .map(([where, v]) => ({
        country: where,
        total: round(v.total),
        count: v.count,
      }))
      .sort((a, b) => b.total - a.total),
    first_payment: dates[0] ?? null,
    last_payment: dates[dates.length - 1] ?? null,
    biggest: [...found, ...added]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5),
    total_abroad: round(abroadTotal),
    total_added: round(total - abroadTotal),
    per_day_abroad: round(abroadTotal / days),
    added: added.sort((a, b) => a.date.localeCompare(b.date)),
    added_not_counted: notCounted,
    left_out: leftOut.size,
  }
}

export const tripSpendingTool = {
  name: "trip_spending",
  strict: true,
  description:
    "Spending on a trip. Give trip (a saved trip's name), or date_from and date_to for spending abroad between two dates: payments in a foreign currency or whose bank text ends in a country code other than SG (e.g. SEOUL KR); optional country is a two-letter code (KR, JP, MY…). A saved trip also counts the payments the owner added to it (added: flights, hotels, cash) and leaves out the ones they removed. Returns the owner's spending total (= total_abroad + total_added) and gross_total, per_day and per_day_abroad, by_category, by_country, the first and last payment dates abroad, and the 5 biggest payments. Without a saved trip, flights and hotels paid from Singapore, and cash, are never included.",
  input_schema: {
    type: "object" as const,
    properties: {
      trip: {
        type: ["string", "null"],
        description: "A saved trip's name, or null",
      },
      date_from: {
        type: ["string", "null"],
        description: "ISO date YYYY-MM-DD, inclusive; null with trip",
      },
      date_to: {
        type: ["string", "null"],
        description: "ISO date YYYY-MM-DD, inclusive; null with trip",
      },
      country: {
        type: ["string", "null"],
        description: "Two-letter country code, or null for every country",
      },
    },
    additionalProperties: false,
    required: ["trip", "date_from", "date_to", "country"],
  },
} satisfies Anthropic.Tool

/** Strict check of the trip_spending input. */
export function parseTripInput(
  input: unknown
): { trip: string } | { date_from: string; date_to: string; country?: string } {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Tool input must be an object")
  const { trip, date_from, date_to, country, ...rest } = input as Record<
    string,
    unknown
  >
  if (Object.keys(rest).length)
    throw new Error("Unknown field " + Object.keys(rest)[0])
  if (trip !== null && trip !== undefined) {
    if (typeof trip !== "string" || !trip.trim())
      throw new Error("trip must be a saved trip's name")
    return { trip: trip.trim() }
  }
  if (!isValidIsoDate(date_from) || !isValidIsoDate(date_to))
    throw new Error("Give a saved trip's name, or valid YYYY-MM-DD dates")
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
