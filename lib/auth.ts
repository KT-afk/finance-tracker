export const AUTH_COOKIE_NAME = 'finance_tracker_session'
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

export function getAppPassword(): string | null {
  const password = process.env.APP_PASSWORD?.trim()
  return password ? password : null
}

export function isHostedDeployment(): boolean {
  return Boolean(
    process.env.VERCEL ||
    process.env.VERCEL_URL ||
    process.env.RENDER ||
    process.env.FLY_APP_NAME ||
    process.env.FINANCE_TRACKER_URL?.startsWith('https://')
  )
}

export function requiresAppPassword(): boolean {
  return (
    isHostedDeployment() ||
    process.env.ENABLE_TAILSCALE_ACCESS === '1' ||
    Boolean(process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL)
  )
}

export function useSecureCookies(): boolean {
  return isHostedDeployment()
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

async function sign(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  return base64UrlEncode(new Uint8Array(signature))
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false

  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

async function sha256Base64Url(value: string): Promise<string> {
  const encoder = new TextEncoder()
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return base64UrlEncode(new Uint8Array(digest))
}

export async function verifyAppPassword(
  candidate: string,
  configuredPassword: string
): Promise<boolean> {
  const [candidateHash, configuredHash] = await Promise.all([
    sha256Base64Url(candidate),
    sha256Base64Url(configuredPassword),
  ])

  return constantTimeEqual(candidateHash, configuredHash)
}

export async function createSessionToken(secret: string): Promise<string> {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS
  const payload = String(expiresAt)
  return `${payload}.${await sign(payload, secret)}`
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string
): Promise<boolean> {
  if (!token) return false

  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra) return false

  const expiresAt = Number(payload)
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
    return false
  }

  const expectedSignature = await sign(payload, secret)
  return constantTimeEqual(signature, expectedSignature)
}
