import { createClient } from '@libsql/client'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const fixturePath = process.env.UOB_MAY_PDF

async function createSchema(dbPath: string) {
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

  return client
}

async function main() {
  if (!fixturePath || !existsSync(fixturePath)) {
    console.log('UOB upload confirm flow test skipped: set UOB_MAY_PDF to a real UOB May PDF')
    return
  }

  const dbDir = mkdtempSync(path.join(tmpdir(), 'finance-uob-upload-confirm-'))
  const dbPath = path.join(dbDir, 'finance.db')

  process.env.FINANCE_DB_PATH = dbPath
  process.env.PDFTOTEXT_BIN = '/definitely/missing'
  delete process.env.TURSO_DATABASE_URL
  delete process.env.DATABASE_URL
  delete process.env.TURSO_AUTH_TOKEN
  delete process.env.DATABASE_AUTH_TOKEN
  delete process.env.ANTHROPIC_API_KEY

  const client = await createSchema(dbPath)

  const { parseFile } = await import('../lib/parsers')
  const parsed = await parseFile(readFileSync(fixturePath), path.basename(fixturePath), 'uob')

  assert.equal(parsed.length, 45)
  assert.equal(parsed.filter(t => t.date.startsWith('2026-05')).length, 33)

  const now = new Date().toISOString()
  for (const tx of parsed) {
    await client.execute({
      sql: 'insert or ignore into category_rules (id, keyword, category, created_at) values (?, ?, ?, ?)',
      args: [`rule:${tx.description}`, tx.description.toLowerCase(), 'Others', now],
    })
  }

  const [{ POST: previewUpload }, { POST: confirmUpload }, { GET: getTransactions }] = await Promise.all([
    import('../app/api/upload/route'),
    import('../app/api/upload/confirm/route'),
    import('../app/api/transactions/route'),
  ])

  const formData = new FormData()
  formData.set('bank', 'uob')
  formData.set('file', new File([readFileSync(fixturePath)], path.basename(fixturePath), { type: 'application/pdf' }))

  const previewRes = await previewUpload(new Request('http://localhost/api/upload', {
    method: 'POST',
    body: formData,
  }) as never)
  const previewBody = await previewRes.json()

  assert.equal(previewRes.status, 200)
  assert.deepEqual(previewBody.preview, {
    total: 45,
    newCount: 45,
    skippedCount: 0,
    dateFrom: '2026-04-24',
    dateTo: '2026-05-27',
    bank: 'uob',
  })

  const confirmRes = await confirmUpload(new Request('http://localhost/api/upload/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactions: previewBody.transactions }),
  }) as never)
  const confirmBody = await confirmRes.json()

  assert.equal(confirmRes.status, 200)
  assert.deepEqual(confirmBody, { inserted: 45, skipped: 0 })

  const mayRes = await getTransactions(new Request(
    'http://localhost/api/transactions?bank=uob&month=2026-05&page=1&pageSize=100'
  ) as never)
  const mayBody = await mayRes.json()

  assert.equal(mayRes.status, 200)
  assert.equal(mayBody.total, 33)
  assert.equal(mayBody.transactions[0].date, '2026-05-27')
  assert.ok(
    mayBody.transactions.some((tx: { description: string }) => tx.description.includes('CLAUDE.AI SUBSCRIPTION')),
    'expected May UOB transactions to be queryable after confirm'
  )

  const allRes = await getTransactions(new Request(
    'http://localhost/api/transactions?bank=uob&page=1&pageSize=10'
  ) as never)
  const allBody = await allRes.json()

  assert.equal(allRes.status, 200)
  assert.equal(allBody.total, 45)
  assert.equal(allBody.transactions[0].date, '2026-05-27')

  console.log('UOB upload confirm flow test passed')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
