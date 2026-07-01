/**
 * Seed deterministic local demo data for UI and E2E development.
 *
 * By default this refuses to run against remote/libSQL URLs. To seed a remote
 * database deliberately, set ALLOW_REMOTE_DEMO_SEED=1.
 */

import { createClient, type Client } from '@libsql/client'
import { config } from 'dotenv'
import path from 'path'

config({ path: path.join(process.cwd(), '.env.local'), quiet: true })
config({ path: path.join(process.cwd(), '.env'), quiet: true })

const DEMO_UPLOADED_AT = '2026-06-30T12:00:00.000Z'
const DEMO_RECORDED_AT = '2026-06-30T12:00:00.000Z'

type DemoTransaction = {
  id: string
  date: string
  description: string
  amount: number
  bank: 'ocbc' | 'dbs' | 'uob' | 'trust'
  category: string
}

const transactions: DemoTransaction[] = [
  { id: 'jan-uob-food', date: '2026-01-05', description: 'Demo UOB lunch at Tanjong Pagar', amount: -120.00, bank: 'uob', category: 'Food & Drink' },
  { id: 'jan-dbs-shop', date: '2026-01-12', description: 'Demo DBS household shopping', amount: -40.00, bank: 'dbs', category: 'Shopping' },
  { id: 'jan-income', date: '2026-01-25', description: 'Demo salary credit', amount: 5200.00, bank: 'ocbc', category: 'Income' },

  { id: 'feb-uob-food', date: '2026-02-05', description: 'Demo UOB dinner at Orchard', amount: -130.00, bank: 'uob', category: 'Food & Drink' },
  { id: 'feb-ocbc-transport', date: '2026-02-11', description: 'Demo MRT and ride hailing', amount: -55.00, bank: 'ocbc', category: 'Transport' },
  { id: 'feb-trust-health', date: '2026-02-19', description: 'Demo clinic visit', amount: -86.40, bank: 'trust', category: 'Health' },

  { id: 'mar-uob-groceries', date: '2026-03-09', description: 'Demo UOB FairPrice groceries', amount: -210.00, bank: 'uob', category: 'Groceries' },
  { id: 'mar-trust-subscription', date: '2026-03-13', description: 'Demo streaming subscription', amount: -30.00, bank: 'trust', category: 'Subscriptions' },
  { id: 'mar-dbs-entertainment', date: '2026-03-21', description: 'Demo cinema night', amount: -48.00, bank: 'dbs', category: 'Entertainment' },

  { id: 'apr-uob-bills', date: '2026-04-02', description: 'Demo UOB utilities bill', amount: -340.00, bank: 'uob', category: 'Bills & Utilities' },
  { id: 'apr-dbs-health', date: '2026-04-18', description: 'Demo pharmacy purchase', amount: -75.00, bank: 'dbs', category: 'Health' },
  { id: 'apr-ocbc-transfer', date: '2026-04-22', description: 'Demo family transfer', amount: -200.00, bank: 'ocbc', category: 'Transfer' },

  { id: 'may-uob-food', date: '2026-05-03', description: 'Demo May UOB dinner', amount: -88.25, bank: 'uob', category: 'Food & Drink' },
  { id: 'may-uob-groceries', date: '2026-05-06', description: 'Demo May UOB groceries', amount: -142.10, bank: 'uob', category: 'Groceries' },
  { id: 'may-uob-subscription', date: '2026-05-10', description: 'Demo May UOB subscription', amount: -32.90, bank: 'uob', category: 'Subscriptions' },
  { id: 'may-uob-shopping', date: '2026-05-14', description: 'Demo May UOB shopping', amount: -250.00, bank: 'uob', category: 'Shopping' },
  { id: 'may-uob-income', date: '2026-05-20', description: 'Demo May UOB cashback credit', amount: 50.00, bank: 'uob', category: 'Income' },
  { id: 'may-dbs-entertainment', date: '2026-05-21', description: 'Demo May DBS concert tickets', amount: -66.66, bank: 'dbs', category: 'Entertainment' },

  { id: 'jun-uob-food', date: '2026-06-02', description: 'Demo Jun UOB coffee and lunch', amount: -76.50, bank: 'uob', category: 'Food & Drink' },
  { id: 'jun-uob-groceries', date: '2026-06-05', description: 'Demo Jun UOB groceries', amount: -110.00, bank: 'uob', category: 'Groceries' },
  { id: 'jun-uob-bills', date: '2026-06-07', description: 'Demo Jun UOB annual insurance bill', amount: -999.99, bank: 'uob', category: 'Bills & Utilities' },
  { id: 'jun-uob-transport', date: '2026-06-08', description: 'Demo Jun UOB transport', amount: -12.34, bank: 'uob', category: 'Transport' },
  { id: 'jun-uob-income', date: '2026-06-15', description: 'Demo Jun UOB refund credit', amount: 120.00, bank: 'uob', category: 'Income' },
  { id: 'jun-dbs-personal', date: '2026-06-20', description: 'Demo Jun DBS personal care', amount: -44.44, bank: 'dbs', category: 'Personal' },
  { id: 'jun-ocbc-bills', date: '2026-06-22', description: 'Demo Jun OCBC phone bill', amount: -61.75, bank: 'ocbc', category: 'Bills & Utilities' },
]

const balances = [
  { bank: 'ocbc', balance: 8234.12 },
  { bank: 'dbs', balance: 4231.80 },
  { bank: 'uob', balance: 6150.55 },
  { bank: 'trust', balance: 980.00 },
]

const categoryRules = [
  { keyword: 'fairprice', category: 'Groceries' },
  { keyword: 'streaming subscription', category: 'Subscriptions' },
  { keyword: 'mrt', category: 'Transport' },
  { keyword: 'utilities', category: 'Bills & Utilities' },
]

function expandPath(value: string) {
  return value.startsWith('~/')
    ? path.join(process.env.HOME ?? process.cwd(), value.slice(2))
    : value
}

function resolveConnection() {
  const remoteUrl = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL
  const authToken = process.env.TURSO_AUTH_TOKEN || process.env.DATABASE_AUTH_TOKEN

  if (remoteUrl) {
    if (process.env.ALLOW_REMOTE_DEMO_SEED !== '1') {
      throw new Error('Refusing to seed a remote database. Set ALLOW_REMOTE_DEMO_SEED=1 if this is intentional.')
    }
    return authToken ? { url: remoteUrl, authToken } : { url: remoteUrl }
  }

  const configuredPath = process.env.FINANCE_DB_PATH || './finance.db'
  return { url: `file:${path.resolve(expandPath(configuredPath))}` }
}

async function ensureTable(client: Client, table: string) {
  const result = await client.execute({
    sql: "select name from sqlite_master where type = 'table' and name = ?",
    args: [table],
  })
  if (result.rows.length === 0) {
    throw new Error(`Missing table ${table}. Run npm run db:setup-demo, or run npx drizzle-kit migrate first.`)
  }
}

async function main() {
  const connection = resolveConnection()
  const client = createClient(connection)

  await ensureTable(client, 'transactions')
  await ensureTable(client, 'category_rules')
  await ensureTable(client, 'balance_history')

  await client.execute("delete from transactions where hash like 'demo:%'")
  await client.execute("delete from category_rules where id like 'demo:%'")
  await client.execute({
    sql: 'delete from balance_history where recorded_at = ?',
    args: [DEMO_RECORDED_AT],
  })

  for (const t of transactions) {
    await client.execute({
      sql: `
        insert into transactions (
          id, date, description, amount, bank, category, is_corrected, hash, uploaded_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        `demo:${t.id}`,
        t.date,
        t.description,
        t.amount,
        t.bank,
        t.category,
        0,
        `demo:${t.id}`,
        DEMO_UPLOADED_AT,
      ],
    })
  }

  for (const rule of categoryRules) {
    await client.execute({
      sql: 'insert into category_rules (id, keyword, category, created_at) values (?, ?, ?, ?)',
      args: [`demo:${rule.keyword}`, rule.keyword, rule.category, DEMO_UPLOADED_AT],
    })
  }

  for (const balance of balances) {
    await client.execute({
      sql: 'insert into balance_history (bank, balance, recorded_at) values (?, ?, ?)',
      args: [balance.bank, balance.balance, DEMO_RECORDED_AT],
    })
  }

  console.log(`Seeded ${transactions.length} demo transactions.`)
  console.log(`Seeded ${balances.length} demo balances.`)
  console.log(`Database: ${connection.url}`)
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
