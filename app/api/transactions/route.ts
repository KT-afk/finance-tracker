import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { transactions } from '@/lib/schema'
import { and, eq, gte, lte, desc, like } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const month = searchParams.get('month') // YYYY-MM
    const category = searchParams.get('category')
    const bank = searchParams.get('bank')
    const page = parseInt(searchParams.get('page') ?? '1', 10)
    const pageSize = parseInt(searchParams.get('pageSize') ?? '50', 10)

    const conditions = []

    if (month) {
      conditions.push(gte(transactions.date, `${month}-01`))
      conditions.push(lte(transactions.date, `${month}-31`))
    }
    if (category && category !== 'all') {
      conditions.push(eq(transactions.category, category))
    }
    if (bank && bank !== 'all') {
      conditions.push(eq(transactions.bank, bank as 'ocbc' | 'dbs' | 'uob' | 'trust'))
    }

    const allTxns = db
      .select()
      .from(transactions)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(transactions.date), desc(transactions.uploaded_at))
      .all()

    const total = allTxns.length
    const offset = (page - 1) * pageSize
    const paged = allTxns.slice(offset, offset + pageSize)

    return NextResponse.json({
      transactions: paged,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
