import { randomUUID } from 'crypto'
import { db } from './db'
import { categoryRules } from './schema'
import { eq } from 'drizzle-orm'

/**
 * Persist a keyword→category mapping.
 * Uses upsert (INSERT OR REPLACE) so the same keyword always updates to the latest category.
 */
export async function saveRule(keyword: string, category: string): Promise<void> {
  const now = new Date().toISOString()
  const normalizedKeyword = keyword.toLowerCase().trim()

  await db.insert(categoryRules)
    .values({
      id: randomUUID(),
      keyword: normalizedKeyword,
      category,
      created_at: now,
    })
    .onConflictDoUpdate({
      target: categoryRules.keyword,
      set: { category, created_at: now },
    })
}

/**
 * Look up a category for the given description by checking all saved keyword rules.
 * Returns the matching category or null if no rule matches.
 */
export async function findRuleCategory(description: string): Promise<string | null> {
  const lower = description.toLowerCase()
  const rules = await db.select().from(categoryRules)

  for (const rule of rules) {
    if (lower.includes(rule.keyword)) {
      return rule.category
    }
  }
  return null
}
