/**
 * The weekly review, sent on Sundays at 10pm in place of the daily message:
 * this week (Monday to Sunday, Singapore) against the week before, the
 * groups that changed most, the top merchants, and each budget's pace.
 */
import { budgetMonth, budgetStatus, type BudgetStatus } from "./budgets"
import { budgetLines, shiftDate } from "./daily-message"
import { GROUPS, spendBetween, type Spend } from "./monthly-recap"

const ICONS = new Map<string, string>([
  ...GROUPS.map((g) => [g.name, g.icon] as [string, string]),
  ["Other", "❓"],
])

export type WeeklyReview = {
  from: string // Monday, YYYY-MM-DD
  to: string // Sunday
  total: number
  lastWeekTotal: number
  // Groups with the biggest change from last week, largest first
  changes: { name: string; icon: string; total: number; lastWeek: number }[]
  topMerchants: { payee: string; count: number; total: number }[]
  budgets: BudgetStatus[]
  day: number
  daysInMonth: number
}

const sum = (rows: Spend[]) => rows.reduce((t, s) => t + s.amount, 0)

export async function buildWeeklyReview(now: Date): Promise<WeeklyReview> {
  const month = budgetMonth(now)
  const to = month.today
  const dow = new Date(`${to}T00:00:00Z`).getUTCDay() // 0 = Sunday
  const from = shiftDate(to, -((dow + 6) % 7))
  const thisWeek = await spendBetween(from, to)
  const lastWeek = await spendBetween(shiftDate(from, -7), shiftDate(from, -1))

  const byGroup = (rows: Spend[]) => {
    const totals = new Map<string, number>()
    for (const s of rows)
      totals.set(s.group, (totals.get(s.group) ?? 0) + s.amount)
    return totals
  }
  const now7 = byGroup(thisWeek)
  const prev7 = byGroup(lastWeek)
  const changes = [...new Set([...now7.keys(), ...prev7.keys()])]
    .map((name) => ({
      name,
      icon: ICONS.get(name) ?? "❓",
      total: now7.get(name) ?? 0,
      lastWeek: prev7.get(name) ?? 0,
    }))
    // Only changes worth a line: at least $20
    .filter((c) => Math.abs(c.total - c.lastWeek) >= 20)
    .sort(
      (a, b) => Math.abs(b.total - b.lastWeek) - Math.abs(a.total - a.lastWeek)
    )
    .slice(0, 3)

  const merchants = new Map<
    string,
    { payee: string; count: number; total: number }
  >()
  for (const s of thisWeek) {
    const m = merchants.get(s.key) ?? { payee: s.payee, count: 0, total: 0 }
    m.count++
    m.total += s.amount
    merchants.set(s.key, m)
  }

  return {
    from,
    to,
    total: sum(thisWeek),
    lastWeekTotal: sum(lastWeek),
    changes,
    topMerchants: [...merchants.values()]
      .sort((a, b) => b.total - a.total)
      .slice(0, 3),
    budgets: await budgetStatus(now),
    day: month.dayOfMonth,
    daysInMonth: month.daysInMonth,
  }
}

const sgd = new Intl.NumberFormat("en-SG", {
  style: "currency",
  currency: "SGD",
  maximumFractionDigits: 0,
})

function dayLabel(date: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`))
}

const signed = (n: number) => `${n >= 0 ? "+" : "−"}${sgd.format(Math.abs(n))}`

export function formatWeeklyReview(r: WeeklyReview): string {
  const lines = [`📊 Week of ${dayLabel(r.from)} to ${dayLabel(r.to)}`, ""]
  lines.push(
    `Spent ${sgd.format(r.total)} (last week ${sgd.format(r.lastWeekTotal)}, ${signed(r.total - r.lastWeekTotal)})`
  )
  if (r.changes.length) {
    lines.push("", "Biggest changes from last week:")
    for (const c of r.changes)
      lines.push(
        `${c.icon} ${c.name}  ${sgd.format(c.total)} (was ${sgd.format(c.lastWeek)}, ${signed(c.total - c.lastWeek)})`
      )
  }
  if (r.topMerchants.length) {
    lines.push("", "Top merchants:")
    for (const m of r.topMerchants)
      lines.push(
        `• ${m.payee}${m.count > 1 ? ` ×${m.count}` : ""} ${sgd.format(m.total)}`
      )
  }
  if (r.budgets.length)
    lines.push("", ...budgetLines(r.budgets, r.day, r.daysInMonth))
  return lines.join("\n")
}
