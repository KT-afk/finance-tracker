import type { Client } from '@libsql/client'

export const MAX_FAILED_LOGIN_ATTEMPTS = 5
export const LOGIN_ATTEMPT_WINDOW_MS = 5 * 60 * 1000

export type LoginAttempt = {
  count: number
  resetAt: number
}

export type LoginAttemptStore = {
  isLimited(key: string): Promise<LoginAttempt | null>
  recordFailure(key: string): Promise<LoginAttempt>
  clear(key: string): Promise<void>
}

type ExecuteClient = Pick<Client, 'execute'>

function rowToAttempt(row: Record<string, unknown> | undefined): LoginAttempt | null {
  if (!row) return null
  return {
    count: Number(row.count),
    resetAt: Number(row.reset_at),
  }
}

export function createPersistentLoginAttemptStore(
  client: ExecuteClient,
  now: () => number = Date.now
): LoginAttemptStore {
  let tableReady: Promise<void> | null = null

  async function ensureTable() {
    tableReady ??= client.execute(`
      create table if not exists login_attempts (
        client_key text primary key not null,
        count integer not null,
        reset_at integer not null
      )
    `).then(() => undefined)

    return tableReady
  }

  async function clearExpired(key: string) {
    await client.execute({
      sql: 'delete from login_attempts where client_key = ? and reset_at <= ?',
      args: [key, now()],
    })
  }

  async function getActiveAttempt(key: string) {
    await ensureTable()
    await clearExpired(key)

    const result = await client.execute({
      sql: 'select count, reset_at from login_attempts where client_key = ?',
      args: [key],
    })

    return rowToAttempt(result.rows[0] as Record<string, unknown> | undefined)
  }

  return {
    async isLimited(key: string) {
      const attempt = await getActiveAttempt(key)
      return attempt && attempt.count >= MAX_FAILED_LOGIN_ATTEMPTS ? attempt : null
    },

    async recordFailure(key: string) {
      await ensureTable()
      await clearExpired(key)

      const resetAt = now() + LOGIN_ATTEMPT_WINDOW_MS
      await client.execute({
        sql: `
          insert into login_attempts (client_key, count, reset_at)
          values (?, 1, ?)
          on conflict(client_key) do update set
            count = count + 1,
            reset_at = login_attempts.reset_at
        `,
        args: [key, resetAt],
      })

      const result = await client.execute({
        sql: 'select count, reset_at from login_attempts where client_key = ?',
        args: [key],
      })

      const attempt = rowToAttempt(result.rows[0] as Record<string, unknown> | undefined)
      if (!attempt) throw new Error('Failed to record login attempt')
      return attempt
    },

    async clear(key: string) {
      await ensureTable()
      await client.execute({
        sql: 'delete from login_attempts where client_key = ?',
        args: [key],
      })
    },
  }
}
