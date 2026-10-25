import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { aiConversations } from "@/lib/schema"
import { and, desc, eq } from "drizzle-orm"

export async function GET() {
  try {
    const rows = await db
      .select()
      .from(aiConversations)
      // The web Ask page shows only its own conversation, not Telegram's
      .where(
        and(eq(aiConversations.source, "web"), eq(aiConversations.topic, "ask"))
      )
      .orderBy(desc(aiConversations.created_at))

    return NextResponse.json({ conversations: rows })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
