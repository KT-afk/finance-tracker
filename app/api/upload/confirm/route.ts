import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { transactions } from '@/lib/schema'
import { requireAuth, validateBody, ValidationSchema } from '@/lib/auth-middleware'

interface TransactionPayload {
  id: string
  date: string
  description: string
  amount: number
  bank: string
  category: string
  is_corrected: boolean
  hash: string
  uploaded_at: string
}

// Validation schema for transaction data
const transactionSchema: ValidationSchema = {
  transactions: {
    type: 'array',
    required: true,
    min: 1,
    max: 1000 // Prevent excessive batch sizes
  }
}

// Validation schema for individual transaction
const individualTransactionSchema: ValidationSchema = {
  id: { type: 'string', required: true, min: 1, max: 255 },
  date: { 
    type: 'string', 
    required: true, 
    pattern: /^\d{4}-\d{2}-\d{2}$/ // YYYY-MM-DD format
  },
  description: { type: 'string', required: true, min: 1, max: 1000 },
  amount: { type: 'number', required: true },
  bank: { 
    type: 'string', 
    required: true, 
    enum: ['ocbc', 'dbs', 'uob', 'trust']
  },
  category: { type: 'string', required: true, min: 1, max: 100 },
  is_corrected: { type: 'boolean', required: true },
  hash: { type: 'string', required: true, min: 1, max: 255 },
  uploaded_at: { type: 'string', required: true }
}

export async function POST(req: NextRequest) {
  // Check authentication
  const authError = await requireAuth(req)
  if (authError) return authError

  try {
    const body = await req.json()
    
    // Validate request body structure
    const bodyValidation = validateBody(body, transactionSchema)
    if (!bodyValidation.valid) {
      return NextResponse.json({ 
        error: 'Invalid request body', 
        details: bodyValidation.errors 
      }, { status: 400 })
    }

    const txns: TransactionPayload[] = body.transactions

    let inserted = 0
    let skipped = 0
    const validationErrors: string[] = []

    for (const t of txns) {
      // Validate individual transaction
      const txnValidation = validateBody(t, individualTransactionSchema)
      if (!txnValidation.valid) {
        validationErrors.push(`Transaction ${t.id}: ${txnValidation.errors.join(', ')}`)
        continue
      }

      try {
        // INSERT OR IGNORE based on unique hash constraint
        const result = await db.insert(transactions)
          .values({
            id: t.id,
            date: t.date,
            description: t.description,
            amount: t.amount,
            bank: t.bank as 'ocbc' | 'dbs' | 'uob' | 'trust',
            category: t.category,
            is_corrected: t.is_corrected,
            hash: t.hash,
            uploaded_at: t.uploaded_at,
          })
          .onConflictDoNothing({ target: transactions.hash })
          .returning({ id: transactions.id })

        if (result.length > 0) inserted++
        else skipped++
      } catch {
        skipped++
      }
    }

    // Return validation errors if any occurred
    if (validationErrors.length > 0) {
      return NextResponse.json({ 
        inserted, 
        skipped,
        validationErrors,
        error: 'Some transactions failed validation'
      }, { status: 400 })
    }

    return NextResponse.json({ inserted, skipped })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
