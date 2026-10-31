/**
 * How proposals and change-log entries name things to the owner, and how
 * share values are stored ("person|amount").
 */
import { describeTransaction } from "../describe-transaction"

export function money(amount: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(Math.abs(amount))
}

export function day(date: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`))
}

/** How a payment is named to the owner: "Shopee $80 on 6 Sept 2026". */
export function describePayment(tx: {
  payee: string | null
  description: string
  amount: number
  date: string
}): string {
  const title = tx.payee ?? describeTransaction(tx.description).title
  return `${title} ${money(tx.amount)} on ${day(tx.date)}`
}

/** "Jane|40" ↔ { person, amount }; "" means no share. */
export function encodeShare(share: { person: string; amount: number } | null) {
  return share ? `${share.person}|${share.amount}` : ""
}
export function decodeShare(value: string) {
  if (!value) return null
  const at = value.lastIndexOf("|")
  return { person: value.slice(0, at), amount: Number(value.slice(at + 1)) }
}
/** How a share reads to the owner: "Jane owes $40", or "no share". */
export function describeShare(value: string) {
  const share = decodeShare(value)
  return share ? `${share.person} owes ${money(share.amount)}` : "no share"
}

/** How a budget limit reads: "$500", or "none". */
export function describeBudget(value: string) {
  return value ? money(Number(value)) : "none"
}

/** A saved trip as stored in proposals and the change log; "" means none. */
export type TripValue = {
  name: string
  date_from: string
  date_to: string
  country: string | null
}
export function encodeTrip(trip: TripValue | null) {
  return trip ? JSON.stringify(trip) : ""
}
export function decodeTrip(value: string): TripValue | null {
  return value ? (JSON.parse(value) as TripValue) : null
}
/** How a trip reads: "Korea, 26 Apr 2026 to 13 May 2026 (KR)", or "none". */
export function describeTrip(value: string) {
  const trip = decodeTrip(value)
  if (!trip) return "none"
  return (
    `${trip.name}, ${day(trip.date_from)} to ${day(trip.date_to)}` +
    (trip.country ? ` (${trip.country})` : "")
  )
}
/** A payment's place in a trip ("in", "out" or ""): added, left out, or neither. */
export function describeTripMark(value: string) {
  return value === "in" ? "added" : value === "out" ? "left out" : "neither"
}
