import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { transactions } from '@/lib/schema'
import { eq } from 'drizzle-orm'
import { saveRule } from '@/lib/rules'
import { CATEGORIES } from '@/lib/schema'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const { category } = body

    if (!category || !(CATEGORIES as readonly string[]).includes(category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
    }

    // Get the transaction to extract description for rule saving
    const existing = db
      .select()
      .from(transactions)
      .where(eq(transactions.id, id))
      .get()

    if (!existing) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    // Update category and mark as corrected
    db.update(transactions)
      .set({ category, is_corrected: true })
      .where(eq(transactions.id, id))
      .run()

    // Save a keyword rule from the description
    const keyword = existing.description
      .toLowerCase()
      .replace(/^[a-z0-9]{6,}\s+/g, '')
      .trim()
      .split(/\s+/)
      .slice(0, 3)
      .join(' ')

    if (keyword.length >= 3) {
      saveRule(keyword, category)
    }

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
