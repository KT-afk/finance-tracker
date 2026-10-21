/**
 * The 10pm Telegram message (docs/superpowers/specs/
 * 2026-10-18-daily-spending-telegram-design.md, Project 3). Totals come from
 * the same classifyCashFlow() the dashboard uses, so the two always agree.
 */
import { and, eq, gte, inArray, lte } from "drizzle-orm"
import { classifyCashFlow, summarizeCashFlow } from "./cash-flow"
import { db } from "./db"
import { withOwedShares } from "./owed"
import { alertEmails, transactions } from "./schema"

const SGT_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export type DailySummary = {
  month: string // YYYY-MM
  monthLabel: string
  daysElapsed: number
  daysInMonth: number
  sinceLastNight: { total: number; byCategory: [string, number][] }
  monthTotal: number
  rent: number
  unusual: { payee: string; amount: number; category: string; usual: number }[]
  dayToDay: number
  averagePerDay: number
  salary: number | null
  pace: number
  unlabelled: { count: number; total: number }
  warnings: string[]
}

/** Calendar date and month in Singapore for an instant. */
function sgtDate(instant: Date): string {
  return new Date(instant.getTime() + SGT_OFFSET_MS).toISOString().slice(0, 10)
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function payeeOf(row: { payee: string | null; description: string }): string {
  return row.payee ?? row.description.slice(0, 40)
}

export async function buildDailySummary(
  now: Date,
  warnings: string[] = []
): Promise<DailySummary> {
  const today = sgtDate(now)
  const month = today.slice(0, 7)
  const [year, monthNum] = month.split("-").map(Number)
  const daysInMonth = new Date(Date.UTC(year, monthNum, 0)).getUTCDate()
  const daysElapsed = Number(today.slice(8, 10))

  // Since last night: alerts whose email arrived in the last 24 hours
  const windowStart = new Date(now.getTime() - DAY_MS).toISOString()
  const recentEmails = await db
    .select()
    .from(alertEmails)
    .where(gte(alertEmails.received_at, windowStart))
  const recentIds = recentEmails
    .filter((e) => e.status === "saved" && e.transaction_id)
    .map((e) => e.transaction_id as string)
  const recentRows = recentIds.length
    ? await withOwedShares(
        await db
          .select()
          .from(transactions)
          .where(inArray(transactions.id, recentIds))
      )
    : []
  const byCategory = new Map<string, number>()
  let sinceTotal = 0
  for (const row of recentRows) {
    const c = classifyCashFlow(row)
    if (!c.countsAsSpend) continue
    const amount = Math.abs(c.effectiveAmount)
    sinceTotal += amount
    byCategory.set(c.category, (byCategory.get(c.category) ?? 0) + amount)
  }
  const unread = recentEmails.filter((e) => e.status === "unrecognised").length
  if (unread > 0) {
    warnings.push(
      `${unread} bank email${unread === 1 ? "" : "s"} I couldn't read, so numbers may be incomplete`
    )
  }

  // Month so far, by each Transaction's own date, as the dashboard counts it
  const monthRows = await withOwedShares(
    await db
      .select()
      .from(transactions)
      .where(
        and(
          gte(transactions.date, `${month}-01`),
          lte(transactions.date, `${month}-31`)
        )
      )
  )
  const summary = summarizeCashFlow(monthRows)

  // What is usual for each category: the last 90 days before this month
  const history = await withOwedShares(
    await db
      .select()
      .from(transactions)
      .where(
        and(
          gte(transactions.date, shiftDate(`${month}-01`, -90)),
          lte(transactions.date, shiftDate(`${month}-01`, -1))
        )
      )
  )
  const usual = new Map<string, number[]>()
  for (const row of history) {
    const c = classifyCashFlow(row)
    if (!c.countsAsSpend) continue
    const list = usual.get(c.category) ?? []
    list.push(Math.abs(c.effectiveAmount))
    usual.set(c.category, list)
  }

  let rent = 0
  const unusual: DailySummary["unusual"] = []
  for (const row of monthRows) {
    const c = classifyCashFlow(row)
    if (!c.countsAsSpend) continue
    const amount = Math.abs(c.effectiveAmount)
    if (c.category === "Housing") {
      rent += amount
      continue
    }
    // Unusual: at least $50 and five times the category's median payment,
    // judged only once there are enough past payments to know what's normal
    const past = usual.get(c.category) ?? []
    const typical = past.length >= 5 ? median(past) : null
    if (typical !== null && amount >= 50 && amount >= typical * 5) {
      unusual.push({
        payee: payeeOf(row),
        amount,
        category: c.category,
        usual: typical,
      })
    }
  }
  const unusualTotal = unusual.reduce((sum, u) => sum + u.amount, 0)
  const dayToDay = Math.max(0, summary.spend - rent - unusualTotal)
  const averagePerDay = daysElapsed > 0 ? dayToDay / daysElapsed : 0

  // Salary: the latest income credit in the last two months that is not
  // bank interest or a savings bonus
  const incomeRows = await db
    .select()
    .from(transactions)
    .where(
      and(
        gte(transactions.date, shiftDate(today, -62)),
        eq(transactions.category, "Income")
      )
    )
  const salaryRow = incomeRows
    .filter(
      (row) =>
        classifyCashFlow(row).countsAsIncome &&
        !/\b(?:interest|bonus)\b/i.test(row.description)
    )
    .sort((a, b) => b.date.localeCompare(a.date))[0]

  const unlabelledRows = monthRows.filter((row) => {
    const c = classifyCashFlow(row)
    return c.isUnlabelled && c.countsAsSpend
  })

  return {
    month,
    monthLabel: new Intl.DateTimeFormat("en-SG", {
      month: "short",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(year, monthNum - 1, 1))),
    daysElapsed,
    daysInMonth,
    sinceLastNight: {
      total: sinceTotal,
      byCategory: [...byCategory.entries()].sort((a, b) => b[1] - a[1]),
    },
    monthTotal: summary.spend,
    rent,
    unusual,
    dayToDay,
    averagePerDay,
    salary: salaryRow ? salaryRow.amount : null,
    pace: rent + unusualTotal + averagePerDay * daysInMonth,
    unlabelled: { count: unlabelledRows.length, total: summary.unlabelled },
    warnings,
  }
}

const sgd = new Intl.NumberFormat("en-SG", {
  style: "currency",
  currency: "SGD",
  maximumFractionDigits: 0,
})

export function formatDailyMessage(
  s: DailySummary,
  appUrl: string | null
): string {
  const lines: string[] = []
  for (const warning of s.warnings) lines.push(`⚠ ${warning}`)
  if (s.warnings.length) lines.push("")

  lines.push(`Since last night: ${sgd.format(s.sinceLastNight.total)}`)
  if (s.sinceLastNight.byCategory.length) {
    lines.push(
      `Went on: ${s.sinceLastNight.byCategory
        .map(([category, amount]) => `${category} ${sgd.format(amount)}`)
        .join(" · ")}`
    )
  }
  for (const u of s.unusual) {
    lines.push(
      `  ⚠ ${sgd.format(u.amount)} at ${u.payee}: unusual for ${u.category} (normally ~${sgd.format(u.usual)})`
    )
  }

  lines.push("")
  const parts = [
    s.rent > 0 ? `rent ${sgd.format(s.rent)}` : null,
    s.unusual.length
      ? `unusual ${sgd.format(s.unusual.reduce((sum, u) => sum + u.amount, 0))}`
      : null,
    `day-to-day ${sgd.format(s.dayToDay)}`,
  ].filter(Boolean)
  lines.push(
    `${s.monthLabel} so far: ${sgd.format(s.monthTotal)} (${parts.join(" · ")})`
  )
  lines.push(
    `Avg/day (day-to-day): ${sgd.format(s.averagePerDay)}` +
      (s.salary
        ? ` → on pace for ${sgd.format(s.pace)} of ${sgd.format(s.salary)} salary`
        : ` → on pace for ${sgd.format(s.pace)}`)
  )
  if (s.unlabelled.count > 0) {
    const link = appUrl
      ? ` → ${appUrl}/transactions?month=${s.month}&review=unlabelled`
      : ""
    lines.push(
      `Unlabelled: ${s.unlabelled.count} payment${s.unlabelled.count === 1 ? "" : "s"}, ${sgd.format(s.unlabelled.total)}${link}`
    )
  }
  return lines.join("\n")
}
