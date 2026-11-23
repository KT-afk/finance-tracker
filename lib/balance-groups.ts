/**
 * The owner's money in three groups: spending money (accounts paid from
 * day to day, minus what's owed on cards), savings (cash kept aside) and
 * investments (IBKR). Balances come from statements or from the owner
 * telling the agent; each keeps the date it was true for.
 */
import { like } from "drizzle-orm"
import { compareBalanceRows, balanceAsOf } from "./balance-history"
import { db } from "./db"
import { balanceHistory, investments, transactions, type Bank } from "./schema"

export type MoneyGroup = "spending" | "savings"

// Which group each bank's deposit account is in (the owner's answer,
// 2026-11-20). Every credit card is spending money, as an amount owed.
export const ACCOUNT_GROUPS: Record<Bank, MoneyGroup> = {
  trust: "spending",
  wise: "spending",
  chocolate: "spending",
  ocbc: "savings",
  dbs: "savings",
  uob: "savings",
}

export type GroupAccount = {
  bank: Bank
  account_type: string
  balance: number // as the bank shows it; for a card, the amount owed
  counts_as: number // negative for an amount owed
  as_of: string
  exact: boolean
}

export type BalanceGroups = {
  spending: { total: number; accounts: GroupAccount[] }
  savings: { total: number; accounts: GroupAccount[] }
  investments: {
    // Money put in: before the app's records, plus every debit since
    put_in: number
    put_in_before: number | null
    put_in_since_records: number
    debits: number
    first_debit: string | null
    // The latest value the owner gave, if any
    value: number | null
    value_as_of: string | null
  }
  // Deposit accounts with no balance yet, by bank
  missing: Bank[]
}

const round = (n: number) => Math.round(n * 100) / 100

// The monthly debit to IBKR, as the statement shows it
const IBKR_DEBIT = "%COLLECTION/TRANSFER%Interactive%"

export async function balanceGroups(): Promise<BalanceGroups> {
  const rows = await db.select().from(balanceHistory)
  const latest = new Map<string, (typeof rows)[number]>()
  for (const row of [...rows].sort(compareBalanceRows)) {
    const key = `${row.bank}|${row.account_type ?? "savings"}`
    if (!latest.has(key)) latest.set(key, row)
  }
  const groups: BalanceGroups = {
    spending: { total: 0, accounts: [] },
    savings: { total: 0, accounts: [] },
    investments: {
      put_in: 0,
      put_in_before: null,
      put_in_since_records: 0,
      debits: 0,
      first_debit: null,
      value: null,
      value_as_of: null,
    },
    missing: [],
  }
  for (const row of latest.values()) {
    const card = row.account_type === "credit_card"
    const group = card ? "spending" : ACCOUNT_GROUPS[row.bank]
    const countsAs = card ? -Math.abs(row.balance) : row.balance
    groups[group].accounts.push({
      bank: row.bank,
      account_type: row.account_type ?? "savings",
      balance: row.balance,
      counts_as: countsAs,
      as_of: balanceAsOf(row),
      exact: row.statement_date !== null,
    })
    groups[group].total += countsAs
  }
  groups.spending.total = round(groups.spending.total)
  groups.savings.total = round(groups.savings.total)
  groups.missing = (Object.keys(ACCOUNT_GROUPS) as Bank[]).filter(
    (bank) =>
      ![...latest.values()].some(
        (r) => r.bank === bank && r.account_type !== "credit_card"
      )
  )

  const debits = await db
    .select({ date: transactions.date, amount: transactions.amount })
    .from(transactions)
    .where(like(transactions.description, IBKR_DEBIT))
  const sinceRecords = debits
    .filter((d) => d.amount < 0)
    .reduce((sum, d) => sum + Math.abs(d.amount), 0)
  const [ibkr] = await db.select().from(investments)
  groups.investments = {
    put_in_before: ibkr?.put_in_before ?? null,
    put_in_since_records: round(sinceRecords),
    put_in: round(sinceRecords + (ibkr?.put_in_before ?? 0)),
    debits: debits.length,
    first_debit: debits.map((d) => d.date).sort()[0] ?? null,
    value: ibkr?.value ?? null,
    value_as_of: ibkr?.value_as_of ?? null,
  }
  return groups
}
