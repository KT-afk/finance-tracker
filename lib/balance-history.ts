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
  await db.insert(balanceHistory).values({
    bank,
    balance,
    account_type: accountType,
    recorded_at: recordedAt,
  })
}
