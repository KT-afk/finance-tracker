import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import path from 'path'
import * as schema from './schema'

const DB_PATH = path.join(process.cwd(), 'finance.db')

// Singleton pattern — reuse the same connection across hot reloads in dev
const globalForDb = globalThis as unknown as { _db: ReturnType<typeof drizzle> | undefined }

function createDb() {
  const sqlite = new Database(DB_PATH)
  // WAL mode for better concurrent read performance and crash safety
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  return drizzle(sqlite, { schema })
}

export const db = globalForDb._db ?? createDb()

if (process.env.NODE_ENV !== 'production') {
  globalForDb._db = db
}
