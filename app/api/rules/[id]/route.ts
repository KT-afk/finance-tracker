import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { categoryRules } from '@/lib/schema'
import { eq } from 'drizzle-orm'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Check the rule exists
    const existing = await db
      .select()
      .from(categoryRules)
      .where(eq(categoryRules.id, id))

    if (existing.length === 0) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
    }

    await db.delete(categoryRules).where(eq(categoryRules.id, id))

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/rules/[id]]', err)
    return NextResponse.json({ error: 'Failed to delete rule' }, { status: 500 })
  }
}
