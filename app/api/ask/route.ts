import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { db } from '@/lib/db'
import { transactions, aiMemory, aiConversations } from '@/lib/schema'
import { sql, eq } from 'drizzle-orm'

const MODEL = 'claude-sonnet-4-6'

function getClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY not set')
  return new Anthropic({ apiKey: key })
}

interface AnswerData {
  type: 'bar'
  labels: string[]
  values: number[]
}

interface ClaudeResponse {
  intent: 'query' | 'correction' | 'teaching'
  text: string
  answer_data?: AnswerData
  // For corrections
  correction?: {
    description_fragment: string
    new_category: string
  }
  // For teaching
  memory?: {
    key: string
    value: string
  }
}

function buildTransactionSummary(): string {
  const rows = db
    .select({
      category: transactions.category,
      description: transactions.description,
      amount: transactions.amount,
      date: transactions.date,
    })
    .from(transactions)
    .all()

  if (rows.length === 0) return '(no transactions found)'

  // Group by YYYY-MM month → category → merchants
  const monthMap: Record<string, Record<string, { total: number; merchants: Record<string, number> }>> = {}
  for (const tx of rows) {
    if (tx.amount >= 0) continue // skip income/credits
    const month = tx.date.slice(0, 7) // YYYY-MM
    if (!monthMap[month]) monthMap[month] = {}
    if (!monthMap[month][tx.category]) monthMap[month][tx.category] = { total: 0, merchants: {} }
    monthMap[month][tx.category].total += Math.abs(tx.amount)
    monthMap[month][tx.category].merchants[tx.description] =
      (monthMap[month][tx.category].merchants[tx.description] ?? 0) + Math.abs(tx.amount)
  }

  const months = Object.keys(monthMap).sort()
  return months
    .map(month => {
      const catEntries = Object.entries(monthMap[month]).sort(([, a], [, b]) => b.total - a.total)
      const catLines = catEntries.map(([cat, { total, merchants }]) => {
        const topMerchants = Object.entries(merchants)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([desc, amt]) => `    - ${desc}: $${amt.toFixed(2)}`)
          .join('\n')
        return `  ${cat}: $${total.toFixed(2)}\n${topMerchants}`
      })
      return `### ${month}\n${catLines.join('\n')}`
    })
    .join('\n\n')
}

function buildMemoryBlock(): string {
  const memories = db.select().from(aiMemory).all()
  return memories.length > 0
    ? memories.map(m => `- [${m.source}] ${m.key}: ${m.value}`).join('\n')
    : '(none)'
}

const SYSTEM_PROMPT = `You are a personal finance assistant for a Singapore resident. You help them understand their spending, correct miscategorised transactions, and learn facts about their finances.

You MUST respond with valid JSON only — no markdown, no prose outside JSON.

Determine the intent of the user's question:
- "query": they are asking about their spending data
- "correction": they are correcting a transaction's category (e.g. "that Town Vets charge is Health, not Others")
- "teaching": they are telling you a personal fact (e.g. "Kt is my sister")

Response format:
{
  "intent": "query" | "correction" | "teaching",
  "text": "<plain English answer or confirmation>",
  "answer_data": { "type": "bar", "labels": [...], "values": [...] } | null,
  "correction": { "description_fragment": "<part of merchant name>", "new_category": "<category>" } | null,
  "memory": { "key": "<snake_case_key>", "value": "<fact to remember>" } | null
}

Rules:
- For queries: answer specifically with amounts. Include answer_data if a bar chart would help visualise (e.g. category breakdown, monthly trend)
- For corrections: set correction.description_fragment to a partial merchant name that uniquely identifies it; set correction.new_category to a valid category
- For teaching: set memory.key to a short snake_case identifier (e.g. "kt_is_sister"), memory.value to the full fact
- text is always required and must be a clear, direct answer or confirmation
- Do not mention the JSON format to the user — text should read naturally
- Valid categories: Food & Drink, Groceries, Transport, Shopping, Subscriptions, Health, Entertainment, Bills & Utilities, Transfer, Personal, Income, Others`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const question = (body.question ?? '').trim()
    if (!question) {
      return NextResponse.json({ error: 'question is required' }, { status: 400 })
    }

    const txSummary = buildTransactionSummary()
    const memoryBlock = buildMemoryBlock()

    const userPrompt = `## Spending history by month (expenses only, grouped by category + top merchants):
${txSummary}

## Memory (known facts about my finances):
${memoryBlock}

## My question:
${question}`

    const client = getClient()
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const raw = (message.content[0] as { type: string; text: string }).text?.trim() ?? '{}'
    // Strip markdown code fences if Claude wraps the JSON
    const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    let parsed: ClaudeResponse
    try {
      parsed = JSON.parse(stripped)
    } catch {
      // If Claude didn't return valid JSON, treat as a plain query response
      parsed = { intent: 'query', text: raw }
    }

    // Handle correction
    if (parsed.intent === 'correction' && parsed.correction) {
      const { description_fragment, new_category } = parsed.correction
      const matching = db
        .select({ id: transactions.id, description: transactions.description })
        .from(transactions)
        .where(sql`lower(${transactions.description}) like lower(${'%' + description_fragment + '%'})`)
        .all()

      if (matching.length > 0) {
        for (const tx of matching) {
          db.update(transactions)
            .set({ category: new_category, is_corrected: true })
            .where(eq(transactions.id, tx.id))
            .run()
        }
        // Store as memory so future categorisations know
        const memKey = `correction_${description_fragment.toLowerCase().replace(/\s+/g, '_')}`
        db.insert(aiMemory)
          .values({
            key: memKey,
            value: `${description_fragment} should be categorised as ${new_category}`,
            source: 'user',
            created_at: new Date().toISOString(),
          })
          .onConflictDoUpdate({
            target: aiMemory.key,
            set: { value: `${description_fragment} should be categorised as ${new_category}`, created_at: new Date().toISOString() },
          })
          .run()
      }
    }

    // Handle teaching
    if (parsed.intent === 'teaching' && parsed.memory) {
      const { key, value } = parsed.memory
      db.insert(aiMemory)
        .values({ key, value, source: 'user', created_at: new Date().toISOString() })
        .onConflictDoUpdate({
          target: aiMemory.key,
          set: { value, created_at: new Date().toISOString() },
        })
        .run()
    }

    // Save conversation
    db.insert(aiConversations)
      .values({
        question,
        answer_text: parsed.text,
        answer_data: parsed.answer_data ? JSON.stringify(parsed.answer_data) : null,
        created_at: new Date().toISOString(),
      })
      .run()

    return NextResponse.json({
      text: parsed.text,
      answer_data: parsed.answer_data ?? null,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
