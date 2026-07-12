import { db } from "@/lib/db"
import { transactions } from "@/lib/schema"
import { eq } from "drizzle-orm"
import {
  categorize,
  getEffectiveAmount,
  getKnownCategory,
} from "@/lib/categorize"
import { shouldRecategorizeTransaction } from "@/lib/cash-flow"
import { requireAuth, createRateLimit } from "@/lib/auth-middleware"

// Rate limiting: 10 requests per minute per client
const rateLimit = createRateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10,
  keyGenerator: (req) =>
    `recategorize:${req.headers.get("x-forwarded-for") || "unknown"}`,
})

export async function POST(req: Request) {
  // Check authentication
  const authError = await requireAuth(req as any)
  if (authError) return authError

  // Check rate limiting
  const rateLimitError = await rateLimit(req as any)
  if (rateLimitError) return rateLimitError

  try {
    const uneditedTransactions = await db
      .select()
      .from(transactions)
      .where(eq(transactions.is_corrected, false))

    const uncategorized = uneditedTransactions.filter(
      shouldRecategorizeTransaction
    )

    const total = uncategorized.length

    if (total === 0) {
      return new Response(
        JSON.stringify({
          done: true,
          updated: 0,
          total: 0,
          message: "No eligible transactions found.",
        }) + "\n",
        { headers: { "Content-Type": "text/plain" } }
      )
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        let updated = 0

        try {
          for (let i = 0; i < uncategorized.length; i++) {
            const tx = uncategorized[i]
            const category =
              getKnownCategory(tx.description, tx.amount) ??
              (await categorize(tx.description, {
                requireAi: true,
                amount: tx.amount,
              }))

            const amount = getEffectiveAmount(tx.description, tx.amount)
            if (category !== tx.category || amount !== tx.amount) {
              await db
                .update(transactions)
                .set({ category, amount })
                .where(eq(transactions.id, tx.id))
              updated++
            }

            controller.enqueue(
              encoder.encode(
                JSON.stringify({ progress: i + 1, total, updated }) + "\n"
              )
            )
          }

          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                done: true,
                updated,
                total,
                message: `Recategorized ${updated} of ${total} transactions.`,
              }) + "\n"
            )
          )
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Recategorization failed."
          controller.enqueue(
            encoder.encode(
              JSON.stringify({ error: message, done: true, updated, total }) +
                "\n"
            )
          )
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: { "Content-Type": "text/plain", "Transfer-Encoding": "chunked" },
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Recategorization failed."
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
