import { NextRequest, NextResponse } from 'next/server'
import {
  AUTH_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  getAppPassword,
  isHostedDeployment,
  useSecureCookies,
  verifyAppPassword,
} from '@/lib/auth'
import { createPersistentLoginAttemptStore, type LoginAttempt } from '@/lib/login-attempt-store'
import { createClient } from '@libsql/client'

const MAX_FAILED_ATTEMPTS = 5
const LOGIN_WINDOW_MS = 5 * 60 * 1000

const globalForLogin = globalThis as unknown as {
  _financeTrackerLoginAttempts?: Map<string, LoginAttempt>
  _financeTrackerPersistentLoginStore?: ReturnType<typeof createPersistentLoginAttemptStore>
}

const loginAttempts = globalForLogin._financeTrackerLoginAttempts ?? new Map<string, LoginAttempt>()
globalForLogin._financeTrackerLoginAttempts = loginAttempts

function getPersistentLoginStore() {
  if (!process.env.TURSO_DATABASE_URL && !process.env.DATABASE_URL) return null

  if (!globalForLogin._financeTrackerPersistentLoginStore) {
    const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL
    const authToken = process.env.TURSO_AUTH_TOKEN || process.env.DATABASE_AUTH_TOKEN
    const client = createClient(authToken ? { url: url!, authToken } : { url: url! })
    globalForLogin._financeTrackerPersistentLoginStore = createPersistentLoginAttemptStore(client)
  }

  return globalForLogin._financeTrackerPersistentLoginStore
}

function getClientKey(req: NextRequest): string {
  if (isHostedDeployment()) {
    const forwardedFor = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    return forwardedFor || req.headers.get('x-real-ip') || 'hosted'
  }

  if (process.env.NODE_ENV !== 'production' || process.env.AUTH_TEST_CLIENT_KEYS === '1') {
    const testClientKey = req.headers.get('x-finance-tracker-test-client')?.trim()
    if (testClientKey) return `test:${testClientKey}`
  }

  return 'direct'
}

function getActiveAttempt(key: string): LoginAttempt | null {
  const attempt = loginAttempts.get(key)
  if (!attempt) return null

  if (attempt.resetAt <= Date.now()) {
    loginAttempts.delete(key)
    return null
  }

  return attempt
}

function recordFailedAttempt(key: string): LoginAttempt {
  const existing = getActiveAttempt(key)
  const attempt = existing
    ? { count: existing.count + 1, resetAt: existing.resetAt }
    : { count: 1, resetAt: Date.now() + LOGIN_WINDOW_MS }

  loginAttempts.set(key, attempt)
  return attempt
}

function secondsUntilReset(attempt: LoginAttempt): number {
  return Math.max(1, Math.ceil((attempt.resetAt - Date.now()) / 1000))
}

export async function POST(req: NextRequest) {
  const configuredPassword = getAppPassword()
  if (!configuredPassword) {
    return NextResponse.json({ error: 'Password login is not configured' }, { status: 400 })
  }

  const clientKey = getClientKey(req)
  const persistentStore = isHostedDeployment() ? getPersistentLoginStore() : null
  const activeAttempt = persistentStore
    ? await persistentStore.isLimited(clientKey)
    : getActiveAttempt(clientKey)

  if (activeAttempt && activeAttempt.count >= MAX_FAILED_ATTEMPTS) {
    const retryAfter = secondsUntilReset(activeAttempt)
    return NextResponse.json(
      { error: 'Too many login attempts. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    )
  }

  const body = await req.json().catch(() => null)
  const password = typeof body?.password === 'string' ? body.password : ''

  if (!(await verifyAppPassword(password, configuredPassword))) {
    const failedAttempt = persistentStore
      ? await persistentStore.recordFailure(clientKey)
      : recordFailedAttempt(clientKey)
    const retryAfter = secondsUntilReset(failedAttempt)
    const status = failedAttempt.count >= MAX_FAILED_ATTEMPTS ? 429 : 401

    if (status === 429) {
      return NextResponse.json(
        { error: 'Too many login attempts. Try again later.' },
        { status, headers: { 'Retry-After': String(retryAfter) } }
      )
    }

    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  if (persistentStore) {
    await persistentStore.clear(clientKey)
  } else {
    loginAttempts.delete(clientKey)
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: await createSessionToken('user', configuredPassword),
    httpOnly: true,
    secure: useSecureCookies(),
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
  return res
}
