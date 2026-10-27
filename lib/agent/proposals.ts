import { randomBytes } from "node:crypto"
import { and, eq } from "drizzle-orm"
import { db } from "../db"
import { describeTransaction } from "../describe-transaction"
import {
  agentProposals,
  CATEGORIES,
  changeLog,
  OFF_BANK,
  SPEND_CATEGORIES,
  transactions,
  type ConversationSource,
  type ProposalStatus,
} from "../schema"

/** Why a proposal can't be made; the message goes back to the agent. */
export class ProposalError extends Error {}

// After this a button does nothing: an old proposal may no longer match
// what the owner had in mind
const EXPIRES_AFTER_MS = 24 * 60 * 60 * 1000

// These come with who owes what, so they are set from Owed to you
const OWED_CATEGORIES = ["Repayment", "Paid by Others"]

function money(amount: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(Math.abs(amount))
}

function day(date: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`))
}

// Short enough for Telegram's 64-byte button data, hard to guess
function newId(): string {
  return randomBytes(12).toString("base64url").replace(/[-_]/g, "x")
}

/**
 * Store a proposal to recategorise one transaction. Nothing changes until
 * the owner confirms it with decideProposal().
 */
export async function proposeRecategorise(input: {
  transactionId: string
  category: string
  source: ConversationSource
  request: string
  now: Date
}): Promise<{ id: string; summary: string }> {
  const [tx] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, input.transactionId))
    .limit(1)
  if (!tx) throw new ProposalError("Transaction not found; search for it first")
  if (!(CATEGORIES as readonly string[]).includes(input.category))
    throw new ProposalError("Use a category from the tool schema")
  if (
    OWED_CATEGORIES.includes(input.category) ||
    OWED_CATEGORIES.includes(tx.category)
  )
    throw new ProposalError(
      "Repayments and things others paid for are set from Owed to you in the app, not by the agent"
    )
  if (
    tx.bank === OFF_BANK &&
    !(SPEND_CATEGORIES as readonly string[]).includes(input.category)
  )
    throw new ProposalError(
      "This was entered by hand, so it can only move to a spending category"
    )
  if (tx.category === input.category)
    throw new ProposalError(`It is already ${tx.category}`)

  const title = tx.payee ?? describeTransaction(tx.description).title
  const summary = `${title} ${money(tx.amount)} on ${day(tx.date)}: ${tx.category} → ${input.category}`
  const id = newId()
  await db.insert(agentProposals).values({
    id,
    kind: "recategorise",
    target: tx.id,
    before: tx.category,
    after: input.category,
    summary,
    source: input.source,
    request: input.request,
    created_at: input.now.toISOString(),
  })
  return { id, summary }
}

export type Decision = "confirm" | "reject"
export type DecisionOutcome =
  "applied" | "rejected" | "expired" | "used" | "conflict" | "not_found"

/**
 * The owner's tap on a proposal. Only a pending, unexpired proposal does
 * anything; confirming applies it if the transaction still has the
 * "before" category, and records it in the change log. Safe to call twice:
 * only the first call can apply.
 */
export async function decideProposal(
  id: string,
  decision: Decision,
  now: Date
): Promise<{ outcome: DecisionOutcome; message: string }> {
  const [proposal] = await db
    .select()
    .from(agentProposals)
    .where(eq(agentProposals.id, id))
    .limit(1)
  if (!proposal)
    return {
      outcome: "not_found",
      message: "That proposal no longer exists. Nothing changed.",
    }
  if (proposal.status !== "pending")
    return {
      outcome: "used",
      message: `This was already ${proposal.status}. Nothing changed.`,
    }

  // One statement claims the proposal, so a second tap racing this one
  // finds it decided and changes nothing
  const settle = async (status: ProposalStatus) =>
    (
      await db
        .update(agentProposals)
        .set({
          status,
          decided_at: now.toISOString(),
        })
        .where(
          and(eq(agentProposals.id, id), eq(agentProposals.status, "pending"))
        )
        .returning({ id: agentProposals.id })
    ).length > 0
  const lost = {
    outcome: "used" as const,
    message: "This was already decided. Nothing changed.",
  }

  if (
    now.getTime() - new Date(proposal.created_at).getTime() >
    EXPIRES_AFTER_MS
  ) {
    if (!(await settle("expired"))) return lost
    return {
      outcome: "expired",
      message:
        "This proposal expired (older than 24 hours). Nothing changed. Ask again if you still want it.",
    }
  }
  if (decision === "reject") {
    if (!(await settle("rejected"))) return lost
    return { outcome: "rejected", message: "Rejected. Nothing changed." }
  }

  const [target] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, proposal.target))
    .limit(1)
  if (!target || target.category !== proposal.before) {
    if (!(await settle("conflict"))) return lost
    return {
      outcome: "conflict",
      message: target
        ? `Nothing changed: it is now ${target.category}, not ${proposal.before}, since this was proposed.`
        : "Nothing changed: that transaction no longer exists.",
    }
  }
  if (!(await settle("confirmed"))) return lost

  try {
    // The change and its log entry are written together
    const [, [entry]] = await db.batch([
      db
        .update(transactions)
        .set(
          // A hand-entered row has no bank text to correct against
          target.bank === OFF_BANK
            ? { category: proposal.after }
            : { category: proposal.after, is_corrected: true }
        )
        .where(eq(transactions.id, proposal.target)),
      db
        .insert(changeLog)
        .values({
          created_at: now.toISOString(),
          kind: proposal.kind,
          target: proposal.target,
          before: proposal.before,
          after: proposal.after,
          source: proposal.source,
          request: proposal.request,
          proposal_id: proposal.id,
        })
        .returning({ id: changeLog.id }),
    ])
    return {
      outcome: "applied",
      message: `Done: ${proposal.summary}. Change #${entry.id} in the change log.`,
    }
  } catch (error) {
    // Nothing was written; let the owner tap again
    await db
      .update(agentProposals)
      .set({ status: "pending", decided_at: null })
      .where(eq(agentProposals.id, id))
    throw error
  }
}

export const proposeRecategoriseTool = {
  name: "propose_recategorise",
  strict: true,
  description:
    "Propose moving one transaction to another category, when the owner says a category is wrong. Find the transaction first with search_transactions and use its id. This stores a proposal and changes nothing: the owner confirms or rejects it with a button, and only confirming applies it. Returns the summary the owner will see.",
  input_schema: {
    type: "object" as const,
    properties: {
      transaction_id: {
        type: "string",
        description: "The id from search_transactions",
      },
      category: { type: "string", enum: [...CATEGORIES] },
    },
    additionalProperties: false,
    required: ["transaction_id", "category"],
  },
} satisfies import("@anthropic-ai/sdk").default.Tool

/** Strict check of the tool input, like the other agent tools. */
export function parseProposeInput(input: unknown): {
  transaction_id: string
  category: string
} {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new ProposalError("Tool input must be an object")
  const values = input as Record<string, unknown>
  for (const key of Object.keys(values))
    if (!["transaction_id", "category"].includes(key))
      throw new ProposalError("Unknown field " + key)
  const { transaction_id, category } = values
  if (typeof transaction_id !== "string" || !transaction_id.trim())
    throw new ProposalError(
      "transaction_id must be the id from search_transactions"
    )
  if (typeof category !== "string")
    throw new ProposalError("category must be a string")
  return { transaction_id: transaction_id.trim(), category }
}
