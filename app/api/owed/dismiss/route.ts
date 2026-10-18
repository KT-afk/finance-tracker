import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-middleware"
import { dismissToSort, OwedError } from "@/lib/owed"

// Body: { transactionId } — hides it from "To sort" on the owed page
export async function POST(req: NextRequest) {
  const authError = await requireAuth(req)
  if (authError) return authError

  try {
    const body = await req.json().catch(() => null)
    const transactionId = body?.transactionId
    if (typeof transactionId !== "string" || !transactionId) {
      return NextResponse.json(
        { error: "Invalid transaction" },
        { status: 400 }
      )
    }
    await dismissToSort(transactionId)
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    if (e instanceof OwedError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    const msg = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
