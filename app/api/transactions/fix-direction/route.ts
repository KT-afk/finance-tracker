import { NextRequest, NextResponse } from "next/server"
import { and, eq, inArray, lt } from "drizzle-orm"
import { db } from "@/lib/db"
import { transactions } from "@/lib/schema"
import { computeHash } from "@/lib/parsers/normalizer"
import { requireAuth } from "@/lib/auth-middleware"

// One-off repair for OCBC incoming transfers that the old pdf-parse fallback
// stored as negative. Flips the sign and recomputes the hash so re-uploads
// still dedupe. Remove once the repair has been run.
export async function POST(req: NextRequest) {
  const authError = await requireAuth(req)
  if (authError) return authError

  try {
    const body = await req.json()
    const ids: unknown = body.ids
    if (
      !Array.isArray(ids) ||
      ids.length === 0 ||
      !ids.every((id) => typeof id === "string")
    ) {
      return NextResponse.json(
        { error: "ids must be a non-empty string array" },
        { status: 400 }
      )
    }

    const rows = await db
      .select()
      .from(transactions)
      .where(
        and(
          inArray(transactions.id, ids as string[]),
          eq(transactions.bank, "ocbc"),
          lt(transactions.amount, 0)
        )
      )

    const fixed = []
    for (const row of rows) {
      const amount = -row.amount
      const hash = computeHash({
        date: row.date,
        description: row.description,
        amount,
        bank: row.bank,
      })
      await db
        .update(transactions)
        .set({ amount, hash })
        .where(eq(transactions.id, row.id))
      fixed.push({ id: row.id, date: row.date, amount })
    }

    return NextResponse.json({ requested: ids.length, fixed })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
