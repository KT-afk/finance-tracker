/**
 * Verify that the configured Turso/libSQL cloud database is reachable and migrated.
 * Read-only: compares tables and columns with the latest drizzle snapshot and
 * lists which migrations the database has on record.
 *
 * Usage:
 *   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npm run db:verify-cloud
 */

import { createClient, type Client } from "@libsql/client"
import { config } from "dotenv"
import { createHash } from "crypto"
import { readFileSync } from "fs"
import path from "path"

config({ path: path.join(process.cwd(), ".env.local") })
config({ path: path.join(process.cwd(), ".env") })

const drizzleDir = path.join(process.cwd(), "drizzle")

type Journal = { entries: { idx: number; tag: string }[] }
type Snapshot = { tables: Record<string, { columns: Record<string, unknown> }> }

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(path.join(drizzleDir, file), "utf8")) as T
}

const journal = readJson<Journal>("meta/_journal.json")
const latest = journal.entries[journal.entries.length - 1]
const snapshot = readJson<Snapshot>(
  `meta/${String(latest.idx).padStart(4, "0")}_snapshot.json`
)

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

async function columnNames(client: Client, table: string) {
  const result = await client.execute(`pragma table_info(${table})`)
  return new Set(result.rows.map((row) => String(row.name)))
}

// drizzle-kit records each applied migration by the sha256 of its file
async function appliedHashes(client: Client) {
  if (!(await tableExists(client, "__drizzle_migrations"))) return null
  const result = await client.execute("select hash from __drizzle_migrations")
  return new Set(result.rows.map((row) => String(row.hash)))
}

async function countRows(client: Client, table: string) {
  const result = await client.execute(`select count(*) as count from ${table}`)
  return Number(result.rows[0]?.count ?? 0)
}

async function main() {
  const url = requiredEnv("TURSO_DATABASE_URL")
  const authToken = requiredEnv("TURSO_AUTH_TOKEN")
  const client = createClient({ url, authToken })

  console.log(`Cloud database: ${url}`)
  console.log("")

  const problems: string[] = []
  for (const [table, { columns }] of Object.entries(snapshot.tables)) {
    if (!(await tableExists(client, table))) {
      problems.push(`Missing table: ${table}`)
      continue
    }
    const live = await columnNames(client, table)
    for (const column of Object.keys(columns)) {
      if (!live.has(column)) problems.push(`Missing column: ${table}.${column}`)
    }
    console.log(`${table}: ${await countRows(client, table)} rows`)
  }

  console.log("")
  const applied = await appliedHashes(client)
  if (!applied) {
    console.log("Migrations on record: none (no __drizzle_migrations table)")
  } else {
    for (const entry of journal.entries) {
      const file = readFileSync(
        path.join(drizzleDir, `${entry.tag}.sql`),
        "utf8"
      )
      const hash = createHash("sha256").update(file).digest("hex")
      console.log(
        `${applied.has(hash) ? "applied" : "NOT applied"}: ${entry.tag}`
      )
    }
  }

  console.log("")
  if (problems.length > 0) {
    for (const problem of problems) console.log(problem)
    process.exit(1)
  }
  console.log("Cloud database is reachable and has every table and column.")
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
