import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { aiMemory } from '@/lib/schema'
import { eq } from 'drizzle-orm'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const numId = parseInt(id, 10)
    if (isNaN(numId)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }
    await db.delete(aiMemory).where(eq(aiMemory.id, numId))
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
