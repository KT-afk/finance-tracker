import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { db } from '@/lib/db'
import { transactions, aiMemory } from '@/lib/schema'
import { sql, and, gte, lt } from 'drizzle-orm'

const MODEL = 'claude-sonnet-4-6'

function getClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY not set')
  return new Anthropic({ apiKey: key })
}

function getMonthRange(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const start = `${y}-${m}-01`
  const nextMonth = new Date(y, date.getMonth() + 1, 1)
  const ny = nextMonth.getFullYear()
  const nm = String(nextMonth.getMonth() + 1).padStart(2, '0')
  const end = `${ny}-${nm}-01`
  return { start, end }
}

function getPastMonthRanges(monthsBack: number): Array<{ label: string; start: string; end: string }> {
  const ranges = []
  for (let i = 1; i <= monthsBack; i++) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    const y = d.getFullYear()
    const m = d.getMonth()
    const start = `${y}-${String(m + 1).padStart(2, '0')}-01`
    const nextD = new Date(y, m + 1, 1)
    const end = `${nextD.getFullYear()}-${String(nextD.getMonth() + 1).padStart(2, '0')}-01`
    const label = d.toLocaleString('en-SG', { month: 'long', year: 'numeric' })
    ranges.push({ label, start, end })
  }
  return ranges
}

export async function POST() {
  try {
    const now = new Date()
    const { start: monthStart, end: monthEnd } = getMonthRange(now)

    // Current month transactions (expenses only, amount < 0)
    const currentTxs = db
      .select({
        category: transactions.category,
        description: transactions.description,
        amount: transactions.amount,
      })
      .from(transactions)
      .where(
        and(
          gte(transactions.date, monthStart),
          lt(transactions.date, monthEnd),
          sql`${transactions.amount} < 0`
        )
      )
      .all()

    if (currentTxs.length === 0) {
      return NextResponse.json({ text: 'No transactions yet this month.' })
    }

    // Build full monthly summaries for current + 5 prior months
    function buildMonthSummary(start: string, end: string): string {
      const rows = db
        .select({
          category: transactions.category,
          description: transactions.description,
          amount: transactions.amount,
        })
        .from(transactions)
        .where(and(gte(transactions.date, start), lt(transactions.date, end), sql`${transactions.amount} < 0`))
        .all()

      if (rows.length === 0) return '  (no data)'

      const catMap: Record<string, { total: number; merchants: Record<string, number> }> = {}
      for (const tx of rows) {
        if (!catMap[tx.category]) catMap[tx.category] = { total: 0, merchants: {} }
        catMap[tx.category].total += Math.abs(tx.amount)
        catMap[tx.category].merchants[tx.description] =
          (catMap[tx.category].merchants[tx.description] ?? 0) + Math.abs(tx.amount)
      }

      return Object.entries(catMap)
        .sort(([, a], [, b]) => b.total - a.total)
        .map(([cat, { total, merchants }]) => {
          const topMerchants = Object.entries(merchants)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([desc, amt]) => `    - ${desc}: $${amt.toFixed(2)}`)
            .join('\n')
          return `  ${cat}: $${total.toFixed(2)}\n${topMerchants}`
        })
        .join('\n')
    }

    // All 6 months: current + 5 prior
    const allMonthRanges = [{ label: now.toLocaleString('en-SG', { month: 'long', year: 'numeric' }), start: monthStart, end: monthEnd }, ...getPastMonthRanges(5)]
    const monthSections = allMonthRanges.map(({ label, start, end }) =>
      `### ${label}\n${buildMonthSummary(start, end)}`
    ).join('\n\n')

    // Memory
    const memories = db.select().from(aiMemory).all()
    const memoryBlock =
      memories.length > 0
        ? memories.map(m => `- [${m.source}] ${m.key}: ${m.value}`).join('\n')
        : '(none)'

    const currentMonthLabel = now.toLocaleString('en-SG', { month: 'long', year: 'numeric' })

    const systemPrompt = `You are a personal finance analyst for a Singapore resident. You have 6 months of spending data. Generate a concise, plain-English insight.

Rules:
- Lead with cross-time patterns if they exist: consistent overspending in a category, a category trending up over months, recurring large one-off expenses
- Only comment on the current month specifically if it's meaningfully different from the established pattern
- For "Others" category transactions, name what they actually are (e.g. "flights", "vet visits") based on merchant names
- Be specific with amounts and merchant names
- Do NOT flag items the memory says are normal or expected
- Keep to 3–5 sentences maximum
- Write in second person ("you spent...", "your...")
- Do not mention the memory system to the user`

    const userPrompt = `## Spending by month (6 months, newest first):
${monthSections}

## Memory (known facts about this user's finances):
${memoryBlock}

Generate a spending insight for ${currentMonthLabel}.`

    const client = getClient()
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const text = (message.content[0] as { type: string; text: string }).text?.trim() ?? ''
    return NextResponse.json({ text })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
