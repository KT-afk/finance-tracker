import { randomBytes } from "node:crypto"
import { and, eq, sql } from "drizzle-orm"
import { db } from "../db"
import { describeTransaction } from "../describe-transaction"
import {
  agentProposals,
  aiMemory,
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

  return proposal.kind === "memory"
    ? applyMemory(proposal, settle, lost, now)
    : applyRecategorise(proposal, settle, lost, now)
}

type Proposal = typeof agentProposals.$inferSelect
type Settle = (status: ProposalStatus) => Promise<boolean>
type Lost = { outcome: "used"; message: string }
type Result = { outcome: DecisionOutcome; message: string }

/** The batch failed: let the owner tap again, unless it in fact landed. */
async function reopenIfNothingWritten(proposal: Proposal) {
  const written = await db
    .select({ id: changeLog.id })
    .from(changeLog)
    .where(eq(changeLog.proposal_id, proposal.id))
    .catch(() => [{ id: 0 }])
  if (written.length === 0)
    await db
      .update(agentProposals)
      .set({ status: "pending", decided_at: null })
      .where(
        and(
          eq(agentProposals.id, proposal.id),
          eq(agentProposals.status, "confirmed")
        )
      )
}

async function applyRecategorise(
  proposal: Proposal,
  settle: Settle,
  lost: Lost,
  now: Date
): Promise<Result> {
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

  // Both writes require the transaction to still have the "before"
  // category, and run in one batch: either both happen or neither, even if
  // the category changed a moment ago
  const stillBefore = and(
    eq(transactions.id, proposal.target),
    eq(transactions.category, proposal.before)
  )
  let entry: { id: number } | undefined
  try {
    const [logged] = await db.batch([
      db
        .insert(changeLog)
        .select(
          db
            .select({
              // null lets SQLite number the entry
              id: sql`null`.as("id"),
              created_at: sql`${now.toISOString()}`.as("created_at"),
              kind: sql`${proposal.kind}`.as("kind"),
              target: transactions.id,
              before: transactions.category,
              after: sql`${proposal.after}`.as("after"),
              source: sql`${proposal.source}`.as("source"),
              request: sql`${proposal.request}`.as("request"),
              proposal_id: sql`${proposal.id}`.as("proposal_id"),
              reverses_id: sql`null`.as("reverses_id"),
            })
            .from(transactions)
            .where(stillBefore)
        )
        .returning({ id: changeLog.id }),
      db
        .update(transactions)
        .set(
          // A hand-entered row has no bank text to correct against
          target.bank === OFF_BANK
            ? { category: proposal.after }
            : { category: proposal.after, is_corrected: true }
        )
        .where(stillBefore),
    ])
    entry = logged[0]
  } catch (error) {
    await reopenIfNothingWritten(proposal)
    throw error
  }
  if (!entry) {
    // Changed between the check above and the write
    await db
      .update(agentProposals)
      .set({ status: "conflict" })
      .where(eq(agentProposals.id, proposal.id))
    return {
      outcome: "conflict",
      message: `Nothing changed: it is no longer ${proposal.before}, since this was proposed.`,
    }
  }
  return {
    outcome: "applied",
    message: `Done: ${proposal.summary}. Change #${entry.id} in the change log.`,
  }
}

async function applyMemory(
  proposal: Proposal,
  settle: Settle,
  lost: Lost,
  now: Date
): Promise<Result> {
  const [current] = await db
    .select({ value: aiMemory.value })
    .from(aiMemory)
    .where(eq(aiMemory.key, proposal.target))
    .limit(1)
  if ((current?.value ?? "") !== proposal.before) {
    if (!(await settle("conflict"))) return lost
    return {
      outcome: "conflict",
      message:
        "Nothing changed: that memory has changed since this was proposed.",
    }
  }
  if (!(await settle("confirmed"))) return lost
  let entry: { id: number }
  try {
    // The memory and its log entry are written together
    const [[logged]] = await db.batch([
      db
        .insert(changeLog)
        .values({
          created_at: now.toISOString(),
          kind: "memory",
          target: proposal.target,
          before: proposal.before,
          after: proposal.after,
          source: proposal.source,
          request: proposal.request,
          proposal_id: proposal.id,
        })
        .returning({ id: changeLog.id }),
      db
        .insert(aiMemory)
        .values({
          key: proposal.target,
          value: proposal.after,
          source: proposal.memory_source ?? "user",
          created_at: now.toISOString(),
        })
        .onConflictDoUpdate({
          target: aiMemory.key,
          set: {
            value: proposal.after,
            source: proposal.memory_source ?? "user",
          },
        }),
    ])
    entry = logged
  } catch (error) {
    await reopenIfNothingWritten(proposal)
    throw error
  }
  return {
    outcome: "applied",
    message: `Saved: ${proposal.after}. Change #${entry.id} in the change log.`,
  }
}

// Memories go into every request, so keep them short
const MAX_MEMORY_KEY = 60
const MAX_MEMORY_VALUE = 300

/**
 * Store a proposal to save a memory. ownerAsked: the owner said "remember
 * that…" (saved as "user"); otherwise the agent noticed it ("inferred").
 */
export async function proposeMemory(input: {
  key: string
  value: string
  ownerAsked: boolean
  source: ConversationSource
  request: string
  now: Date
}): Promise<{ id: string; summary: string }> {
  const key = input.key.replace(/\s+/g, " ").trim().toLowerCase()
  const value = input.value.replace(/\s+/g, " ").trim()
  if (!key || key.length > MAX_MEMORY_KEY)
    throw new ProposalError(
      `Give the memory a short name, up to ${MAX_MEMORY_KEY} characters`
    )
  if (!value) throw new ProposalError("Say what to remember")
  if (value.length > MAX_MEMORY_VALUE)
    throw new ProposalError(
      `Keep a memory to ${MAX_MEMORY_VALUE} characters; split it if needed`
    )
  const [current] = await db
    .select({ value: aiMemory.value })
    .from(aiMemory)
    .where(eq(aiMemory.key, key))
    .limit(1)
  const before = current?.value ?? ""
  if (before === value) throw new ProposalError("That is already remembered")
  const summary =
    `Remember: ${value}` + (before ? ` (replaces: ${before})` : "")
  const id = newId()
  await db.insert(agentProposals).values({
    id,
    kind: "memory",
    target: key,
    before,
    after: value,
    summary,
    source: input.source,
    request: input.request,
    memory_source: input.ownerAsked ? "user" : "inferred",
    created_at: input.now.toISOString(),
  })
  return { id, summary }
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

export const proposeMemoryTool = {
  name: "propose_memory",
  strict: true,
  description:
    "Propose saving a memory: a lasting fact to use in later answers, such as what a payment was for or that a monthly payment is expected. Use it when the owner says “remember that…” (owner_asked true), or when they tell you something worth keeping (owner_asked false). Reuse an existing memory's name to replace it. This stores a proposal and saves nothing until the owner confirms it with a button.",
  input_schema: {
    type: "object" as const,
    properties: {
      name: {
        type: "string",
        description: "Short name, e.g. wedding ring or gym payment",
      },
      fact: {
        type: "string",
        description:
          "The fact in one sentence, with dates and amounts, e.g. The $1,277 transfer to Yoon Thiri on 8 Jun 2026 was my wedding ring",
      },
      owner_asked: {
        type: "boolean",
        description: "True only if the owner asked you to remember it",
      },
    },
    additionalProperties: false,
    required: ["name", "fact", "owner_asked"],
  },
} satisfies import("@anthropic-ai/sdk").default.Tool

/** Strict check of the propose_memory input. */
export function parseMemoryInput(input: unknown): {
  name: string
  fact: string
  owner_asked: boolean
} {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new ProposalError("Tool input must be an object")
  const values = input as Record<string, unknown>
  for (const key of Object.keys(values))
    if (!["name", "fact", "owner_asked"].includes(key))
      throw new ProposalError("Unknown field " + key)
  const { name, fact, owner_asked } = values
  if (typeof name !== "string" || typeof fact !== "string")
    throw new ProposalError("name and fact must be strings")
  if (typeof owner_asked !== "boolean")
    throw new ProposalError("owner_asked must be true or false")
  return { name, fact, owner_asked }
}
