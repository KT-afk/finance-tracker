import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { transactions } from '@/lib/schema'
import { BANKS } from '@/lib/schema'
import { sql, eq } from 'drizzle-orm'

export interface BankUploadStatus {
  bank: string
  lastUploadedAt: string | null
  daysSinceUpload: number | null
  needsReminder: boolean
}

const REMINDER_THRESHOLD_DAYS = 7 // Remind after 7 days

export async function GET() {
  try {
    // Get the most recent uploaded_at per bank
    const rows = await db
      .select({
        bank: transactions.bank,
        lastUploadedAt: sql<string>`max(${transactions.uploaded_at})`,
      })
      .from(transactions)
      .groupBy(transactions.bank)

    const uploadMap = new Map(rows.map(r => [r.bank, r.lastUploadedAt]))
    const now = new Date()

    const statuses: BankUploadStatus[] = BANKS.map(bank => {
      const lastUploadedAt = uploadMap.get(bank) ?? null
      let daysSinceUpload: number | null = null
      let needsReminder = true

      if (lastUploadedAt) {
        const last = new Date(lastUploadedAt)
        daysSinceUpload = Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24))
        needsReminder = daysSinceUpload >= REMINDER_THRESHOLD_DAYS
      }

      return { bank, lastUploadedAt, daysSinceUpload, needsReminder }
    })

    const anyNeedsReminder = statuses.some(s => s.needsReminder)

    return NextResponse.json({ statuses, anyNeedsReminder })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
