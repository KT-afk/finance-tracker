/**
 * One-time backfill script: re-categorise all transactions currently stuck
 * in "Transfer" or "Others" that have never been manually corrected.
 *
 * Run with: npx tsx scripts/recategorize-backfill.ts
 */

import path from 'path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { inArray, eq, and } from 'drizzle-orm'
import * as schema from '../lib/schema'
import { categorize } from '../lib/categorize'

// ── Bootstrap DB (same path as lib/db.ts) ──────────────────────────────────
const DB_PATH = path.join(process.cwd(), 'finance.db')
const sqlite = new Database(DB_PATH)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')
const db = drizzle(sqlite, { schema })

// ── Load .env so ANTHROPIC_API_KEY is available ──────────────────────────────
// Next.js loads .env.local automatically; for a raw tsx script we do it manually.
import { config } from 'dotenv'
config({ path: path.join(process.cwd(), '.env.local') })
config({ path: path.join(process.cwd(), '.env') })

async function main() {
  console.log('Querying transactions with category = Transfer or Others (is_corrected = false)...\n')

  // 4.2: Query uncorrected Transfer/Others transactions
  const rows = await db
    .select()
    .from(schema.transactions)
    .where(
      and(
        inArray(schema.transactions.category, ['Transfer', 'Others']),
        eq(schema.transactions.is_corrected, false)
      )
    )

  console.log(`Found ${rows.length} transactions to process.\n`)
  console.log('─'.repeat(80))

  let changed = 0
  let skipped = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const oldCategory = row.category

    // 4.3: Re-categorise using updated categorize()
    const newCategory = await categorize(row.description)

    // 4.4: Print progress
    const prefix = `[${String(i + 1).padStart(3, ' ')}/${rows.length}]`

    if (newCategory !== oldCategory) {
      console.log(`${prefix} ${oldCategory.padEnd(10)} → ${newCategory.padEnd(18)}  ${row.description}`)

      // Update the DB
      await db
        .update(schema.transactions)
        .set({ category: newCategory })
        .where(eq(schema.transactions.id, row.id))

      changed++
    } else {
      console.log(`${prefix} ${oldCategory.padEnd(10)} → (unchanged)         ${row.description}`)
      skipped++
    }

    // 4.6: Small delay between Claude calls to avoid rate limiting
    if (i < rows.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  // 4.5: Final summary
  console.log('\n' + '─'.repeat(80))
  console.log(`Summary:`)
  console.log(`  Total processed : ${rows.length}`)
  console.log(`  Changed         : ${changed}`)
  console.log(`  Unchanged       : ${skipped}`)
  console.log('\nDone.')
}

main().catch(err => {
  console.error('Backfill failed:', err)
  process.exit(1)
})
