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
  try {
    await db.insert(balanceHistory).values({
      bank,
      balance,
      account_type: accountType,
      recorded_at: recordedAt,
    })
  } catch {
    // Older hosted databases may not have the account_type migration yet.
    await db.run(sql`
      INSERT INTO balance_history (bank, balance, recorded_at)
      VALUES (${bank}, ${balance}, ${recordedAt})
    `)
  }
}
