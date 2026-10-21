import { and, eq, gte, isNull, lte } from "drizzle-orm"
import { db } from "../db"
import { transactions } from "../schema"

/**
 * Reconciliation (see CONTEXT.md): a Statement Line that is the same
 * real-world payment as a Transaction already known from a Payment Alert
 * confirms that Transaction instead of adding a second copy.
 *
 * Statements post card payments a few days after the alert, so a line
 * matches an unconfirmed alert on the same bank with the exact same SGD
 * amount, dated from a day before to four days after the alert.
 */
const DAYS_BEFORE = 1
const DAYS_AFTER = 4

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

type StatementLine = {
  date: string
  amount: number
  bank: string
  hash: string
}

/**
 * Confirms the alert Transaction this Statement Line is, if any, and
 * returns its id. When several alerts fit (two identical coffees on
 * nearby days), the one closest in date is used; they are the same kind
 * of payment, so either pairing gives the same totals. `taken` holds
 * alerts already confirmed by earlier lines in the same upload.
 */
export async function confirmMatchingAlert(
  line: StatementLine,
  taken: Set<string>
): Promise<string | null> {
  if (line.bank !== "ocbc" && line.bank !== "uob") return null

  const candidates = await db
    .select({ id: transactions.id, date: transactions.date })
    .from(transactions)
    .where(
      and(
        eq(transactions.source, "alert"),
        isNull(transactions.confirmed_at),
        eq(transactions.bank, line.bank),
        gte(transactions.amount, line.amount - 0.005),
        lte(transactions.amount, line.amount + 0.005),
        // An alert dated up to DAYS_AFTER before the line, or a day after
        gte(transactions.date, shiftDate(line.date, -DAYS_AFTER)),
        lte(transactions.date, shiftDate(line.date, DAYS_BEFORE))
      )
    )
  const distance = (date: string) =>
    Math.abs(Date.parse(line.date) - Date.parse(date))
  const match = candidates
    .filter((c) => !taken.has(c.id))
    .sort((a, b) => distance(a.date) - distance(b.date))[0]
  if (!match) return null

  // The alert keeps its details and the owner's category. Taking the
  // line's hash means re-uploading the same Statement skips this line.
  await db
    .update(transactions)
    .set({
      amount: line.amount,
      hash: line.hash,
      confirmed_at: new Date().toISOString(),
    })
    .where(eq(transactions.id, match.id))
  taken.add(match.id)
  return match.id
}
