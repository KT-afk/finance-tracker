import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { aiConversations } from '@/lib/schema'
import { desc } from 'drizzle-orm'

export async function GET() {
  try {
    const rows = db
      .select()
      .from(aiConversations)
      .orderBy(desc(aiConversations.created_at))
      .all()

    return NextResponse.json({ conversations: rows })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
