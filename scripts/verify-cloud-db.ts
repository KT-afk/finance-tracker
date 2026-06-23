/**
 * Verify that the configured Turso/libSQL cloud database is reachable and migrated.
 *
 * Usage:
 *   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npm run db:verify-cloud
 */

import { createClient, type Client } from '@libsql/client'
import { config } from 'dotenv'
import path from 'path'

config({ path: path.join(process.cwd(), '.env.local') })
config({ path: path.join(process.cwd(), '.env') })

const expectedTables = [
  'transactions',
  'category_rules',
  'ai_conversations',
  'ai_memory',
  'balance_history',
]

function requiredEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is required`)
  }
  return value
}

async function tableExists(client: Client, table: string) {
  const result = await client.execute({
    sql: "select name from sqlite_master where type = 'table' and name = ?",
    args: [table],
  })
  return result.rows.length > 0
}

async function countRows(client: Client, table: string) {
  const result = await client.execute(`select count(*) as count from ${table}`)
  return Number(result.rows[0]?.count ?? 0)
}

async function main() {
  const url = requiredEnv('TURSO_DATABASE_URL')
  const authToken = requiredEnv('TURSO_AUTH_TOKEN')
  const client = createClient({ url, authToken })

  console.log(`Cloud database: ${url}`)
  console.log('')

  for (const table of expectedTables) {
    if (!(await tableExists(client, table))) {
      throw new Error(`Missing table: ${table}. Run npx drizzle-kit migrate with TURSO_DATABASE_URL/TURSO_AUTH_TOKEN.`)
    }

    console.log(`${table}: ${await countRows(client, table)} rows`)
  }

  console.log('')
  console.log('Cloud database is reachable and migrated.')
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
