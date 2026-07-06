import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { transactions, BANKS } from '@/lib/schema'
import { eq, desc, sql } from 'drizzle-orm'

export interface BankUploadBatch {
  uploadedAt: string       // when the CSV was uploaded
  dateFrom: string         // earliest transaction date in that batch
  dateTo: string           // latest transaction date in that batch
  count: number            // number of transactions
}

export interface BankUploadHistory {
  bank: string
  batches: BankUploadBatch[]
  totalTransactions: number
  lastUploadedAt: string | null
}

export async function GET() {
  try {
    // Group by bank + uploaded_at to identify distinct upload batches
    const rows = await db
      .select({
        bank: transactions.bank,
        uploadedAt: transactions.uploaded_at,
        dateFrom: sql<string>`min(${transactions.date})`,
        dateTo: sql<string>`max(${transactions.date})`,
        count: sql<number>`count(*)`,
      })
      .from(transactions)
      .groupBy(transactions.bank, transactions.uploaded_at)
      .orderBy(desc(transactions.uploaded_at))

    const historyByBank = new Map<string, BankUploadBatch[]>()
    const totalByBank = new Map<string, number>()
    const lastUploadByBank = new Map<string, string>()

    for (const row of rows) {
      if (!historyByBank.has(row.bank)) {
        historyByBank.set(row.bank, [])
        totalByBank.set(row.bank, 0)
      }
      historyByBank.get(row.bank)!.push({
        uploadedAt: row.uploadedAt,
        dateFrom: row.dateFrom,
        dateTo: row.dateTo,
        count: Number(row.count),
      })
      totalByBank.set(row.bank, (totalByBank.get(row.bank) ?? 0) + Number(row.count))
      if (!lastUploadByBank.has(row.bank)) {
        lastUploadByBank.set(row.bank, row.uploadedAt)
      }
    }

    const history: BankUploadHistory[] = BANKS.map(bank => ({
      bank,
      batches: historyByBank.get(bank) ?? [],
      totalTransactions: totalByBank.get(bank) ?? 0,
      lastUploadedAt: lastUploadByBank.get(bank) ?? null,
    }))

    return NextResponse.json({ history })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
