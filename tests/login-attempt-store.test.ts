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

  // Test: No attempts initially
  assert.equal(await store.isLimited('client-a'), null)

  // Test: First attempts should be recorded but not limited until threshold
  for (let attempt = 1; attempt < MAX_FAILED_LOGIN_ATTEMPTS; attempt++) {
    const recorded = await store.recordFailure('client-a')
    assert.equal(recorded.count, attempt)
    assert.equal(recorded.lockedUntil, undefined) // Not locked yet
    
    // isLimited should return the attempt object since we're within the window
    const limited = await store.isLimited('client-a')
    assert.notEqual(limited, null)
    assert.equal(limited?.count, attempt)
  }

  // After MAX_FAILED_LOGIN_ATTEMPTS - 1, should be limited but not locked
  let limited = await store.isLimited('client-a')
  assert.notEqual(limited, null)
  assert.equal(limited?.count, MAX_FAILED_LOGIN_ATTEMPTS - 1)
  assert.equal(limited?.lockedUntil, undefined)
  
  // After MAX_FAILED_LOGIN_ATTEMPTS, should be limited and locked
  const limitedAttempt = await store.recordFailure('client-a')
  assert.equal(limitedAttempt.count, MAX_FAILED_LOGIN_ATTEMPTS)
  assert.equal(limitedAttempt.lockedUntil, now + 15 * 60 * 1000) // Should be locked
  
  const isLimitedResult = await store.isLimited('client-a')
  assert.notEqual(isLimitedResult, null)
  assert.equal(isLimitedResult?.count, MAX_FAILED_LOGIN_ATTEMPTS)
  assert.equal(isLimitedResult?.lockedUntil, now + 15 * 60 * 1000)

  // Test: After time window passes, should be reset
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
