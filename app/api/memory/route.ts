import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { aiMemory } from '@/lib/schema'
import { desc } from 'drizzle-orm'

export async function GET() {
  try {
    const entries = db.select().from(aiMemory).orderBy(desc(aiMemory.created_at)).all()
    return NextResponse.json({ entries })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
