import { describe, it, expect, beforeEach, vi } from 'vitest'
import { validateAuth, createRateLimit, validateBody, ValidationSchema } from '../lib/auth-middleware'

// Mock NextRequest
class MockNextRequest {
  private headers: Map<string, string>
  private cookies: Map<string, string>

  constructor(options: { headers?: Record<string, string>; cookies?: Record<string, string> } = {}) {
    this.headers = new Map(Object.entries(options.headers || {}))
    this.cookies = new Map(Object.entries(options.cookies || {}))
  }

  get headers() {
    return {
      get: (name: string) => this.headers.get(name) || null
    }
  }

  get cookies() {
    return {
      get: (name: string) => this.cookies.get(name) || null
    }
  }
}

describe('Authentication Middleware', () => {
  beforeEach(() => {
    // Clear any existing rate limit store
    vi.clearAllMocks()
  })

  describe('validateAuth', () => {
    it('should allow requests when no app password is configured', async () => {
      const req = new MockNextRequest()
      const result = await validateAuth(req)
      
      expect(result.authenticated).toBe(true)
    })

    it('should reject requests without session token when auth is required', async () => {
      // Mock environment with app password
      vi.stubEnv('APP_PASSWORD', 'test-password')
      
      const req = new MockNextRequest()
      const result = await validateAuth(req)
      
      expect(result.authenticated).toBe(false)
      expect(result.error).toBe('Authentication required')
      expect(result.status).toBe(401)
    })

    it('should reject requests with invalid token format', async () => {
      vi.stubEnv('APP_PASSWORD', 'test-password')
      
      const req = new MockNextRequest({
        cookies: { 'finance_tracker_session': 'invalid-token' }
      })
      
      const result = await validateAuth(req)
      
      expect(result.authenticated).toBe(false)
      expect(result.error).toBe('Invalid token format')
    })

    it('should reject requests with expired tokens', async () => {
      vi.stubEnv('APP_PASSWORD', 'test-password')
      
      // Create an expired token (payload with past expiration)
      const expiredPayload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 3600 }))
      const expiredToken = `header.${expiredPayload}.signature`
      
      const req = new MockNextRequest({
        cookies: { 'finance_tracker_session': expiredToken }
      })
      
      const result = await validateAuth(req)
      
      expect(result.authenticated).toBe(false)
      expect(result.error).toBe('Token expired')
    })
  })

  describe('Rate Limiting', () => {
    it('should allow requests within rate limit', async () => {
      const rateLimit = createRateLimit({
        windowMs: 60000, // 1 minute
        maxRequests: 5
      })
      
      const req = new MockNextRequest({
        headers: { 'x-forwarded-for': '192.168.1.1' }
      })
      
      // First 5 requests should pass
      for (let i = 0; i < 5; i++) {
        const result = await rateLimit(req)
        expect(result).toBe(null)
      }
    })

    it('should rate limit after exceeding max requests', async () => {
      const rateLimit = createRateLimit({
        windowMs: 60000, // 1 minute
        maxRequests: 3
      })
      
      const req = new MockNextRequest({
        headers: { 'x-forwarded-for': '192.168.1.1' }
      })
      
      // First 3 requests should pass
      for (let i = 0; i < 3; i++) {
        const result = await rateLimit(req)
        expect(result).toBe(null)
      }
      
      // 4th request should be rate limited
      const rateLimitResponse = await rateLimit(req)
      expect(rateLimitResponse).not.toBe(null)
      expect(rateLimitResponse?.status).toBe(429)
      
      const responseData = await rateLimitResponse?.json()
      expect(responseData).toHaveProperty('error', 'Too many requests')
      expect(responseData).toHaveProperty('retryAfter')
    })

    it('should handle multiple clients separately', async () => {
      const rateLimit = createRateLimit({
        windowMs: 60000,
        maxRequests: 2
      })
      
      const req1 = new MockNextRequest({
        headers: { 'x-forwarded-for': '192.168.1.1' }
      })
      
      const req2 = new MockNextRequest({
        headers: { 'x-forwarded-for': '192.168.1.2' }
      })
      
      // Client 1 makes 2 requests (should be allowed)
      await rateLimit(req1)
      await rateLimit(req1)
      
      // Client 2 makes 2 requests (should be allowed)
      await rateLimit(req2)
      await rateLimit(req2)
      
      // Client 1 makes 3rd request (should be rate limited)
      const client1RateLimit = await rateLimit(req1)
      expect(client1RateLimit?.status).toBe(429)
      
      // Client 2 makes 3rd request (should be rate limited)
      const client2RateLimit = await rateLimit(req2)
      expect(client2RateLimit?.status).toBe(429)
    })
  })

  describe('Input Validation', () => {
    it('should validate valid data against schema', () => {
      const schema: ValidationSchema = {
        name: { type: 'string', required: true, min: 2, max: 50 },
        age: { type: 'number', required: true, min: 0, max: 150 },
        email: { type: 'string', required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }
      }
      
      const validData = {
        name: 'John Doe',
        age: 30,
        email: 'john@example.com'
      }
      
      const result = validateBody(validData, schema)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should reject invalid data', () => {
      const schema: ValidationSchema = {
        name: { type: 'string', required: true, min: 2, max: 50 },
        age: { type: 'number', required: true, min: 0, max: 150 },
        email: { type: 'string', required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }
      }
      
      const invalidData = {
        name: 'J', // Too short
        age: -5, // Below minimum
        email: 'invalid-email' // Invalid pattern
      }
      
      const result = validateBody(invalidData, schema)
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors).toContain('name must be at least 2 characters')
      expect(result.errors).toContain('age must be at least 0')
      expect(result.errors).toContain('email format is invalid')
    })

    it('should handle missing required fields', () => {
      const schema: ValidationSchema = {
        name: { type: 'string', required: true },
        age: { type: 'number', required: true }
      }
      
      const incompleteData = {
        name: 'John'
        // Missing age
      }
      
      const result = validateBody(incompleteData, schema)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('age is required')
    })

    it('should validate arrays with size constraints', () => {
      const schema: ValidationSchema = {
        items: { type: 'array', required: true, min: 1, max: 5 }
      }
      
      // Valid array
      const validArray = { items: [1, 2, 3] }
      let result = validateBody(validArray, schema)
      expect(result.valid).toBe(true)
      
      // Empty array
      const emptyArray = { items: [] }
      result = validateBody(emptyArray, schema)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('items must have at least 1 items')
      
      // Oversized array
      const oversizedArray = { items: new Array(10).fill(0) }
      result = validateBody(oversizedArray, schema)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('items must not exceed 5 items')
    })

    it('should validate enum values', () => {
      const schema: ValidationSchema = {
        status: { type: 'string', required: true, enum: ['active', 'inactive', 'pending'] }
      }
      
      // Valid enum value
      const validData = { status: 'active' }
      let result = validateBody(validData, schema)
      expect(result.valid).toBe(true)
      
      // Invalid enum value
      const invalidData = { status: 'unknown' }
      result = validateBody(invalidData, schema)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('status must be one of: active, inactive, pending')
    })

    it('should validate boolean fields', () => {
      const schema: ValidationSchema = {
        enabled: { type: 'boolean', required: true }
      }
      
      // Valid boolean values
      const validData1 = { enabled: true }
      const validData2 = { enabled: false }
      
      let result = validateBody(validData1, schema)
      expect(result.valid).toBe(true)
      
      result = validateBody(validData2, schema)
      expect(result.valid).toBe(true)
      
      // Invalid boolean value
      const invalidData = { enabled: 'true' } // String instead of boolean
      result = validateBody(invalidData, schema)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('enabled must be a boolean')
    })
  })
})
