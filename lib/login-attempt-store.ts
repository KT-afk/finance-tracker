import type { Client } from '@libsql/client'

export const MAX_FAILED_LOGIN_ATTEMPTS = 5
export const LOGIN_ATTEMPT_WINDOW_MS = 5 * 60 * 1000
export const ACCOUNT_LOCKOUT_DURATION_MS = 15 * 60 * 1000 // 15 minutes

export type LoginAttempt = {
  count: number
  resetAt: number
  lockedUntil?: number // Account lockout timestamp
}

export type LoginAttemptStore = {
  isLimited(key: string): Promise<LoginAttempt | null>
  recordFailure(key: string): Promise<LoginAttempt>
  clear(key: string): Promise<void>
  isLocked(key: string): Promise<boolean>
  getLockoutRemaining(key: string): Promise<number>
}

type ExecuteClient = Pick<Client, 'execute'>

function rowToAttempt(row: Record<string, unknown> | undefined): LoginAttempt | null {
  if (!row) return null
  return {
    count: Number(row.count),
    resetAt: Number(row.reset_at),
    lockedUntil: row.locked_until ? Number(row.locked_until) : undefined
  }
}

export function createPersistentLoginAttemptStore(
  client: ExecuteClient,
  now: () => number = Date.now
): LoginAttemptStore {
  let tableReady: Promise<void> | null = null

  async function ensureTable() {
    tableReady ??= (async () => {
      // Create table with original schema if it doesn't exist
      await client.execute(`
        create table if not exists login_attempts (
          client_key text primary key not null,
          count integer not null,
          reset_at integer not null
        )
      `)
      // Add locked_until column if not present (safe migration)
      try {
        await client.execute(`alter table login_attempts add column locked_until integer`)
      } catch {
        // Column already exists — ignore
      }
    })()

    return tableReady
  }

  async function clearExpired(key: string) {
    await client.execute({
      sql: 'delete from login_attempts where client_key = ? and (reset_at <= ? or (locked_until is not null and locked_until <= ?))',
      args: [key, now(), now()],
    })
  }

  async function isLimited(key: string): Promise<LoginAttempt | null> {
    await ensureTable()
    await clearExpired(key)

    const result = await client.execute({
      sql: 'select count, reset_at, locked_until from login_attempts where client_key = ?',
      args: [key],
    })
    
    const attempt = rowToAttempt(result.rows[0])
    if (!attempt) return null

    // Check if account is locked
    if (attempt.lockedUntil && now() < attempt.lockedUntil) {
      return attempt
    }

    // Check if within rate limit window
    if (now() < attempt.resetAt) {
      return attempt
    }

    // Reset if window expired and not locked
    await clear(key)
    return null
  }

  async function recordFailure(key: string): Promise<LoginAttempt> {
    await ensureTable()
    const currentTime = now()

    // Clear expired entries first
    await clearExpired(key)

    // Get current attempt
    const existing = await client.execute({
      sql: 'select count, reset_at, locked_until from login_attempts where client_key = ?',
      args: [key],
    })

    const current = rowToAttempt(existing.rows[0])
    
    let newCount = 1
    let resetAt = currentTime + LOGIN_ATTEMPT_WINDOW_MS
    let lockedUntil: number | undefined

    if (current) {
      // If account is currently locked, extend lockout
      if (current.lockedUntil && currentTime < current.lockedUntil) {
        lockedUntil = currentTime + ACCOUNT_LOCKOUT_DURATION_MS
        newCount = current.count
        resetAt = current.resetAt
      } else if (currentTime < current.resetAt) {
        // Within window, increment count
        newCount = current.count + 1
        if (newCount >= MAX_FAILED_LOGIN_ATTEMPTS) {
          // Lock account
          lockedUntil = currentTime + ACCOUNT_LOCKOUT_DURATION_MS
        }
      } else {
        // Window expired, start fresh
        newCount = 1
        resetAt = currentTime + LOGIN_ATTEMPT_WINDOW_MS
      }
    }

    // Update or insert record
    await client.execute({
      sql: `
        insert into login_attempts (client_key, count, reset_at, locked_until)
        values (?, ?, ?, ?)
        on conflict(client_key) do update set
          count = excluded.count,
          reset_at = excluded.reset_at,
          locked_until = excluded.locked_until
      `,
      args: [key, newCount, resetAt, lockedUntil ?? null],
    })

    return { count: newCount, resetAt, lockedUntil }
  }

  async function clear(key: string): Promise<void> {
    await ensureTable()
    await client.execute({
      sql: 'delete from login_attempts where client_key = ?',
      args: [key],
    })
  }

  async function isLocked(key: string): Promise<boolean> {
    await ensureTable()
    await clearExpired(key)

    const result = await client.execute({
      sql: 'select locked_until from login_attempts where client_key = ?',
      args: [key],
    })

    const lockedUntil = result.rows[0]?.locked_until as number | undefined
    return lockedUntil ? now() < lockedUntil : false
  }

  async function getLockoutRemaining(key: string): Promise<number> {
    await ensureTable()
    await clearExpired(key)

    const result = await client.execute({
      sql: 'select locked_until from login_attempts where client_key = ?',
      args: [key],
    })

    const lockedUntil = result.rows[0]?.locked_until as number | undefined
    if (!lockedUntil) return 0

    const remaining = lockedUntil - now()
    return Math.max(0, remaining)
  }

  return {
    isLimited,
    recordFailure,
    clear,
    isLocked,
    getLockoutRemaining,
  }
}

