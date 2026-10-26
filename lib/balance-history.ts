import { db } from "./db"
import { AccountType, Bank, BANKS, balanceHistory } from "./schema"
import { eq, sql } from "drizzle-orm"

type SaveBalanceHistoryInput = {
  bank: Bank
  balance: number
  accountType: AccountType
  recordedAt: string
  // YYYY-MM-DD the balance was true for, when known
  statementDate?: string
}

export async function saveBalanceHistory({
  bank,
  balance,
  accountType,
  recordedAt,
  statementDate,
}: SaveBalanceHistoryInput): Promise<void> {
  await db.insert(balanceHistory).values({
    bank,
    balance,
    account_type: accountType,
    recorded_at: recordedAt,
    statement_date: statementDate ?? null,
  })
}

// A statement's ending balance is true at the statement's date. Use the
// date the parser read, else the statement's last transaction. Pass every
// parsed date, not only the new ones, or a re-upload gets the wrong date.
export function statementDateFor(
  parsed: { statementDate?: string },
  transactionDates: string[]
): string | undefined {
  return parsed.statementDate ?? [...transactionDates].sort().at(-1)
}

export type LatestBalance = {
  bank: Bank
  balance: number
  account_type: string
  recorded_at: string
  // The date the balance was true for; for rows saved before ticket 25,
  // the day they were saved
  as_of: string
  // False when as_of is only the day saved, so the balance may be older
  exact: boolean
}

type BalanceRow = {
  balance: number
  account_type: string
  recorded_at: string
  statement_date: string | null
}

async function rowsFor(bank: Bank): Promise<BalanceRow[]> {
  try {
    return await db
      .select({
        balance: balanceHistory.balance,
        account_type: sql<string>`COALESCE(${balanceHistory.account_type}, 'savings')`,
        recorded_at: balanceHistory.recorded_at,
        statement_date: balanceHistory.statement_date,
      })
      .from(balanceHistory)
      .where(eq(balanceHistory.bank, bank))
  } catch {
    // Database behind on migrations: try without statement_date (0007),
    // then without account_type too
  }
  try {
    const rows = await db
      .select({
        balance: balanceHistory.balance,
        account_type: sql<string>`COALESCE(${balanceHistory.account_type}, 'savings')`,
        recorded_at: balanceHistory.recorded_at,
      })
      .from(balanceHistory)
      .where(eq(balanceHistory.bank, bank))
    return rows.map((r) => ({ ...r, statement_date: null }))
  } catch {
    const rows = await db
      .select({
        balance: balanceHistory.balance,
        recorded_at: balanceHistory.recorded_at,
      })
      .from(balanceHistory)
      .where(eq(balanceHistory.bank, bank))
    return rows.map((r) => ({
      ...r,
      account_type: "savings",
      statement_date: null,
    }))
  }
}

type Dated = { recorded_at: string; statement_date: string | null }

function asOf(row: Dated): string {
  return row.statement_date ?? row.recorded_at.slice(0, 10)
}

// Newest by the date each balance was true for, the later save breaking
// ties. Rows saved before ticket 25 only know the day they were saved, and
// every dated row was saved after them, so a dated row always wins: an
// August statement uploaded in October must not hide a newer September one.
export function compareBalanceRows(a: Dated, b: Dated): number {
  return (
    Number(b.statement_date !== null) - Number(a.statement_date !== null) ||
    asOf(b).localeCompare(asOf(a)) ||
    b.recorded_at.localeCompare(a.recorded_at)
  )
}

export function balanceAsOf(row: Dated): string {
  return asOf(row)
}

export async function latestBalances(): Promise<LatestBalance[]> {
  const latest = await Promise.all(
    BANKS.map(async (bank) => {
      const [row] = (await rowsFor(bank)).sort(compareBalanceRows)
      return row
        ? {
            bank,
            balance: row.balance,
            account_type: row.account_type,
            recorded_at: row.recorded_at,
            as_of: asOf(row),
            exact: row.statement_date !== null,
          }
        : null
    })
  )
  return latest.filter((row) => row !== null)
}
