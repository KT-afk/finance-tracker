import { NextResponse } from "next/server"
import { getOwedSummary, getToSort } from "@/lib/owed"

export async function GET() {
  try {
    const [summary, toSort] = await Promise.all([getOwedSummary(), getToSort()])
    return NextResponse.json({ ...summary, toSort })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
