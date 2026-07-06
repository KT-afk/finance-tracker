import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { transactions, BANKS } from '@/lib/schema'
import { desc, sql } from 'drizzle-orm'

export interface MonthCoverage {
  month: string            // YYYY-MM
  label: string            // e.g. "June 2026"
  count: number            // number of transactions that month
  uploadedAt: string       // when it was last uploaded
}

export interface BankUploadHistory {
  bank: string
  months: MonthCoverage[]
  totalTransactions: number
  lastUploadedAt: string | null
}

export async function GET() {
  try {
    // Group by bank + month (YYYY-MM) to get one row per month per bank
    const rows = await db
      .select({
        bank: transactions.bank,
        month: sql<string>`substr(${transactions.date}, 1, 7)`,
        count: sql<number>`count(*)`,
        uploadedAt: sql<string>`max(${transactions.uploaded_at})`,
      })
      .from(transactions)
      .groupBy(transactions.bank, sql`substr(${transactions.date}, 1, 7)`)
      .orderBy(desc(sql`substr(${transactions.date}, 1, 7)`))

    const historyByBank = new Map<string, MonthCoverage[]>()
    const totalByBank = new Map<string, number>()
    const lastUploadByBank = new Map<string, string>()

    for (const row of rows) {
      if (!historyByBank.has(row.bank)) {
        historyByBank.set(row.bank, [])
        totalByBank.set(row.bank, 0)
      }
      const [y, m] = row.month.split('-').map(Number)
      const label = new Date(y, m - 1, 1).toLocaleString('en-SG', { month: 'long', year: 'numeric' })
      historyByBank.get(row.bank)!.push({
        month: row.month,
        label,
        count: Number(row.count),
        uploadedAt: row.uploadedAt,
      })
      totalByBank.set(row.bank, (totalByBank.get(row.bank) ?? 0) + Number(row.count))
      if (!lastUploadByBank.has(row.bank)) {
        lastUploadByBank.set(row.bank, row.uploadedAt)
      }
    }

    const history: BankUploadHistory[] = BANKS.map(bank => ({
      bank,
      months: historyByBank.get(bank) ?? [],
      totalTransactions: totalByBank.get(bank) ?? 0,
      lastUploadedAt: lastUploadByBank.get(bank) ?? null,
    }))

    return NextResponse.json({ history })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
