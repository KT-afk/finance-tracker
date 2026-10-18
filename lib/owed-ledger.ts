import type { OwedEntryKind } from "./schema"

export type OwedLedgerInput = {
  transaction_id: string
  person: string
  kind: OwedEntryKind
  amount: number
  date: string
  description: string
}

export type OwedLedgerEntry = OwedLedgerInput & {
  // What this person owed right after this entry.
  balance: number
}

export type OwedBalance = {
  person: string
  balance: number
}

export type OwedRuleMatchInput = {
  keyword: string
  starts_on: string
}

export type OwedRuleCandidate = {
  description: string
  amount: number
  date: string
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * One running total per person: shares add to it, repayments take it down.
 * Repayments are not matched to a specific month on purpose.
 * Ledger is returned newest first.
 */
export function buildOwedLedger(entries: OwedLedgerInput[]): {
  balances: OwedBalance[]
  ledger: OwedLedgerEntry[]
} {
  const sorted = [...entries].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      // Same day: count the share before the repayment
      (a.kind === b.kind ? 0 : a.kind === "share" ? -1 : 1)
  )
  const running = new Map<string, number>()
  const ledger: OwedLedgerEntry[] = sorted.map((entry) => {
    const delta = entry.kind === "share" ? entry.amount : -entry.amount
    const balance = roundMoney((running.get(entry.person) ?? 0) + delta)
    running.set(entry.person, balance)
    return { ...entry, balance }
  })

  const balances = [...running]
    .map(([person, balance]) => ({ person, balance }))
    .sort((a, b) => b.balance - a.balance)

  return { balances, ledger: ledger.reverse() }
}

export function owedRuleMatches(
  rule: OwedRuleMatchInput,
  transaction: OwedRuleCandidate
): boolean {
  return (
    transaction.amount < 0 &&
    transaction.date >= rule.starts_on &&
    transaction.description
      .replace(/\s+/g, " ")
      .toLowerCase()
      .includes(rule.keyword)
  )
}
