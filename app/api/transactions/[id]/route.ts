import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { transactions } from "@/lib/schema"
import { and, eq, ne } from "drizzle-orm"
import { saveRule } from "@/lib/rules"
import { CATEGORIES } from "@/lib/schema"
import { requireAuth } from "@/lib/auth-middleware"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Check authentication
  const authError = await requireAuth(req)
  if (authError) return authError

  try {
    const { id } = await params
    const body = await req.json()
    const { category } = body

    if (!category || !(CATEGORIES as readonly string[]).includes(category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 })
    }

    // Get the transaction to extract description for rule saving
    const [existing] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, id))
      .limit(1)

    if (!existing) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      )
    }

    // Update category and mark as corrected
    await db
      .update(transactions)
      .set({ category, is_corrected: true })
      .where(eq(transactions.id, id))

    // Save a keyword rule so future uploads get the right category automatically
    const transferSender = existing.description.match(
      /\bfrom\s+(.+?)(?:\s+OTHR\b|\s+\d{8,}|$)/i
    )
    const keyword = transferSender
      ? `from ${transferSender[1].toLowerCase().trim()}`
      : existing.description
          .toLowerCase()
          .replace(/^[a-z0-9]{6,}\s+/g, "")
          .trim()
          .split(/\s+/)
          .slice(0, 3)
          .join(" ")

    if (keyword.length >= 3) {
      await saveRule(keyword, category)
    }

    // Bulk-update all other non-corrected transactions with the same description
    const siblings = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.description, existing.description),
          ne(transactions.id, id),
          eq(transactions.is_corrected, false)
        )
      )

    if (siblings.length > 0) {
      await db
        .update(transactions)
        .set({ category, is_corrected: true })
        .where(
          and(
            eq(transactions.description, existing.description),
            ne(transactions.id, id),
            eq(transactions.is_corrected, false)
          )
        )
    }

    return NextResponse.json({
      success: true,
      siblingsUpdated: siblings.length,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Check authentication
  const authError = await requireAuth(req)
  if (authError) return authError

  try {
    const { id } = await params
    const [existing] = await db
      .select({ id: transactions.id, hash: transactions.hash })
      .from(transactions)
      .where(eq(transactions.id, id))
      .limit(1)

    if (!existing) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      )
    }

    if (!existing.hash.startsWith("manual:")) {
      return NextResponse.json(
        { error: "Only manually added transactions can be deleted" },
        { status: 403 }
      )
    }

    await db.delete(transactions).where(eq(transactions.id, id))
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
