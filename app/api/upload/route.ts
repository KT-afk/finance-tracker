import { NextRequest, NextResponse } from "next/server"
import { parseFile } from "@/lib/parsers"
import { normalize } from "@/lib/parsers/normalizer"
import { categorize } from "@/lib/categorize"
import { db } from "@/lib/db"
import { transactions, balanceHistory } from "@/lib/schema"
import { Bank, BANKS } from "@/lib/schema"
import { inArray } from "drizzle-orm"

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    const bank = formData.get("bank") as string | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }
    if (!bank || !(BANKS as readonly string[]).includes(bank)) {
      return NextResponse.json(
        { error: "Invalid or missing bank" },
        { status: 400 }
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    // Parse file using bank-specific parser (supports CSV and PDF)
    let parseResult
    try {
      parseResult = await parseFile(buffer, file.name, bank as Bank)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown parse error"
      console.error(`[upload] Parse failed for ${bank} / ${file.name}:`, msg)
      return NextResponse.json(
        { error: `Failed to parse ${file.name} for ${bank}: ${msg}` },
        { status: 422 }
      )
    }

    const {
      transactions: raws,
      endingBalance,
      accountType = "savings",
    } = parseResult

    if (raws.length === 0) {
      console.warn(
        `[upload] 0 transactions extracted from ${file.name} for ${bank}`
      )
      return NextResponse.json(
        {
          error: `No transactions found in ${file.name}. Is this the correct bank (${bank.toUpperCase()})? The file format may not be supported.`,
        },
        { status: 422 }
      )
    }

    // Normalize (compute hashes)
    const normalized = normalize(raws)

    // Check which hashes already exist in DB
    const hashes = normalized.map((t) => t.hash)
    const existing = await db
      .select({ hash: transactions.hash })
      .from(transactions)
      .where(inArray(transactions.hash, hashes))
    const existingHashes = new Set(existing.map((e) => e.hash))

    const newTransactions = normalized.filter(
      (t) => !existingHashes.has(t.hash)
    )
    const skippedCount = normalized.length - newTransactions.length

    // Categorize new transactions
    const categorized = await Promise.all(
      newTransactions.map(async (t) => ({
        ...t,
        category: await categorize(t.description, {
          requireAi: true,
          amount: t.amount,
        }),
      }))
    )

    // Save ending balance if extracted from CSV
    let savedBalance = false
    if (endingBalance !== undefined) {
      try {
        await db.insert(balanceHistory).values({
          bank: bank as Bank,
          balance: endingBalance,
          account_type: accountType,
          recorded_at: new Date().toISOString(),
        })
        savedBalance = true
      } catch (balanceError) {
        console.error("Failed to save balance:", balanceError)
        // Don't fail the upload if balance saving fails
      }
    }

    // Build date range
    const dates = normalized.map((t) => t.date).sort()
    const dateFrom = dates[0]
    const dateTo = dates[dates.length - 1]

    return NextResponse.json({
      preview: {
        total: normalized.length,
        newCount: categorized.length,
        skippedCount,
        dateFrom,
        dateTo,
        bank,
        endingBalance,
      },
      transactions: categorized,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
