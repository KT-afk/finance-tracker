import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { categoryRules } from '@/lib/schema'
import { CATEGORIES } from '@/lib/schema'
import { saveRule } from '@/lib/rules'
import { desc } from 'drizzle-orm'

export async function GET() {
  try {
    const rules = await db
      .select()
      .from(categoryRules)
      .orderBy(desc(categoryRules.created_at))

    return NextResponse.json({ rules })
  } catch (err) {
    console.error('[GET /api/rules]', err)
    return NextResponse.json({ error: 'Failed to load rules' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { keyword, category } = body

    if (!keyword || !category) {
      return NextResponse.json(
        { error: 'keyword and category are required' },
        { status: 400 }
      )
    }

    if (!(CATEGORIES as readonly string[]).includes(category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
    }

    saveRule(keyword, category)

    // Return the saved rule
    const rules = await db
      .select()
      .from(categoryRules)
      .orderBy(desc(categoryRules.created_at))

    const saved = rules.find(r => r.keyword === keyword.toLowerCase().trim())

    return NextResponse.json({ rule: saved })
  } catch (err) {
    console.error('[POST /api/rules]', err)
    return NextResponse.json({ error: 'Failed to save rule' }, { status: 500 })
  }
}
