import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { transactions } from "@/lib/schema"
import {
  requireAuth,
  validateBody,
  ValidationSchema,
} from "@/lib/auth-middleware"
import { saveBalanceHistory } from "@/lib/balance-history"
import { AccountType, Bank, BANKS } from "@/lib/schema"

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

interface PendingBalance {
  bank: Bank
  balance: number
  accountType: AccountType
}

function isPendingBalance(value: unknown): value is PendingBalance {
  const b = value as PendingBalance
  return (
    typeof b === "object" &&
    b !== null &&
    (BANKS as readonly string[]).includes(b.bank) &&
    typeof b.balance === "number" &&
    Number.isFinite(b.balance) &&
    (b.accountType === "savings" || b.accountType === "credit_card")
  )
}

// Validation schema for transaction data
const transactionSchema: ValidationSchema = {
  transactions: {
    type: "array",
    required: true,
    min: 0, // may be empty when only saving a held-back balance
    max: 1000, // Prevent excessive batch sizes
  },
}

// Validation schema for individual transaction
const individualTransactionSchema: ValidationSchema = {
  id: { type: "string", required: true, min: 1, max: 255 },
  date: {
    type: "string",
    required: true,
    pattern: /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD format
  },
  description: { type: "string", required: true, min: 1, max: 1000 },
  amount: { type: "number", required: true },
  bank: {
    type: "string",
    required: true,
    enum: [...BANKS],
  },
  category: { type: "string", required: true, min: 1, max: 100 },
  is_corrected: { type: "boolean", required: true },
  hash: { type: "string", required: true, min: 1, max: 255 },
  uploaded_at: { type: "string", required: true },
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
      return NextResponse.json(
        {
          error: "Invalid request body",
          details: bodyValidation.errors,
        },
        { status: 400 }
      )
    }

    const txns: TransactionPayload[] = body.transactions
    // Balances held back at preview because the statement didn't reconcile;
    // sent here only when the user chose to import anyway.
    const balances: PendingBalance[] = Array.isArray(body.balances)
      ? body.balances.filter(isPendingBalance)
      : []
    if (txns.length === 0 && balances.length === 0) {
      return NextResponse.json({ error: "Nothing to import" }, { status: 400 })
    }

    let inserted = 0
    let skipped = 0
    const validationErrors: string[] = []

    for (const t of txns) {
      // Validate individual transaction
      const txnValidation = validateBody(t, individualTransactionSchema)
      if (!txnValidation.valid) {
        validationErrors.push(
          `Transaction ${t.id}: ${txnValidation.errors.join(", ")}`
        )
        continue
      }

      try {
        // INSERT OR IGNORE based on unique hash constraint
        const result = await db
          .insert(transactions)
          .values({
            id: t.id,
            date: t.date,
            description: t.description,
            amount: t.amount,
            bank: t.bank as Bank,
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

    for (const b of balances) {
      await saveBalanceHistory({
        bank: b.bank,
        balance: b.balance,
        accountType: b.accountType,
        recordedAt: new Date().toISOString(),
      })
    }

    // Return validation errors if any occurred
    if (validationErrors.length > 0) {
      return NextResponse.json(
        {
          inserted,
          skipped,
          validationErrors,
          error: "Some transactions failed validation",
        },
        { status: 400 }
      )
    }

    return NextResponse.json({ inserted, skipped })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
