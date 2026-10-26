import { Category } from "../schema"
import { RawTransaction, ParseResult, statementDateFromText } from "./types"

/**
 * Parse a Chocolate Finance monthly account statement (pdf-parse text).
 *
 * Only the "Your transactions" table is read; the "Fund transactions" section
 * is Chocolate moving the balance between funds and isn't the user's activity.
 * Direction comes from the running balance. Returns accrue into the balance a
 * few cents a day, so the "Monthly returns" row is income even though the
 * balance doesn't move on that line.
 */

const MONTHS: Record<string, string> = {
  Jan: "01",
  Feb: "02",
  Mar: "03",
  Apr: "04",
  May: "05",
  Jun: "06",
  Jul: "07",
  Aug: "08",
  Sep: "09",
  Oct: "10",
  Nov: "11",
  Dec: "12",
}

const money = (raw: string) => parseFloat(raw.replace(/[S$,]/g, ""))
const round2 = (n: number) => Math.round(n * 100) / 100

function categoryHintFor(
  description: string,
  isIncoming: boolean
): Category | undefined {
  if (/^Money added$/i.test(description)) return "Self Transfer"
  if (/return/i.test(description) && isIncoming) return "Income"
  if (/^SMRT Buses/i.test(description)) return "Transport"
  if (/^SP Digital$/i.test(description)) return "Bills & Utilities"
  return undefined
}

// Stable across re-uploads and re-issued statements: the nth occurrence of a
// given date/description/amount always gets the same ID.
function dedupeKey(seen: Map<string, number>, key: string): string {
  const n = (seen.get(key) ?? 0) + 1
  seen.set(key, n)
  return `${key}|${n}`
}

export function parseChocolatePDF(text: string): ParseResult {
  const period = text.match(
    /(\d{1,2})\s+([A-Z][a-z]{2})\s+(\d{4})\s+[–-]\s+(\d{1,2})\s+([A-Z][a-z]{2})\s+(\d{4})/
  )
  if (!period) throw new Error("Could not find the Chocolate statement period")
  const startYear = parseInt(period[3])
  const endYear = parseInt(period[6])
  const statementDate = statementDateFromText(
    `${period[4]} ${period[5]} ${period[6]}`,
    [/(.+)/]
  )

  const start = text.match(/Start of month balance\s+(S\$[\d,]+\.\d{2})/)
  const end = text.match(/End of month balance\s+(S\$[\d,]+\.\d{2})/)
  const openingBalance = start ? money(start[1]) : undefined
  const endingBalance = end ? money(end[1]) : undefined

  const section =
    text.split(/Your transactions/)[1]?.split(/Chocolate Managed Account/)[0] ??
    ""
  const lines = section.split("\n").map((l) => l.trim())

  const transactions: RawTransaction[] = []
  let previousBalance = openingBalance ?? null
  let pending = ""
  // Repeats of the same date/merchant/amount (e.g. two identical rides)
  const seen = new Map<string, number>()

  for (const line of lines) {
    const startsRow = /^\d{2}\s+[A-Z][a-z]{2}\s/.test(line)
    if (startsRow) pending = line
    else if (pending) pending += " " + line
    else continue

    const m = pending.match(
      /^(\d{2})\s+([A-Z][a-z]{2})\s+(.+?)\s+(S\$[\d,]+\.\d{2})\s+(S\$[\d,]+\.\d{2})$/
    )
    if (!m) continue
    pending = ""

    const [, day, mon, rawDescription, amountRaw, balanceRaw] = m
    const amount = money(amountRaw)
    const balance = money(balanceRaw)
    const description = rawDescription
      .replace(/^Card transaction:\s*/i, "")
      .replace(/\s+/g, " ")
      .trim()

    const isReturn = /return/i.test(description)
    let isIncoming = isReturn || /^Money added$/i.test(description)
    if (!isReturn && previousBalance !== null) {
      const delta = balance - previousBalance
      isIncoming = Math.abs(delta - amount) <= Math.abs(delta + amount)
    }
    previousBalance = balance

    const month = MONTHS[mon] ?? "01"
    // A December row on a statement ending in January belongs to the start year
    const year = month === "12" && startYear !== endYear ? startYear : endYear
    transactions.push({
      date: `${year}-${month}-${day}`,
      description,
      amount: round2(isIncoming ? amount : -amount),
      bank: "chocolate",
      externalId: dedupeKey(
        seen,
        `${year}-${month}-${day}|${description}|${amount}`
      ),
      categoryHint: categoryHintFor(description, isIncoming),
    })
  }

  const expectedNet =
    openingBalance !== undefined && endingBalance !== undefined
      ? round2(endingBalance - openingBalance)
      : undefined

  return {
    transactions,
    endingBalance,
    statementDate,
    expectedNet,
    accountType: "savings",
  }
}
