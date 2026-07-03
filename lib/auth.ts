export const AUTH_COOKIE_NAME = 'finance_tracker_session'
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30
export const TOKEN_REFRESH_THRESHOLD_SECONDS = 60 * 60 * 24 * 7 // Refresh if expiring within 7 days

// Session store for tracking active sessions
const sessionStore = new Map<string, { 
  createdAt: number; 
  lastAccessed: number; 
  userAgent?: string;
  ip?: string;
}>()

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

/**
 * Creates a secure session token with proper claims
 */
export async function createSessionToken(
  userId: string = 'user',
  secret: string,
  options?: {
    userAgent?: string;
    ip?: string;
  }
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const sessionId = crypto.randomUUID()
  
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  }

  const payload = {
    sub: userId,
    sid: sessionId,
    iat: now,
    exp: now + SESSION_MAX_AGE_SECONDS,
    iss: 'finance-tracker',
    aud: 'finance-tracker'
  }

  // Store session metadata
  sessionStore.set(sessionId, {
    createdAt: now * 1000,
    lastAccessed: now * 1000,
    userAgent: options?.userAgent,
    ip: options?.ip
  })

  const encodedHeader = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)))
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)))
  const signaturePayload = `${encodedHeader}.${encodedPayload}`
  const signature = await sign(signaturePayload, secret)

  return `${signaturePayload}.${signature}`
}

/**
 * Validates and decodes a session token
 */
export async function validateSessionToken(
  token: string,
  secret: string,
  options?: {
    userAgent?: string;
    ip?: string;
  }
): Promise<{ valid: boolean; payload?: any; error?: string }> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) {
      return { valid: false, error: 'Invalid token format' }
    }

    const [encodedHeader, encodedPayload, signature] = parts
    
    // Verify signature
    const signaturePayload = `${encodedHeader}.${encodedPayload}`
    const expectedSignature = await sign(signaturePayload, secret)
    
    if (!constantTimeEqual(signature, expectedSignature)) {
      return { valid: false, error: 'Invalid token signature' }
    }

    // Decode payload
    const payload = JSON.parse(atob(encodedPayload))
    
    // Check expiration
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp && now > payload.exp) {
      // Clean up expired session
      if (payload.sid) {
        sessionStore.delete(payload.sid)
      }
      return { valid: false, error: 'Token expired' }
    }

    // Check session exists and update last accessed
    if (payload.sid) {
      const session = sessionStore.get(payload.sid)
      if (!session) {
        return { valid: false, error: 'Session not found' }
      }

      // Optional: Check user agent and IP for session hijacking
      if (options?.userAgent && session.userAgent && options.userAgent !== session.userAgent) {
        return { valid: false, error: 'Session security violation' }
      }

      // Update last accessed time
      session.lastAccessed = now * 1000
    }

    return { valid: true, payload }
  } catch (error) {
    return { valid: false, error: 'Token validation failed' }
  }
}

/**
 * Revokes a session token
 */
export function revokeSession(sessionId: string): void {
  sessionStore.delete(sessionId)
}

/**
 * Cleans up expired sessions
 */
export function cleanupExpiredSessions(): void {
  const now = Date.now()
  const expiryTime = SESSION_MAX_AGE_SECONDS * 1000

  for (const [sessionId, session] of sessionStore.entries()) {
    if (now - session.createdAt > expiryTime) {
      sessionStore.delete(sessionId)
    }
  }
}

/**
 * Gets active session count
 */
export function getActiveSessionCount(): number {
  cleanupExpiredSessions()
  return sessionStore.size
}

/**
 * Checks if token should be refreshed
 */
export function shouldRefreshToken(payload: any): boolean {
  if (!payload.exp) return false
  
  const now = Math.floor(Date.now() / 1000)
  const timeUntilExpiry = payload.exp - now
  
  return timeUntilExpiry < TOKEN_REFRESH_THRESHOLD_SECONDS
}

/**
 * Backward-compatible wrapper used by proxy.ts middleware
 */
export async function verifySessionToken(
  token: string | undefined,
  secret: string
): Promise<boolean> {
  if (!token) return false
  const result = await validateSessionToken(token, secret)
  return result.valid
}
