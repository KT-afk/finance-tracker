import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdirSync } from 'fs'
import path from 'path'
import * as schema from './schema'

function resolveLocalDbUrl() {
  const configuredPath = process.env.FINANCE_DB_PATH
  const dbPath = configuredPath || path.join(process.cwd(), 'finance.db')

  const expandedPath = dbPath.startsWith('~/')
    ? path.join(process.env.HOME ?? process.cwd(), dbPath.slice(2))
    : dbPath

  const resolvedPath = path.resolve(expandedPath)
  mkdirSync(path.dirname(resolvedPath), { recursive: true })
  return `file:${resolvedPath}`
}

function resolveConnection() {
  const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || resolveLocalDbUrl()
  const authToken = process.env.TURSO_AUTH_TOKEN || process.env.DATABASE_AUTH_TOKEN
  return authToken ? { url, authToken } : { url }
}

// Singleton pattern — reuse the same connection across hot reloads in dev
const globalForDb = globalThis as unknown as { _db: ReturnType<typeof drizzle> | undefined }

function createDb() {
  const client = createClient(resolveConnection())
  return drizzle(client, { schema })
}

export const db = globalForDb._db ?? createDb()

if (process.env.NODE_ENV !== 'production') {
  globalForDb._db = db
}
