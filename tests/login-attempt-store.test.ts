import { createClient } from '@libsql/client'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  createPersistentLoginAttemptStore,
  MAX_FAILED_LOGIN_ATTEMPTS,
} from '../lib/login-attempt-store'

async function main() {
  let now = 1_800_000_000_000
  const dbDir = mkdtempSync(path.join(tmpdir(), 'finance-login-attempts-'))
  const client = createClient({ url: `file:${path.join(dbDir, 'attempts.db')}` })
  const store = createPersistentLoginAttemptStore(client, () => now)

  for (let attempt = 1; attempt < MAX_FAILED_LOGIN_ATTEMPTS; attempt++) {
    assert.equal(await store.isLimited('client-a'), null)
    const recorded = await store.recordFailure('client-a')
    assert.equal(recorded.count, attempt)
  }

  assert.equal(await store.isLimited('client-a'), null)
  const limitedAttempt = await store.recordFailure('client-a')
  assert.equal(limitedAttempt.count, MAX_FAILED_LOGIN_ATTEMPTS)
  assert.equal((await store.isLimited('client-a'))?.count, MAX_FAILED_LOGIN_ATTEMPTS)

  now += 5 * 60 * 1000 + 1
  assert.equal(await store.isLimited('client-a'), null)

  const resetAttempt = await store.recordFailure('client-a')
  assert.equal(resetAttempt.count, 1)

  await store.clear('client-a')
  assert.equal(await store.isLimited('client-a'), null)

  console.log('login attempt store test passed')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
