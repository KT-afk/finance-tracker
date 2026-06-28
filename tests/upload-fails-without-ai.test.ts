import { createClient } from '@libsql/client'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

async function main() {
  const dbDir = mkdtempSync(path.join(tmpdir(), 'finance-upload-ai-'))
  const dbPath = path.join(dbDir, 'finance.db')
  process.env.FINANCE_DB_PATH = dbPath
  delete process.env.TURSO_DATABASE_URL
  delete process.env.DATABASE_URL
  delete process.env.TURSO_AUTH_TOKEN
  delete process.env.DATABASE_AUTH_TOKEN
  delete process.env.ANTHROPIC_API_KEY

  const client = createClient({ url: `file:${dbPath}` })
  await client.execute(`
    CREATE TABLE transactions (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      bank TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Others',
      is_corrected INTEGER NOT NULL DEFAULT 0,
      hash TEXT NOT NULL UNIQUE,
      uploaded_at TEXT NOT NULL
    )
  `)
  await client.execute(`
    CREATE TABLE category_rules (
      id TEXT PRIMARY KEY,
      keyword TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `)

  const { POST } = await import('../app/api/upload/route')
  const csv = [
    'Transaction date,Value date,Description,Withdrawals(SGD),Deposits(SGD)',
    '01/06/2026,01/06/2026,NETS QR PURCHASE PU TIAN,12.30,',
  ].join('\n')
  const formData = new FormData()
  formData.set('bank', 'ocbc')
  formData.set('file', new File([csv], 'ocbc.csv', { type: 'text/csv' }))

  const res = await POST(new Request('http://localhost/api/upload', {
    method: 'POST',
    body: formData,
  }) as never)
  const body = await res.json()

  assert.equal(res.status, 500)
  assert.match(body.error, /ANTHROPIC_API_KEY is not configured/)

  console.log('upload fails without AI test passed')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
