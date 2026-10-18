import { NextResponse } from "next/server"
import { getOwedSummary } from "@/lib/owed"

export async function GET() {
  try {
    return NextResponse.json(await getOwedSummary())
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
