import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-middleware"
import { createOwedRule, OwedError } from "@/lib/owed"

// Body: { keyword, person, amount, startsOn }
export async function POST(req: NextRequest) {
  const authError = await requireAuth(req)
  if (authError) return authError

  try {
    const body = await req.json()
    const result = await createOwedRule(body)
    return NextResponse.json(result, { status: 201 })
  } catch (e: unknown) {
    if (e instanceof OwedError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    const msg = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
