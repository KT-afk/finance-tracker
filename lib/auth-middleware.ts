import { NextRequest } from 'next/server'
import { getAppPassword, AUTH_COOKIE_NAME, useSecureCookies } from './auth'

export interface AuthResult {
  authenticated: boolean
  error?: string
  status?: number
}

/**
 * Validates authentication for API requests
 * Returns authenticated status and error details if authentication fails
 */
export async function validateAuth(req: NextRequest): Promise<AuthResult> {
  const appPassword = getAppPassword()
  
  // If no app password is configured, no authentication required
  if (!appPassword) {
    return { authenticated: true }
  }

  // Get session token from cookies
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value

  if (!token) {
    return {
      authenticated: false,
      error: 'Authentication required',
      status: 401
    }
  }

  try {
    // Verify token format and validity
    const parts = token.split('.')
    if (parts.length !== 3) {
      return {
        authenticated: false,
        error: 'Invalid token format',
        status: 401
      }
    }

    // Decode payload (basic validation - in production, verify signature)
    const payload = JSON.parse(atob(parts[1]))
    
    // Check expiration
    if (payload.exp && Date.now() > payload.exp * 1000) {
      return {
        authenticated: false,
        error: 'Token expired',
        status: 401
      }
    }

    return { authenticated: true }
  } catch (error) {
    return {
      authenticated: false,
      error: 'Invalid authentication token',
      status: 401
    }
  }
}

/**
 * Middleware function to protect API routes
 * Returns error response if not authenticated, null if authenticated
 */
export async function requireAuth(req: NextRequest): Promise<Response | null> {
  const auth = await validateAuth(req)
  
  if (!auth.authenticated) {
    return new Response(
      JSON.stringify({ error: auth.error || 'Authentication failed' }),
      {
        status: auth.status || 401,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
  
  return null // Authentication passed
}

/**
 * Rate limiting store for API endpoints
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

export interface RateLimitOptions {
  windowMs: number
  maxRequests: number
  keyGenerator?: (req: NextRequest) => string
}

/**
 * Rate limiting middleware
 * Returns error response if rate limit exceeded, null if within limits
 */
export function createRateLimit(options: RateLimitOptions) {
  return async function rateLimit(req: NextRequest): Promise<Response | null> {
    const key = options.keyGenerator 
      ? options.keyGenerator(req)
      : getClientIdentifier(req)
    
    const now = Date.now()
    const windowStart = now - options.windowMs
    
    // Clean up expired entries
    for (const [k, v] of rateLimitStore.entries()) {
      if (v.resetTime < now) {
        rateLimitStore.delete(k)
      }
    }
    
    // Get or create rate limit entry
    let entry = rateLimitStore.get(key)
    if (!entry || entry.resetTime < now) {
      entry = { count: 0, resetTime: now + options.windowMs }
      rateLimitStore.set(key, entry)
    }
    
    entry.count++
    
    if (entry.count > options.maxRequests) {
      return new Response(
        JSON.stringify({ 
          error: 'Too many requests',
          retryAfter: Math.ceil((entry.resetTime - now) / 1000)
        }),
        {
          status: 429,
          headers: { 
            'Content-Type': 'application/json',
            'Retry-After': Math.ceil((entry.resetTime - now) / 1000).toString()
          }
        }
      )
    }
    
    return null // Within rate limits
  }
}

/**
 * Extracts client identifier for rate limiting
 */
function getClientIdentifier(req: NextRequest): string {
  // Try to get IP from various headers
  const forwarded = req.headers.get('x-forwarded-for')
  const realIp = req.headers.get('x-real-ip')
  const ip = forwarded?.split(',')[0] || realIp || 'unknown'
  
  return `rate_limit:${ip}`
}

/**
 * Input validation schema for common data types
 */
export interface ValidationSchema {
  [key: string]: {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object'
    required?: boolean
    min?: number
    max?: number
    pattern?: RegExp
    enum?: string[]
  }
}

/**
 * Validates request body against schema
 */
export function validateBody(body: any, schema: ValidationSchema): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  for (const [field, rules] of Object.entries(schema)) {
    const value = body[field]
    
    // Check required fields
    if (rules.required && (value === undefined || value === null)) {
      errors.push(`${field} is required`)
      continue
    }
    
    // Skip validation if field is not provided and not required
    if (value === undefined || value === null) {
      continue
    }
    
    // Type validation
    switch (rules.type) {
      case 'string':
        if (typeof value !== 'string') {
          errors.push(`${field} must be a string`)
        } else {
          if (rules.min && value.length < rules.min) {
            errors.push(`${field} must be at least ${rules.min} characters`)
          }
          if (rules.max && value.length > rules.max) {
            errors.push(`${field} must not exceed ${rules.max} characters`)
          }
          if (rules.pattern && !rules.pattern.test(value)) {
            errors.push(`${field} format is invalid`)
          }
          if (rules.enum && !rules.enum.includes(value)) {
            errors.push(`${field} must be one of: ${rules.enum.join(', ')}`)
          }
        }
        break
        
      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          errors.push(`${field} must be a valid number`)
        } else {
          if (rules.min !== undefined && value < rules.min) {
            errors.push(`${field} must be at least ${rules.min}`)
          }
          if (rules.max !== undefined && value > rules.max) {
            errors.push(`${field} must not exceed ${rules.max}`)
          }
        }
        break
        
      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push(`${field} must be a boolean`)
        }
        break
        
      case 'array':
        if (!Array.isArray(value)) {
          errors.push(`${field} must be an array`)
        } else if (rules.min && value.length < rules.min) {
          errors.push(`${field} must have at least ${rules.min} items`)
        } else if (rules.max && value.length > rules.max) {
          errors.push(`${field} must not exceed ${rules.max} items`)
        }
        break
        
      case 'object':
        if (typeof value !== 'object' || Array.isArray(value)) {
          errors.push(`${field} must be an object`)
        }
        break
    }
  }
  
  return { valid: errors.length === 0, errors }
}
