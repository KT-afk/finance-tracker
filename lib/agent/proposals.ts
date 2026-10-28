import { randomBytes } from "node:crypto"
import { and, eq, sql } from "drizzle-orm"
import { BUDGET_CATEGORIES } from "../budgets"
import { db } from "../db"
import { describeTransaction } from "../describe-transaction"
import {
  cleanAmount,
  cleanPerson,
  getBankTransaction,
  OwedError,
} from "../owed"
import {
  agentProposals,
  aiMemory,
  budgets,
  categoryRules,
  owedEntries,
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

/** How a payment is named to the owner: "Shopee $80 on 6 Sept 2026". */
export function describePayment(tx: {
  payee: string | null
  description: string
  amount: number
  date: string
}): string {
  const title = tx.payee ?? describeTransaction(tx.description).title
  return `${title} ${money(tx.amount)} on ${day(tx.date)}`
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

  const summary = `${describePayment(tx)}: ${tx.category} → ${input.category}`
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

  if (proposal.kind === "memory")
    return applyMemory(proposal, settle, lost, now)
  if (proposal.kind === "note") return applyNote(proposal, settle, lost, now)
  if (proposal.kind === "rule") return applyRule(proposal, settle, lost, now)
  if (proposal.kind === "share") return applyShare(proposal, settle, lost, now)
  if (proposal.kind === "budget")
    return applyBudget(proposal, settle, lost, now)
  return applyRecategorise(proposal, settle, lost, now)
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
  const conflict = {
    outcome: "conflict" as const,
    message:
      "Nothing changed: that memory has changed since this was proposed.",
  }
  const [current] = await db
    .select({ value: aiMemory.value })
    .from(aiMemory)
    .where(eq(aiMemory.key, proposal.target))
    .limit(1)
  if ((current?.value ?? "") !== proposal.before) {
    if (!(await settle("conflict"))) return lost
    return conflict
  }
  if (!(await settle("confirmed"))) return lost
  const source = proposal.memory_source ?? "user"
  // The write only happens if the memory still has its "before" text (or
  // still doesn't exist), and the log row only if the write happened: a
  // change made a moment ago is never overwritten
  const write = proposal.before
    ? db
        .update(aiMemory)
        .set({ value: proposal.after, source })
        .where(
          and(
            eq(aiMemory.key, proposal.target),
            eq(aiMemory.value, proposal.before)
          )
        )
    : db
        .insert(aiMemory)
        .values({
          key: proposal.target,
          value: proposal.after,
          source,
          created_at: now.toISOString(),
        })
        .onConflictDoNothing()
  let entry: { id: number } | undefined
  try {
    const [, logged] = await db.batch([
      write,
      db
        .insert(changeLog)
        .select(
          db
            .select({
              id: sql`null`.as("id"),
              created_at: sql`${now.toISOString()}`.as("created_at"),
              kind: sql`'memory'`.as("kind"),
              target: aiMemory.key,
              before: sql`${proposal.before}`.as("before"),
              after: aiMemory.value,
              source: sql`${proposal.source}`.as("source"),
              request: sql`${proposal.request}`.as("request"),
              proposal_id: sql`${proposal.id}`.as("proposal_id"),
              reverses_id: sql`null`.as("reverses_id"),
            })
            .from(aiMemory)
            .where(
              and(
                eq(aiMemory.key, proposal.target),
                eq(aiMemory.value, proposal.after),
                // A new memory: only the row this write created carries
                // this timestamp, so an equal row saved elsewhere won't log
                proposal.before
                  ? undefined
                  : eq(aiMemory.created_at, now.toISOString())
              )
            )
        )
        .returning({ id: changeLog.id }),
    ])
    entry = logged[0]
  } catch (error) {
    await reopenIfNothingWritten(proposal)
    throw error
  }
  if (!entry) {
    await db
      .update(agentProposals)
      .set({ status: "conflict" })
      .where(eq(agentProposals.id, proposal.id))
    return conflict
  }
  return {
    outcome: "applied",
    message: `Saved: ${proposal.after}. Change #${entry.id} in the change log.`,
  }
}

const noteOf = sql<string>`coalesce(${transactions.note}, '')`

async function applyNote(
  proposal: Proposal,
  settle: Settle,
  lost: Lost,
  now: Date
): Promise<Result> {
  const conflict = {
    outcome: "conflict" as const,
    message:
      "Nothing changed: that payment's note has changed since this was proposed.",
  }
  const [target] = await db
    .select({ note: noteOf })
    .from(transactions)
    .where(eq(transactions.id, proposal.target))
    .limit(1)
  if (!target || target.note !== proposal.before) {
    if (!(await settle("conflict"))) return lost
    return target
      ? conflict
      : {
          ...conflict,
          message: "Nothing changed: that transaction no longer exists.",
        }
  }
  if (!(await settle("confirmed"))) return lost
  // Same shape as recategorise: both writes require the note to be unchanged
  const stillBefore = and(
    eq(transactions.id, proposal.target),
    sql`${noteOf} = ${proposal.before}`
  )
  let entry: { id: number } | undefined
  try {
    const [logged] = await db.batch([
      db
        .insert(changeLog)
        .select(
          db
            .select({
              id: sql`null`.as("id"),
              created_at: sql`${now.toISOString()}`.as("created_at"),
              kind: sql`'note'`.as("kind"),
              target: transactions.id,
              before: noteOf.as("before"),
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
      db.update(transactions).set({ note: proposal.after }).where(stillBefore),
    ])
    entry = logged[0]
  } catch (error) {
    await reopenIfNothingWritten(proposal)
    throw error
  }
  if (!entry) {
    await db
      .update(agentProposals)
      .set({ status: "conflict" })
      .where(eq(agentProposals.id, proposal.id))
    return conflict
  }
  return {
    outcome: "applied",
    message: `Done: ${proposal.summary}. Change #${entry.id} in the change log.`,
  }
}

// A note should read at a glance next to the payment
const MAX_NOTE = 200

/** Store a proposal to set the owner's note on one transaction. */
export async function proposeNote(input: {
  transactionId: string
  note: string
  source: ConversationSource
  request: string
  now: Date
}): Promise<{ id: string; summary: string }> {
  const note = input.note.replace(/\s+/g, " ").trim()
  if (!note) throw new ProposalError("Say what the note should be")
  if (note.length > MAX_NOTE)
    throw new ProposalError(`Keep a note to ${MAX_NOTE} characters`)
  const [tx] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, input.transactionId))
    .limit(1)
  if (!tx) throw new ProposalError("Transaction not found; search for it first")
  const before = tx.note ?? ""
  if (before === note) throw new ProposalError("That note is already on it")
  const summary =
    `Note on ${describePayment(tx)}: “${note}”` +
    (before ? ` (replaces “${before}”)` : "")
  const id = newId()
  await db.insert(agentProposals).values({
    id,
    kind: "note",
    target: tx.id,
    before,
    after: note,
    summary,
    source: input.source,
    request: input.request,
    created_at: input.now.toISOString(),
  })
  return { id, summary }
}

export const proposeNoteTool = {
  name: "propose_note",
  strict: true,
  description:
    "Propose a note on one transaction, for a fact about that payment, such as what it was for (“wedding ring”). Find the transaction first with search_transactions and use its id. The note then comes back with the payment in every lookup. This stores a proposal and changes nothing until the owner confirms it with a button.",
  input_schema: {
    type: "object" as const,
    properties: {
      transaction_id: {
        type: "string",
        description: "The id from search_transactions",
      },
      note: {
        type: "string",
        description: "Short note, e.g. Wedding ring for my wife",
      },
    },
    additionalProperties: false,
    required: ["transaction_id", "note"],
  },
} satisfies import("@anthropic-ai/sdk").default.Tool

/** Strict check of the propose_note input. */
export function parseNoteInput(input: unknown): {
  transaction_id: string
  note: string
} {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new ProposalError("Tool input must be an object")
  const values = input as Record<string, unknown>
  for (const key of Object.keys(values))
    if (!["transaction_id", "note"].includes(key))
      throw new ProposalError("Unknown field " + key)
  const { transaction_id, note } = values
  if (typeof transaction_id !== "string" || !transaction_id.trim())
    throw new ProposalError(
      "transaction_id must be the id from search_transactions"
    )
  if (typeof note !== "string") throw new ProposalError("note must be a string")
  return { transaction_id: transaction_id.trim(), note }
}

// ---- Category rules: keyword → category for future uploads ----

const MIN_KEYWORD = 2
const MAX_KEYWORD = 40

async function currentRule(keyword: string) {
  const [row] = await db
    .select({ category: categoryRules.category })
    .from(categoryRules)
    .where(eq(categoryRules.keyword, keyword))
    .limit(1)
  return row?.category ?? ""
}

/**
 * Store a proposal to add or change a category rule. Rules apply to future
 * uploads; past payments keep their categories, and the summary says how
 * many match.
 */
export async function proposeRule(input: {
  keyword: string
  category: string
  source: ConversationSource
  request: string
  now: Date
}): Promise<{ id: string; summary: string }> {
  // Stored the same way the app's saveRule() stores keywords
  const keyword = input.keyword.replace(/\s+/g, " ").trim().toLowerCase()
  if (keyword.length < MIN_KEYWORD || keyword.length > MAX_KEYWORD)
    throw new ProposalError(
      `The keyword must be ${MIN_KEYWORD} to ${MAX_KEYWORD} characters`
    )
  if (!(CATEGORIES as readonly string[]).includes(input.category))
    throw new ProposalError("Use a category from the tool schema")
  if (OWED_CATEGORIES.includes(input.category))
    throw new ProposalError(
      "Repayments and things others paid for are set from Owed to you in the app, not by a rule"
    )
  const before = await currentRule(keyword)
  if (before === input.category)
    throw new ProposalError(`That rule already sends “${keyword}” to ${before}`)
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(transactions)
    .where(sql`instr(lower(${transactions.description}), ${keyword}) > 0`)
  const matches = `${count} past payment${count === 1 ? "" : "s"} match`
  const summary =
    `Rule: payments containing “${keyword}” go to ${input.category} (` +
    (before ? `replaces ${before}; ` : "") +
    `${matches}; they keep their categories)`
  const id = newId()
  await db.insert(agentProposals).values({
    id,
    kind: "rule",
    target: keyword,
    before,
    after: input.category,
    summary,
    source: input.source,
    request: input.request,
    created_at: input.now.toISOString(),
  })
  return { id, summary }
}

async function applyRule(
  proposal: Proposal,
  settle: Settle,
  lost: Lost,
  now: Date
): Promise<Result> {
  const conflict = {
    outcome: "conflict" as const,
    message: "Nothing changed: that rule has changed since this was proposed.",
  }
  if ((await currentRule(proposal.target)) !== proposal.before) {
    if (!(await settle("conflict"))) return lost
    return conflict
  }
  if (!(await settle("confirmed"))) return lost
  // Conditional write, and a log row only if it happened (lesson 22)
  const write = proposal.before
    ? db
        .update(categoryRules)
        .set({ category: proposal.after, created_at: now.toISOString() })
        .where(
          and(
            eq(categoryRules.keyword, proposal.target),
            eq(categoryRules.category, proposal.before)
          )
        )
    : db
        .insert(categoryRules)
        .values({
          id: newId(),
          keyword: proposal.target,
          category: proposal.after,
          created_at: now.toISOString(),
        })
        .onConflictDoNothing()
  let entry: { id: number } | undefined
  try {
    const [, logged] = await db.batch([
      write,
      db
        .insert(changeLog)
        .select(
          db
            .select({
              id: sql`null`.as("id"),
              created_at: sql`${now.toISOString()}`.as("created_at"),
              kind: sql`'rule'`.as("kind"),
              target: categoryRules.keyword,
              before: sql`${proposal.before}`.as("before"),
              after: categoryRules.category,
              source: sql`${proposal.source}`.as("source"),
              request: sql`${proposal.request}`.as("request"),
              proposal_id: sql`${proposal.id}`.as("proposal_id"),
              reverses_id: sql`null`.as("reverses_id"),
            })
            .from(categoryRules)
            .where(
              and(
                eq(categoryRules.keyword, proposal.target),
                eq(categoryRules.category, proposal.after),
                // only the row this write touched carries this timestamp
                eq(categoryRules.created_at, now.toISOString())
              )
            )
        )
        .returning({ id: changeLog.id }),
    ])
    entry = logged[0]
  } catch (error) {
    await reopenIfNothingWritten(proposal)
    throw error
  }
  if (!entry) {
    await db
      .update(agentProposals)
      .set({ status: "conflict" })
      .where(eq(agentProposals.id, proposal.id))
    return conflict
  }
  return {
    outcome: "applied",
    message: `Done: ${proposal.summary}. Change #${entry.id} in the change log.`,
  }
}

// ---- Shares: part of a payment someone else should cover ----

/** "Jane|40" ↔ { person, amount }; "" means no share. */
export function encodeShare(share: { person: string; amount: number } | null) {
  return share ? `${share.person}|${share.amount}` : ""
}
export function decodeShare(value: string) {
  if (!value) return null
  const at = value.lastIndexOf("|")
  return { person: value.slice(0, at), amount: Number(value.slice(at + 1)) }
}
/** How a share reads to the owner: "Jane owes $40", or "no share". */
export function describeShare(value: string) {
  const share = decodeShare(value)
  return share ? `${share.person} owes ${money(share.amount)}` : "no share"
}

async function currentShare(transactionId: string) {
  const [row] = await db
    .select({ person: owedEntries.person, amount: owedEntries.amount })
    .from(owedEntries)
    .where(
      and(
        eq(owedEntries.transaction_id, transactionId),
        eq(owedEntries.kind, "share")
      )
    )
    .limit(1)
  return encodeShare(row ?? null)
}

/**
 * Store a proposal to set someone's share of one payment, with the same
 * checks as the app: a bank payment out, and no more than its amount.
 */
export async function proposeShare(input: {
  transactionId: string
  person: string
  amount: number
  source: ConversationSource
  request: string
  now: Date
}): Promise<{ id: string; summary: string }> {
  let tx: Awaited<ReturnType<typeof getBankTransaction>>
  let person: string
  let amount: number
  try {
    tx = await getBankTransaction(input.transactionId)
    if (tx.amount >= 0)
      throw new OwedError("Only money you paid out can be split")
    person = await cleanPerson(input.person)
    amount = cleanAmount(input.amount, Math.abs(tx.amount))
  } catch (error) {
    if (error instanceof OwedError) throw new ProposalError(error.message)
    throw error
  }
  // Something else about owed money is already recorded on this payment
  const [other] = await db
    .select({ kind: owedEntries.kind })
    .from(owedEntries)
    .where(eq(owedEntries.transaction_id, tx.id))
    .limit(1)
  if (other && other.kind !== "share")
    throw new ProposalError("This payment is already recorded in Owed to you")
  const before = await currentShare(tx.id)
  const after = encodeShare({ person, amount })
  if (before === after) throw new ProposalError("That share is already set")
  const summary =
    `Share: ${describeShare(after)} of ${describePayment(tx)}` +
    (before ? ` (replaces ${describeShare(before)})` : "")
  const id = newId()
  await db.insert(agentProposals).values({
    id,
    kind: "share",
    target: tx.id,
    before,
    after,
    summary,
    source: input.source,
    request: input.request,
    created_at: input.now.toISOString(),
  })
  return { id, summary }
}

async function applyShare(
  proposal: Proposal,
  settle: Settle,
  lost: Lost,
  now: Date
): Promise<Result> {
  const conflict = {
    outcome: "conflict" as const,
    message:
      "Nothing changed: that payment's share has changed since this was proposed.",
  }
  if ((await currentShare(proposal.target)) !== proposal.before) {
    if (!(await settle("conflict"))) return lost
    return conflict
  }
  if (!(await settle("confirmed"))) return lost
  const after = decodeShare(proposal.after)!
  const before = decodeShare(proposal.before)
  const write = before
    ? db
        .update(owedEntries)
        .set({
          person: after.person,
          amount: after.amount,
          created_at: now.toISOString(),
        })
        .where(
          and(
            eq(owedEntries.transaction_id, proposal.target),
            eq(owedEntries.kind, "share"),
            eq(owedEntries.person, before.person),
            eq(owedEntries.amount, before.amount)
          )
        )
    : db
        .insert(owedEntries)
        .values({
          id: newId(),
          transaction_id: proposal.target,
          person: after.person,
          kind: "share",
          amount: after.amount,
          created_at: now.toISOString(),
        })
        .onConflictDoNothing()
  let entry: { id: number } | undefined
  try {
    const [, logged] = await db.batch([
      write,
      db
        .insert(changeLog)
        .select(
          db
            .select({
              id: sql`null`.as("id"),
              created_at: sql`${now.toISOString()}`.as("created_at"),
              kind: sql`'share'`.as("kind"),
              target: owedEntries.transaction_id,
              before: sql`${proposal.before}`.as("before"),
              after: sql`${proposal.after}`.as("after"),
              source: sql`${proposal.source}`.as("source"),
              request: sql`${proposal.request}`.as("request"),
              proposal_id: sql`${proposal.id}`.as("proposal_id"),
              reverses_id: sql`null`.as("reverses_id"),
            })
            .from(owedEntries)
            .where(
              and(
                eq(owedEntries.transaction_id, proposal.target),
                eq(owedEntries.kind, "share"),
                eq(owedEntries.person, after.person),
                eq(owedEntries.amount, after.amount),
                eq(owedEntries.created_at, now.toISOString())
              )
            )
        )
        .returning({ id: changeLog.id }),
    ])
    entry = logged[0]
  } catch (error) {
    await reopenIfNothingWritten(proposal)
    throw error
  }
  if (!entry) {
    await db
      .update(agentProposals)
      .set({ status: "conflict" })
      .where(eq(agentProposals.id, proposal.id))
    return conflict
  }
  return {
    outcome: "applied",
    message: `Done: ${proposal.summary}. Change #${entry.id} in the change log.`,
  }
}

// ---- Budgets: one monthly limit per spending category ----

/** How a budget limit reads: "$500", or "none". */
export function describeBudget(value: string) {
  return value ? money(Number(value)) : "none"
}

async function currentBudget(category: string) {
  const [row] = await db
    .select({ limit: budgets.monthly_limit })
    .from(budgets)
    .where(eq(budgets.category, category))
    .limit(1)
  return row ? String(row.limit) : ""
}

/**
 * Store a proposal to set or change one category's monthly budget, or to
 * remove it (amount null).
 */
export async function proposeBudget(input: {
  category: string
  amount: number | null
  source: ConversationSource
  request: string
  now: Date
}): Promise<{ id: string; summary: string }> {
  if (!(CATEGORIES as readonly string[]).includes(input.category))
    throw new ProposalError("Use a category from the tool schema")
  if (!BUDGET_CATEGORIES.includes(input.category))
    throw new ProposalError("Budgets are for spending categories only")
  let after = ""
  if (input.amount !== null)
    try {
      after = String(cleanAmount(input.amount))
    } catch (error) {
      if (error instanceof OwedError) throw new ProposalError(error.message)
      throw error
    }
  const before = await currentBudget(input.category)
  if (!before && !after)
    throw new ProposalError(`${input.category} has no budget to remove`)
  if (before === after)
    throw new ProposalError(`The budget is already ${describeBudget(after)}`)
  const summary = !after
    ? `Budget: remove ${input.category} (was ${describeBudget(before)} a month)`
    : `Budget: ${input.category} ${describeBudget(after)} a month` +
      (before ? ` (replaces ${describeBudget(before)})` : "")
  const id = newId()
  await db.insert(agentProposals).values({
    id,
    kind: "budget",
    target: input.category,
    before,
    after,
    summary,
    source: input.source,
    request: input.request,
    created_at: input.now.toISOString(),
  })
  return { id, summary }
}

async function applyBudget(
  proposal: Proposal,
  settle: Settle,
  lost: Lost,
  now: Date
): Promise<Result> {
  const conflict = {
    outcome: "conflict" as const,
    message:
      "Nothing changed: that budget has changed since this was proposed.",
  }
  if ((await currentBudget(proposal.target)) !== proposal.before) {
    if (!(await settle("conflict"))) return lost
    return conflict
  }
  if (!(await settle("confirmed"))) return lost
  const stamp = now.toISOString()
  if (!proposal.after) return removeBudget(proposal, conflict, stamp)
  const write = proposal.before
    ? db
        .update(budgets)
        .set({ monthly_limit: Number(proposal.after), updated_at: stamp })
        .where(
          and(
            eq(budgets.category, proposal.target),
            eq(budgets.monthly_limit, Number(proposal.before))
          )
        )
    : db
        .insert(budgets)
        .values({
          category: proposal.target,
          monthly_limit: Number(proposal.after),
          updated_at: stamp,
        })
        .onConflictDoNothing()
  let entry: { id: number } | undefined
  try {
    const [, logged] = await db.batch([
      write,
      db
        .insert(changeLog)
        .select(
          db
            .select({
              id: sql`null`.as("id"),
              created_at: sql`${stamp}`.as("created_at"),
              kind: sql`'budget'`.as("kind"),
              target: budgets.category,
              before: sql`${proposal.before}`.as("before"),
              after: sql`${proposal.after}`.as("after"),
              source: sql`${proposal.source}`.as("source"),
              request: sql`${proposal.request}`.as("request"),
              proposal_id: sql`${proposal.id}`.as("proposal_id"),
              reverses_id: sql`null`.as("reverses_id"),
            })
            .from(budgets)
            // only the row this write touched carries this timestamp
            .where(
              and(
                eq(budgets.category, proposal.target),
                eq(budgets.updated_at, stamp)
              )
            )
        )
        .returning({ id: changeLog.id }),
    ])
    entry = logged[0]
  } catch (error) {
    await reopenIfNothingWritten(proposal)
    throw error
  }
  if (!entry) {
    await db
      .update(agentProposals)
      .set({ status: "conflict" })
      .where(eq(agentProposals.id, proposal.id))
    return conflict
  }
  return {
    outcome: "applied",
    message: `Done: ${proposal.summary}. Change #${entry.id} in the change log.`,
  }
}

/** Confirmed removal: log the row while it is there, then delete it. */
async function removeBudget(
  proposal: Proposal,
  conflict: Result,
  stamp: string
): Promise<Result> {
  const stillBefore = and(
    eq(budgets.category, proposal.target),
    eq(budgets.monthly_limit, Number(proposal.before))
  )
  let entry: { id: number } | undefined
  try {
    const [logged] = await db.batch([
      db
        .insert(changeLog)
        .select(
          db
            .select({
              id: sql`null`.as("id"),
              created_at: sql`${stamp}`.as("created_at"),
              kind: sql`'budget'`.as("kind"),
              target: budgets.category,
              before: sql`${proposal.before}`.as("before"),
              after: sql`''`.as("after"),
              source: sql`${proposal.source}`.as("source"),
              request: sql`${proposal.request}`.as("request"),
              proposal_id: sql`${proposal.id}`.as("proposal_id"),
              reverses_id: sql`null`.as("reverses_id"),
            })
            .from(budgets)
            .where(stillBefore)
        )
        .returning({ id: changeLog.id }),
      db.delete(budgets).where(stillBefore),
    ])
    entry = logged[0]
  } catch (error) {
    await reopenIfNothingWritten(proposal)
    throw error
  }
  if (!entry) {
    await db
      .update(agentProposals)
      .set({ status: "conflict" })
      .where(eq(agentProposals.id, proposal.id))
    return conflict
  }
  return {
    outcome: "applied",
    message: `Done: ${proposal.summary}. Change #${entry.id} in the change log.`,
  }
}

export const proposeBudgetTool = {
  name: "propose_budget",
  strict: true,
  description:
    "Propose setting, changing or removing (amount null) the monthly budget for one spending category (e.g. cap Food & Drink at $500). To set several budgets in one message, call it once per category. Budgets run by calendar month in Singapore and don't roll over. This stores a proposal and changes nothing until the owner confirms it with a button.",
  input_schema: {
    type: "object" as const,
    properties: {
      category: { type: "string", enum: [...CATEGORIES] },
      amount: {
        type: ["number", "null"],
        description: "Monthly limit in SGD, or null to remove the budget",
      },
    },
    additionalProperties: false,
    required: ["category", "amount"],
  },
} satisfies import("@anthropic-ai/sdk").default.Tool

/** Strict check of the propose_budget input. */
export function parseBudgetInput(input: unknown) {
  const { category, amount } = strictObject(input, ["category", "amount"])
  if (typeof category !== "string")
    throw new ProposalError("category must be a string")
  if (
    amount !== null &&
    (typeof amount !== "number" || !Number.isFinite(amount))
  )
    throw new ProposalError("amount must be a number or null")
  return { category, amount: amount as number | null }
}

/** A memory by name, ignoring case (older memories may use capitals). */
async function findMemory(key: string) {
  const [row] = await db
    .select({ key: aiMemory.key, value: aiMemory.value })
    .from(aiMemory)
    .where(sql`lower(${aiMemory.key}) = ${key.toLowerCase()}`)
    .limit(1)
  return row
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
  const current = await findMemory(key)
  const before = current?.value ?? ""
  if (before === value) throw new ProposalError("That is already remembered")
  const summary =
    `Remember: ${value}` + (before ? ` (replaces: ${before})` : "")
  const id = newId()
  await db.insert(agentProposals).values({
    id,
    kind: "memory",
    // Replace an existing memory under its own name
    target: current?.key ?? key,
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

export const proposeRuleTool = {
  name: "propose_rule",
  strict: true,
  description:
    "Propose adding or changing a category rule: future uploads whose bank description contains the keyword go to the category (e.g. keyword grab → Transport). Past payments keep their categories; use propose_recategorise for those. This stores a proposal and changes nothing until the owner confirms it with a button.",
  input_schema: {
    type: "object" as const,
    properties: {
      keyword: {
        type: "string",
        description: "Text in the bank description, e.g. grab or fairprice",
      },
      category: { type: "string", enum: [...CATEGORIES] },
    },
    additionalProperties: false,
    required: ["keyword", "category"],
  },
} satisfies import("@anthropic-ai/sdk").default.Tool

export const proposeShareTool = {
  name: "propose_share",
  strict: true,
  description:
    "Propose that someone owes the owner part of one payment they made (e.g. Jane owes $40 of a $120 dinner). Find the payment first with search_transactions and use its id. Once confirmed, the owner's spending counts only their part and the person shows in Owed to you. This stores a proposal and changes nothing until the owner confirms it with a button.",
  input_schema: {
    type: "object" as const,
    properties: {
      transaction_id: {
        type: "string",
        description: "The id from search_transactions",
      },
      person: { type: "string", description: "Who owes it, e.g. Jane" },
      amount: { type: "number", description: "How much they owe, in SGD" },
    },
    additionalProperties: false,
    required: ["transaction_id", "person", "amount"],
  },
} satisfies import("@anthropic-ai/sdk").default.Tool

function strictObject(input: unknown, allowed: string[]) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new ProposalError("Tool input must be an object")
  for (const key of Object.keys(input))
    if (!allowed.includes(key)) throw new ProposalError("Unknown field " + key)
  return input as Record<string, unknown>
}

/** Strict check of the propose_rule input. */
export function parseRuleInput(input: unknown) {
  const { keyword, category } = strictObject(input, ["keyword", "category"])
  if (typeof keyword !== "string" || typeof category !== "string")
    throw new ProposalError("keyword and category must be strings")
  return { keyword, category }
}

/** Strict check of the propose_share input. */
export function parseShareInput(input: unknown) {
  const { transaction_id, person, amount } = strictObject(input, [
    "transaction_id",
    "person",
    "amount",
  ])
  if (typeof transaction_id !== "string" || !transaction_id.trim())
    throw new ProposalError(
      "transaction_id must be the id from search_transactions"
    )
  if (typeof person !== "string")
    throw new ProposalError("person must be a string")
  if (typeof amount !== "number" || !Number.isFinite(amount))
    throw new ProposalError("amount must be a number")
  return { transaction_id: transaction_id.trim(), person, amount }
}
