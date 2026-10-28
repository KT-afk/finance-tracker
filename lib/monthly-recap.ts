/**
 * The monthly recap, sent on the 1st for the month that just ended. Each
 * broad group is compared with the owner's usual month (the three months
 * before), after setting aside one-offs and SPayLater bills, so a trip or
 * a big gift doesn't make an ordinary month look like overspending.
 * Nothing is tagged by hand: groups come from the existing categories.
 */
import { and, gte, lte } from "drizzle-orm"
import { budgetStatus, type BudgetStatus } from "./budgets"
import { classifyCashFlow, summarizeCashFlow } from "./cash-flow"
import { LATER_BILL_PATTERN, median, payeeOf } from "./daily-message"
import { describeTransaction } from "./describe-transaction"
import { db } from "./db"
import { withOwedShares } from "./owed"
import { transactions } from "./schema"

export const GROUPS = [
  { name: "Home", icon: "🏠", categories: ["Housing", "Bills & Utilities"] },
  { name: "Food", icon: "🍜", categories: ["Food & Drink", "Groceries"] },
  { name: "Transport", icon: "🚌", categories: ["Transport"] },
  { name: "Health", icon: "💊", categories: ["Health"] },
  {
    name: "Shopping",
    icon: "🛍",
    categories: ["Shopping", "Personal", "Subscriptions"],
  },
  { name: "Fun & travel", icon: "🎬", categories: ["Entertainment", "Travel"] },
] as const
const OTHER = { name: "Other", icon: "❓" } as const

export function groupOf(category: string): string {
  return (
    GROUPS.find((g) => (g.categories as readonly string[]).includes(category))
      ?.name ?? OTHER.name
  )
}

// A short name for the message: the alert's Payee, else the tidied bank text
export function displayName(row: {
  payee: string | null
  description: string
}) {
  const name = row.payee ?? describeTransaction(row.description).title
  return (
    name
      .replace(/\s+(?:SINGAPORE|SGP?)\b.*$/i, "")
      .replace(/\s·\s.*$/, "")
      .trim() || name
  )
}

/** Who was paid, loosely, so "KOPITIAM FP APP PAYMENTS" months apart match. */
export function merchantKey(row: {
  payee: string | null
  description: string
}) {
  return payeeOf(row)
    .toUpperCase()
    .replace(/[^A-Z ]/g, " ")
    .replace(
      /\b(?:FAST PAYMENT|OTHR|VIA|PAYNOW|MOBILE|NETS QR|PURCHASE|TO|SG|SINGAPORE)\b/g,
      " "
    )
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(" ")
}

export type Spend = {
  date: string
  amount: number
  group: string
  payee: string
  key: string
  laterBill: boolean
}

export async function spendBetween(from: string, to: string): Promise<Spend[]> {
  const rows = await withOwedShares(
    await db
      .select()
      .from(transactions)
      .where(and(gte(transactions.date, from), lte(transactions.date, to)))
  )
  const spend: Spend[] = []
  for (const row of rows) {
    const c = classifyCashFlow(row)
    if (!c.countsAsSpend) continue
    spend.push({
      date: row.date,
      amount: Math.abs(c.effectiveAmount),
      group: groupOf(c.category),
      payee: displayName(row),
      key: merchantKey(row),
      laterBill: LATER_BILL_PATTERN.test(row.description),
    })
  }
  return spend
}

function monthBounds(month: string, back = 0): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number)
  const start = new Date(Date.UTC(y, m - 1 - back, 1))
  const end = new Date(Date.UTC(y, m - back, 0))
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  }
}

// Big for its group: at least $100 and four times a typical payment there
function isBig(amount: number, typical: number): boolean {
  return amount >= 100 && amount >= typical * 4
}

export type MonthlyRecap = {
  month: string // YYYY-MM
  monthLabel: string
  total: number
  usualTotal: number | null
  oneOffs: { date: string; payee: string; amount: number }[]
  laterBills: number
  lastMonth: { label: string; total: number }
  // Each budget at the end of the month (today's limits)
  budgets: BudgetStatus[]
  groups: {
    name: string
    icon: string
    total: number
    usual: number | null
    direction: "up" | "down" | null
    topMerchants: { payee: string; count: number; total: number }[]
  }[]
}

export async function buildMonthlyRecap(month: string): Promise<MonthlyRecap> {
  const { from, to } = monthBounds(month)
  const rows = await spendBetween(from, to)
  const monthRows = await withOwedShares(
    await db
      .select()
      .from(transactions)
      .where(and(gte(transactions.date, from), lte(transactions.date, to)))
  )
  const total = summarizeCashFlow(monthRows).spend

  // The three months before, for what's usual
  const history: Spend[][] = []
  for (let back = 1; back <= 3; back++) {
    const b = monthBounds(month, back)
    history.push(await spendBetween(b.from, b.to))
  }
  const monthsWithData = history.filter((h) => h.length > 0)
  const past = monthsWithData.flat()
  const typical = new Map<string, number>()
  for (const g of [...GROUPS.map((g) => g.name), OTHER.name]) {
    typical.set(
      g,
      // A group with no history has no typical payment: anything $100+ is big
      past.some((s) => s.group === g)
        ? median(past.filter((s) => s.group === g).map((s) => s.amount))
        : 0
    )
  }
  const seenBefore = new Set(past.map((s) => s.key))

  // One-off: big for its group at a merchant not paid in the last 3 months.
  // Home (rent, bills) is fixed, so never a one-off.
  const isOneOff = (s: Spend) =>
    s.group !== "Home" &&
    !s.laterBill &&
    isBig(s.amount, typical.get(s.group) ?? 0) &&
    !seenBefore.has(s.key)
  const oneOffs = rows.filter(isOneOff)
  const laterBills = rows
    .filter((s) => s.laterBill)
    .reduce((sum, s) => sum + s.amount, 0)
  const regular = rows.filter((s) => !s.laterBill && !isOneOff(s))

  // Usual per group: past months without their own big payments or bills
  const usualByGroup = new Map<string, number>()
  for (const s of past) {
    if (s.laterBill) continue
    if (s.group !== "Home" && isBig(s.amount, typical.get(s.group) ?? 0))
      continue
    usualByGroup.set(
      s.group,
      (usualByGroup.get(s.group) ?? 0) + s.amount / monthsWithData.length
    )
  }

  const groups: MonthlyRecap["groups"] = []
  for (const g of [...GROUPS, OTHER]) {
    const inGroup = regular.filter((s) => s.group === g.name)
    const groupTotal = inGroup.reduce((sum, s) => sum + s.amount, 0)
    const usual = monthsWithData.length ? (usualByGroup.get(g.name) ?? 0) : null
    if (groupTotal === 0 && !usual) continue
    // Clearly different: at least $50 and 20% away from usual
    const gap = usual === null ? 0 : groupTotal - usual
    const clear = usual !== null && Math.abs(gap) >= Math.max(50, usual * 0.2)
    const direction = clear ? (gap > 0 ? "up" : "down") : null

    const merchants = new Map<
      string,
      { payee: string; count: number; total: number }
    >()
    for (const s of inGroup) {
      const m = merchants.get(s.key) ?? { payee: s.payee, count: 0, total: 0 }
      m.count++
      m.total += s.amount
      merchants.set(s.key, m)
    }
    groups.push({
      name: g.name,
      icon: g.icon,
      total: groupTotal,
      usual,
      direction,
      topMerchants:
        direction === "up"
          ? [...merchants.values()]
              .sort((a, b) => b.total - a.total)
              .slice(0, 3)
          : [],
    })
  }

  const [y, m] = month.split("-").map(Number)
  const before = monthBounds(month, 1)
  const label = (yy: number, mm: number) =>
    new Intl.DateTimeFormat("en-SG", { month: "long", timeZone: "UTC" }).format(
      new Date(Date.UTC(yy, mm - 1, 1))
    )
  return {
    month,
    monthLabel: new Intl.DateTimeFormat("en-SG", {
      month: "long",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(y, m - 1, 1))),
    total,
    usualTotal: monthsWithData.length
      ? monthsWithData.flat().reduce((sum, s) => sum + s.amount, 0) /
        monthsWithData.length
      : null,
    oneOffs: oneOffs
      .map(({ date, payee, amount }) => ({ date, payee, amount }))
      .sort((a, b) => b.amount - a.amount),
    laterBills,
    lastMonth: {
      label: label(y, m - 1),
      total: summarizeCashFlow(
        await withOwedShares(
          await db
            .select()
            .from(transactions)
            .where(
              and(
                gte(transactions.date, before.from),
                lte(transactions.date, before.to)
              )
            )
        )
      ).spend,
    },
    // 11pm in Singapore on the month's last day: the whole month counted
    budgets: await budgetStatus(new Date(`${to}T15:00:00Z`)),
    groups,
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

export function formatMonthlyRecap(r: MonthlyRecap): string {
  const lines = [`📊 ${r.monthLabel} recap`, ""]
  lines.push(
    `Spent ${sgd.format(r.total)}` +
      (r.usualTotal !== null
        ? ` (usual month ~${sgd.format(r.usualTotal)})`
        : "")
  )

  const change = r.total - r.lastMonth.total
  if (r.lastMonth.total > 0)
    lines.push(
      `${r.lastMonth.label}: ${sgd.format(r.lastMonth.total)} (${change >= 0 ? "+" : "−"}${sgd.format(Math.abs(change))} this month)`
    )

  if (r.oneOffs.length) {
    lines.push("")
    lines.push(
      `One-offs: ${sgd.format(r.oneOffs.reduce((sum, o) => sum + o.amount, 0))}`
    )
    for (const o of r.oneOffs) {
      lines.push(`• ${sgd.format(o.amount)}  ${o.payee} · ${dayLabel(o.date)}`)
    }
  }
  if (r.laterBills > 0) {
    lines.push("")
    lines.push(
      `SPayLater bill: ${sgd.format(r.laterBills)} (earlier Shopee purchases)`
    )
  }

  lines.push("")
  lines.push(
    r.groups.some((g) => g.usual !== null)
      ? "Everything else vs your usual month:"
      : "Everything else:"
  )
  for (const g of r.groups) {
    const usual = g.usual !== null ? `   usual ${sgd.format(g.usual)}` : ""
    const arrow =
      g.direction === "up"
        ? `   ⬆ +${sgd.format(g.total - (g.usual ?? 0))}`
        : g.direction === "down"
          ? "   ⬇"
          : ""
    lines.push(`${g.icon} ${g.name}  ${sgd.format(g.total)}${usual}${arrow}`)
    if (g.topMerchants.length) {
      lines.push(
        "    " +
          g.topMerchants
            .map(
              (m) =>
                `${m.payee}${m.count > 1 ? ` ×${m.count}` : ""} ${sgd.format(m.total)}`
            )
            .join(" · ")
      )
    }
  }
  if (r.budgets.length) {
    lines.push("")
    lines.push(`Budgets in ${r.monthLabel}:`)
    for (const b of r.budgets) {
      const result =
        b.left < 0
          ? `over by ${sgd.format(-b.left)}`
          : `within budget, ${sgd.format(b.left)} left`
      lines.push(
        `${b.left < 0 ? "⚠️" : "✅"} ${b.category}: ${sgd.format(b.spent)} of ${sgd.format(b.limit)} (${b.usedPct}%) · ${result}`
      )
    }
  }
  return lines.join("\n")
}
