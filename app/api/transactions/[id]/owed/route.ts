import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-middleware"
import {
  markRepayment,
  OwedError,
  removeOwedEntry,
  setOwedShare,
} from "@/lib/owed"

function errorResponse(e: unknown) {
  if (e instanceof OwedError) {
    return NextResponse.json({ error: e.message }, { status: e.status })
  }
  const msg = e instanceof Error ? e.message : "Unknown error"
  return NextResponse.json({ error: msg }, { status: 500 })
}

// Body: { kind: "share" | "repayment", person, amount }
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth(req)
  if (authError) return authError

  try {
    const { id } = await params
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      )
    }
    if (body.kind === "share") {
      const entry = await setOwedShare(id, body)
      return NextResponse.json({ entry: { ...entry, kind: "share" } })
    }
    if (body.kind === "repayment") {
      const entry = await markRepayment(id, body)
      return NextResponse.json({ entry: { ...entry, kind: "repayment" } })
    }
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 })
  } catch (e: unknown) {
    return errorResponse(e)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth(req)
  if (authError) return authError

  try {
    const { id } = await params
    const removed = await removeOwedEntry(id)
    return NextResponse.json({ removed: removed !== null })
  } catch (e: unknown) {
    return errorResponse(e)
  }
}
