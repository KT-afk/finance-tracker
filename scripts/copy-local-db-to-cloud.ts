/**
 * Copy local SQLite data into the configured Turso/libSQL cloud database.
 *
 * Usage:
 *   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npx tsx scripts/copy-local-db-to-cloud.ts
 *   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npx tsx scripts/copy-local-db-to-cloud.ts --confirm
 */

import { createClient, type Client } from '@libsql/client'
import { config } from 'dotenv'
import { existsSync } from 'fs'
import path from 'path'

config({ path: path.join(process.cwd(), '.env.local') })
config({ path: path.join(process.cwd(), '.env') })

const confirmed = process.argv.includes('--confirm')

function expandPath(value: string) {
  return value.startsWith('~/')
    ? path.join(process.env.HOME ?? process.cwd(), value.slice(2))
    : value
}

function localDbPath() {
  return path.resolve(expandPath(process.env.FINANCE_DB_PATH ?? path.join(process.cwd(), 'finance.db')))
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is required`)
  }
  return value
}

type TableCopy = {
  name: string
  columns: string[]
  conflictColumn: string
}

const tables: TableCopy[] = [
  {
    name: 'category_rules',
    columns: ['id', 'keyword', 'category', 'created_at'],
    conflictColumn: 'keyword',
  },
  {
    name: 'ai_memory',
    columns: ['id', 'key', 'value', 'source', 'created_at'],
    conflictColumn: 'key',
  },
  {
    name: 'ai_conversations',
    columns: ['id', 'question', 'answer_text', 'answer_data', 'created_at'],
    conflictColumn: 'id',
  },
  {
    name: 'balance_history',
    columns: ['id', 'bank', 'balance', 'recorded_at'],
    conflictColumn: 'id',
  },
  {
    name: 'transactions',
    columns: ['id', 'date', 'description', 'amount', 'bank', 'category', 'is_corrected', 'hash', 'uploaded_at'],
    conflictColumn: 'hash',
  },
]

async function countRows(client: Client, table: string) {
  const result = await client.execute(`select count(*) as count from ${table}`)
  return Number(result.rows[0]?.count ?? 0)
}

async function copyTable(local: Client, cloud: Client, table: TableCopy) {
  const rows = (await local.execute(`select ${table.columns.join(', ')} from ${table.name}`)).rows
  if (!confirmed) return { read: rows.length, written: 0 }

  const placeholders = table.columns.map(() => '?').join(', ')
  const updates = table.columns
    .filter(column => column !== table.conflictColumn)
    .map(column => `${column}=excluded.${column}`)
    .join(', ')

  const sql = `
    insert into ${table.name} (${table.columns.join(', ')})
    values (${placeholders})
    on conflict(${table.conflictColumn}) do update set ${updates}
  `

  for (const row of rows) {
    await cloud.execute({
      sql,
      args: table.columns.map(column => row[column] as string | number | null),
    })
  }

  return { read: rows.length, written: rows.length }
}

async function main() {
  const sourcePath = localDbPath()
  if (!existsSync(sourcePath)) {
    throw new Error(`Local database not found: ${sourcePath}`)
  }

  const cloudUrl = requiredEnv('TURSO_DATABASE_URL')
  const cloudToken = requiredEnv('TURSO_AUTH_TOKEN')

  const local = createClient({ url: `file:${sourcePath}` })
  const cloud = createClient({ url: cloudUrl, authToken: cloudToken })

  console.log(`Local source: ${sourcePath}`)
  console.log(`Cloud target: ${cloudUrl}`)
  console.log('')

  if (!confirmed) {
    console.log('Dry run only. Re-run with --confirm to copy data.')
    console.log('')
  }

  for (const table of tables) {
    const before = confirmed ? await countRows(cloud, table.name) : null
    const result = await copyTable(local, cloud, table)
    const after = confirmed ? await countRows(cloud, table.name) : null

    if (confirmed) {
      console.log(`${table.name}: read ${result.read}, wrote ${result.written}, cloud rows ${before} -> ${after}`)
    } else {
      console.log(`${table.name}: would copy ${result.read} rows`)
    }
  }

  if (!confirmed) {
    console.log('')
    console.log('No cloud data was changed.')
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
