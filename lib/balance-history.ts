import { sql } from "drizzle-orm"
import { db } from "./db"
import { AccountType, Bank, balanceHistory } from "./schema"

type SaveBalanceHistoryInput = {
  bank: Bank
  balance: number
  accountType: AccountType
  recordedAt: string
}

export async function saveBalanceHistory({
  bank,
  balance,
  accountType,
  recordedAt,
}: SaveBalanceHistoryInput): Promise<void> {
  const insert = () =>
    db.insert(balanceHistory).values({
      bank,
      balance,
      account_type: accountType,
      recorded_at: recordedAt,
    })

  try {
    await insert()
  } catch {
    // Older hosted databases may not have the account_type column yet
    // (0003_balance_account_type.sql was never added to the drizzle journal).
    // Add it in place so credit card balances aren't stored as savings.
    try {
      await db.run(sql`
        ALTER TABLE balance_history
        ADD COLUMN account_type text NOT NULL DEFAULT 'savings'
      `)
      await insert()
      return
    } catch {
      // Fall through to the legacy insert.
    }
    await db.run(sql`
      INSERT INTO balance_history (bank, balance, recorded_at)
      VALUES (${bank}, ${balance}, ${recordedAt})
    `)
  }
}
