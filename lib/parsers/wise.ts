import { Category } from "../schema"
import { RawTransaction, ParseResult, parseCSVRows } from "./types"

/**
 * Parse a Wise "transaction-history.csv" export.
 *
 * - Only COMPLETED rows; NEUTRAL rows are conversions between own balances.
 * - One card payment can be split across balances (same ID, several rows) —
 *   these are merged into one transaction.
 * - Amounts are recorded in SGD including fees. Spends paid from a foreign
 *   balance (e.g. EUR → EUR) are converted at the rate of the latest SGD
 *   conversion into that currency before the spend.
 * - The Wise ID is used for dedupe, so identical same-day rides don't collide.
 */

const WISE_CATEGORIES: Record<string, Category> = {
  "eating out": "Food & Drink",
  transport: "Transport",
  groceries: "Groceries",
  shopping: "Shopping",
  entertainment: "Entertainment",
  "personal care": "Personal",
  trips: "Travel",
}

type Row = Record<string, string>

const num = (value: string | undefined) => parseFloat(value ?? "") || 0
const round2 = (n: number) => Math.round(n * 100) / 100

function formatLocal(amount: number, currency: string): string {
  const formatted = amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${formatted} ${currency}`
}

// Typed references ("alarm clock") are useful; bank codes and numbers aren't
function meaningfulReference(reference: string): string {
  const r = reference.trim()
  if (!r || !/[a-z]/i.test(r)) return ""
  if (!/\s/.test(r) && /\d/.test(r)) return ""
  return r
}

export function parseWise(csv: string): ParseResult {
  const rows = parseCSVRows(csv, ["ID"]).filter(
    (r) => r["Status"] === "COMPLETED"
  )

  // SGD → foreign-currency conversions, oldest first: rate = foreign per SGD
  const conversions = rows
    .filter(
      (r) => r["Direction"] === "NEUTRAL" && r["Source currency"] === "SGD"
    )
    .map((r) => ({
      at: r["Created on"],
      currency: r["Target currency"],
      rate: num(r["Exchange rate"]),
    }))
    .sort((a, b) => a.at.localeCompare(b.at))

  function sgdPerUnit(currency: string, at: string): number | null {
    const candidates = conversions.filter(
      (c) => c.currency === currency && c.rate > 0
    )
    const before = candidates.filter((c) => c.at <= at).at(-1)
    const fallback = before ?? candidates[0]
    return fallback ? 1 / fallback.rate : null
  }

  // Cost of one row in SGD, fees included
  function rowInSgd(row: Row): number | null {
    const sourceCurrency = row["Source currency"]
    const targetCurrency = row["Target currency"]
    const fee = num(row["Source fee amount"])
    const rate = num(row["Exchange rate"])
    if (sourceCurrency === "SGD")
      return num(row["Source amount (after fees)"]) + fee
    if (targetCurrency === "SGD")
      return num(row["Target amount (after fees)"]) + fee * rate
    const perUnit = sgdPerUnit(sourceCurrency, row["Created on"])
    if (perUnit === null) return null
    return (num(row["Source amount (after fees)"]) + fee) * perUnit
  }

  const groups = new Map<string, Row[]>()
  for (const row of rows) {
    if (row["Direction"] !== "IN" && row["Direction"] !== "OUT") continue
    const id = row["ID"]
    if (!id) continue
    groups.set(id, [...(groups.get(id) ?? []), row])
  }

  const transactions: RawTransaction[] = []
  for (const [id, group] of groups) {
    const first = group[0]
    // e.g. Booking.com 0.00 holds
    if (group.every((r) => num(r["Source amount (after fees)"]) === 0)) continue
    const costs = group.map(rowInSgd)
    if (costs.some((c) => c === null)) {
      console.warn(
        `[parseWise] Skipping ${id}: no SGD rate for ${first["Source currency"]}`
      )
      continue
    }
    const sgd = round2(costs.reduce<number>((sum, c) => sum + (c ?? 0), 0))
    if (sgd === 0) continue

    const isIncoming = first["Direction"] === "IN"
    const counterparty = isIncoming
      ? first["Source name"]
      : first["Target name"]
    // Foreign amount shown is what the merchant/sender actually charged/sent
    const localCurrency = isIncoming
      ? first["Source currency"]
      : first["Target currency"]
    const localAmount = group.reduce(
      (sum, r) =>
        sum +
        num(
          isIncoming
            ? r["Source amount (after fees)"]
            : r["Target amount (after fees)"]
        ),
      0
    )

    const parts = [isIncoming ? `Money added · ${counterparty}` : counterparty]
    if (localCurrency && localCurrency !== "SGD")
      parts.push(formatLocal(localAmount, localCurrency))
    const reference =
      meaningfulReference(first["Reference"] ?? "") ||
      meaningfulReference(first["Note"] ?? "")
    if (reference) parts.push(`“${reference}”`)

    const isSelfTopUp =
      isIncoming && first["Source name"] === first["Target name"]
    const categoryHint: Category | undefined = isIncoming
      ? isSelfTopUp
        ? "Self Transfer"
        : "Transfer"
      : WISE_CATEGORIES[(first["Category"] ?? "").toLowerCase()]

    transactions.push({
      date: first["Created on"].slice(0, 10),
      description: parts.join(" · "),
      amount: isIncoming ? sgd : -sgd,
      bank: "wise",
      externalId: id,
      categoryHint,
    })
  }

  return { transactions }
}
