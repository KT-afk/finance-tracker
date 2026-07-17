import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { transactions } from "@/lib/schema"

export async function GET() {
  try {
    const rows = await db.select({ date: transactions.date }).from(transactions)
    const monthSet = new Set<string>()
    for (const row of rows) {
      monthSet.add(row.date.slice(0, 7))
    }
    const months = Array.from(monthSet).sort((a, b) => b.localeCompare(a))
    return NextResponse.json({ months })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
