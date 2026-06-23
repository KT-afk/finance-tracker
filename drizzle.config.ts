import type { Config } from 'drizzle-kit'
import path from 'path'

function expandPath(value: string) {
  return value.startsWith('~/')
    ? path.join(process.env.HOME ?? process.cwd(), value.slice(2))
    : value
}

function resolveDbPath() {
  const configuredPath = process.env.FINANCE_DB_PATH
  if (!configuredPath) return './finance.db'

  return path.resolve(expandPath(configuredPath))
}

export default {
  schema: './lib/schema.ts',
  out: './drizzle',
  dialect: process.env.TURSO_DATABASE_URL ? 'turso' : 'sqlite',
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL ?? resolveDbPath(),
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
} satisfies Config
