import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-middleware"
import { addOwedAdjustment, OwedError } from "@/lib/owed"

// Body: { kind: "covered" | "forgiven", person, amount, note, category, date }
// Removed via DELETE /api/transactions/[transactionId]/owed
export async function POST(req: NextRequest) {
  const authError = await requireAuth(req)
  if (authError) return authError

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      )
    }
    const adjustment = await addOwedAdjustment(body)
    return NextResponse.json({ adjustment }, { status: 201 })
  } catch (e: unknown) {
    if (e instanceof OwedError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    const msg = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
