import { NextRequest, NextResponse } from "next/server"
import { forgetMemory } from "@/lib/agent/change-log"

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const numId = parseInt(id, 10)
    if (isNaN(numId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 })
    }
    // Logged, so it can be undone from chat like any other change
    await forgetMemory(numId, { now: new Date() })
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
