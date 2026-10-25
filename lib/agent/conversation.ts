import { and, desc, eq } from "drizzle-orm"
import { db } from "../db"
import { aiConversations, type ConversationSource } from "../schema"

export type Exchange = { question: string; answer: string }

// "and last month?" only makes sense against a recent conversation
const MAX_EXCHANGES = 10
const FRESH_AFTER_MS = 6 * 60 * 60 * 1000

/**
 * The last 10 exchanges in this source and topic, oldest first, or none
 * when the latest is 6 hours old or more.
 */
export async function loadHistory(
  source: ConversationSource,
  topic: string,
  now: Date
): Promise<Exchange[]> {
  const rows = await db
    .select()
    .from(aiConversations)
    .where(
      and(eq(aiConversations.source, source), eq(aiConversations.topic, topic))
    )
    .orderBy(desc(aiConversations.created_at), desc(aiConversations.id))
    .limit(MAX_EXCHANGES)
  if (!rows.length) return []
  const latest = new Date(rows[0].created_at).getTime()
  if (now.getTime() - latest >= FRESH_AFTER_MS) return []
  return rows
    .reverse()
    .map((row) => ({ question: row.question, answer: row.answer_text }))
}

export async function saveExchange(exchange: {
  question: string
  answer: string
  source: ConversationSource
  topic: string
  at: Date
}) {
  await db.insert(aiConversations).values({
    question: exchange.question,
    answer_text: exchange.answer,
    answer_data: null,
    source: exchange.source,
    topic: exchange.topic,
    created_at: exchange.at.toISOString(),
  })
}
