import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { transactions } from '@/lib/schema'
import { sql } from 'drizzle-orm'

interface TransactionPayload {
  id: string
  date: string
  description: string
  amount: number
  bank: string
  category: string
  is_corrected: boolean
  hash: string
  uploaded_at: string
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const txns: TransactionPayload[] = body.transactions

    if (!Array.isArray(txns) || txns.length === 0) {
      return NextResponse.json({ error: 'No transactions provided' }, { status: 400 })
    }

    let inserted = 0
    let skipped = 0

    for (const t of txns) {
      try {
        // INSERT OR IGNORE based on unique hash constraint
        db.insert(transactions)
          .values({
            id: t.id,
            date: t.date,
            description: t.description,
            amount: t.amount,
            bank: t.bank as 'ocbc' | 'dbs' | 'uob' | 'trust',
            category: t.category,
            is_corrected: t.is_corrected,
            hash: t.hash,
            uploaded_at: t.uploaded_at,
          })
          .onConflictDoNothing({ target: transactions.hash })
          .run()
        inserted++
      } catch {
        skipped++
      }
    }

    return NextResponse.json({ inserted, skipped })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
