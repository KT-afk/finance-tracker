import { randomBytes, randomUUID } from "node:crypto"
import { and, desc, eq, gte, sql, type SQL } from "drizzle-orm"
import type { BatchItem } from "drizzle-orm/batch"
import { BUDGET_CATEGORIES } from "../budgets"
import { db } from "../db"
import {
  cleanAmount,
  cleanPerson,
  getBankTransaction,
  OwedError,
} from "../owed"
import {
  tripPayments,
  trips,
  agentProposals,
  aiMemory,
  budgets,
  categoryRules,
  owedEntries,
  CATEGORIES,
  changeLog,
  OFF_BANK,
  OWED_CATEGORIES,
  SPEND_CATEGORIES,
  transactions,
  type ConversationSource,
  type ProposalStatus,
} from "../schema"
import {
  decodeShare,
  describeBudget,
  describePayment,
  describeShare,
  encodeShare,
  money,
  decodeCash,
  decodeTrip,
  describeCash,
  describeTrip,
  encodeCash,
  encodeTrip,
  type TripValue,
} from "./proposal-format"
import {
  cleanTripName,
  findTrip,
  tripKey,
  tripLabel,
  tripSpending,
} from "./trip-spending"
import type { Decision, DecisionOutcome, Proposal } from "./proposal-types"

/** Why a proposal can't be made; the message goes back to the agent. */
export class ProposalError extends Error {}

// After this a button does nothing: an old proposal may no longer match
// what the owner had in mind
const EXPIRES_AFTER_MS = 24 * 60 * 60 * 1000

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
}): Promise<Proposal> {
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

const ENDINGS = {
  expired: {
    outcome: "expired",
    message:
      "This proposal expired (older than 24 hours). Nothing changed. Ask again if you still want it.",
  },
  rejected: { outcome: "rejected", message: "Rejected. Nothing changed." },
} as const

export type { Decision, DecisionOutcome, Proposal }

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

  // Expired or rejected: claim it and say so; a lost race says it was used
  const ending: "expired" | "rejected" | null =
    now.getTime() - new Date(proposal.created_at).getTime() > EXPIRES_AFTER_MS
      ? "expired"
      : decision === "reject"
        ? "rejected"
        : null
  if (ending) return (await settle(ending)) ? ENDINGS[ending] : lost

  if (proposal.kind === "memory")
    return applyMemory(proposal, settle, lost, now)
  if (proposal.kind === "note") return applyNote(proposal, settle, lost, now)
  if (proposal.kind === "rule") return applyRule(proposal, settle, lost, now)
  if (proposal.kind === "share") return applyShare(proposal, settle, lost, now)
  if (proposal.kind === "budget")
    return applyBudget(proposal, settle, lost, now)
  if (proposal.kind === "trip") return applyTrip(proposal, settle, lost, now)
  if (proposal.kind === "cash_payment")
    return applyCashPayment(proposal, settle, lost, now)
  if (proposal.kind === "trip_payment")
    return applyTripPayment(proposal, settle, lost, now)
  return applyRecategorise(proposal, settle, lost, now)
}

type ProposalRow = typeof agentProposals.$inferSelect
type Settle = (status: ProposalStatus) => Promise<boolean>
type Lost = { outcome: "used"; message: string }
type Result = { outcome: DecisionOutcome; message: string }

/** The batch failed: let the owner tap again, unless it in fact landed. */
async function reopenIfNothingWritten(proposal: ProposalRow) {
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
  proposal: ProposalRow,
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
  proposal: ProposalRow,
  settle: Settle,
  lost: Lost,
  now: Date
): Promise<Result> {
  const conflict = {
    outcome: "conflict" as const,
    message:
      "Nothing changed: that memory has changed since this was proposed.",
  }
  const current = await currentMemory(proposal.target)
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
  proposal: ProposalRow,
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
}): Promise<Proposal> {
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
}): Promise<Proposal> {
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
  proposal: ProposalRow,
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
}): Promise<Proposal> {
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
  proposal: ProposalRow,
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
}): Promise<Proposal> {
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
  proposal: ProposalRow,
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
  proposal: ProposalRow,
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

/** A memory by name, ignoring case (older memories may use capitals). */
async function currentMemory(key: string) {
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
}): Promise<Proposal> {
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
  const current = await currentMemory(key)
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

/**
 * Proposals from the last 24 hours with what became of them, newest first.
 * The agent gets these with every question: a button tap never reaches the
 * conversation, so without them it would think a confirmed change is
 * still waiting.
 */
export async function recentProposals(now: Date) {
  const rows = await db
    .select({
      summary: agentProposals.summary,
      status: agentProposals.status,
      created_at: agentProposals.created_at,
    })
    .from(agentProposals)
    .where(
      gte(
        agentProposals.created_at,
        new Date(now.getTime() - EXPIRES_AFTER_MS).toISOString()
      )
    )
    .orderBy(desc(agentProposals.created_at))
    .limit(10)
  return rows
}

// ---- Trips: a name and dates, and payments added to or left out of one ----

const MAX_TRIP_NAME = 40

async function currentTrip(key: string) {
  const trip = await findTrip(key)
  return trip
    ? encodeTrip({
        name: trip.name,
        date_from: trip.date_from,
        date_to: trip.date_to,
        country: trip.country,
      })
    : ""
}

/** Store a proposal to save a trip, or change a saved one's dates. */
export async function proposeTrip(input: {
  name: string
  date_from: string
  date_to: string
  country: string | null
  source: ConversationSource
  request: string
  now: Date
}): Promise<Proposal> {
  const name = cleanTripName(input.name)
  if (!name || name.length > MAX_TRIP_NAME || name.includes("|"))
    throw new ProposalError(
      `Give the trip a short name, up to ${MAX_TRIP_NAME} characters`
    )
  const after: TripValue = {
    name,
    date_from: input.date_from,
    date_to: input.date_to,
    country: input.country,
  }
  const key = tripKey(name)
  const before = await currentTrip(key)
  if (before === encodeTrip(after))
    throw new ProposalError("That trip is already saved")
  const found = await tripSpending({
    date_from: after.date_from,
    date_to: after.date_to,
    country: after.country ?? undefined,
  })
  const summary =
    `Trip: ${describeTrip(encodeTrip(after))}: ${found.count} payments abroad, ${money(found.total)}` +
    (before ? ` (replaces ${describeTrip(before)})` : "")
  const id = newId()
  await db.insert(agentProposals).values({
    id,
    kind: "trip",
    target: key,
    before,
    after: encodeTrip(after),
    summary,
    source: input.source,
    request: input.request,
    created_at: input.now.toISOString(),
  })
  return { id, summary }
}

async function applyTrip(
  proposal: ProposalRow,
  settle: Settle,
  lost: Lost,
  now: Date
): Promise<Result> {
  const conflict = {
    outcome: "conflict" as const,
    message: "Nothing changed: that trip has changed since this was proposed.",
  }
  if ((await currentTrip(proposal.target)) !== proposal.before) {
    if (!(await settle("conflict"))) return lost
    return conflict
  }
  if (!(await settle("confirmed"))) return lost
  const stamp = now.toISOString()
  const after = decodeTrip(proposal.after)!
  const before = decodeTrip(proposal.before)
  // The trip still exactly as it was (every field), or still not saved
  const stillBefore = before
    ? and(
        eq(trips.key, proposal.target),
        eq(trips.name, before.name),
        eq(trips.date_from, before.date_from),
        eq(trips.date_to, before.date_to),
        sql`${trips.country} is ${before.country}`
      )
    : undefined
  const condition = stillBefore
    ? sql`exists (select 1 from ${trips} where ${stillBefore})`
    : sql`not exists (select 1 from ${trips} where ${trips.key} = ${proposal.target})`
  return logFirst(
    proposal,
    conflict,
    stamp,
    condition,
    stillBefore
      ? db
          .update(trips)
          .set({ ...after, updated_at: stamp })
          .where(stillBefore)
      : db
          .insert(trips)
          .values({ key: proposal.target, ...after, updated_at: stamp })
          .onConflictDoNothing()
  )
}

/**
 * Store a proposal to add a payment to a trip (a flight, a hotel, a cash
 * entry) or leave one out of it.
 */
export async function proposeTripPayment(input: {
  trip: string
  transactionId: string
  include: boolean
  source: ConversationSource
  request: string
  now: Date
}): Promise<Proposal> {
  const trip = await findTrip(input.trip)
  if (!trip)
    throw new ProposalError(
      `No saved trip called “${input.trip}”; propose_trip first`
    )
  const [tx] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, input.transactionId))
    .limit(1)
  if (!tx) throw new ProposalError("Transaction not found; search for it first")
  const target = `${trip.key}|${tx.id}`
  const before = await currentTripMark(target)
  const after = input.include ? "in" : "out"
  if (before === after)
    throw new ProposalError(
      input.include
        ? "It is already added to that trip"
        : "It is already left out"
    )
  const summary = `${input.include ? "Add to" : "Leave out of"} ${trip.name} trip: ${describePayment(tx)}`
  const id = newId()
  await db.insert(agentProposals).values({
    id,
    kind: "trip_payment",
    target,
    before,
    after,
    summary,
    source: input.source,
    request: input.request,
    created_at: input.now.toISOString(),
  })
  return { id, summary }
}

/** "in", "out", or "" for a payment neither added to nor left out of a trip. */
export async function currentTripMark(target: string) {
  const [key, transactionId] = splitTripTarget(target)
  const [row] = await db
    .select({ included: tripPayments.included })
    .from(tripPayments)
    .where(
      and(
        eq(tripPayments.trip_key, key),
        eq(tripPayments.transaction_id, transactionId)
      )
    )
    .limit(1)
  return row ? (row.included ? "in" : "out") : ""
}

export function splitTripTarget(target: string): [string, string] {
  const at = target.lastIndexOf("|")
  return [target.slice(0, at), target.slice(at + 1)]
}

async function applyTripPayment(
  proposal: ProposalRow,
  settle: Settle,
  lost: Lost,
  now: Date
): Promise<Result> {
  const conflict = {
    outcome: "conflict" as const,
    message:
      "Nothing changed: that payment's place in the trip has changed since this was proposed.",
  }
  const [key, transactionId] = splitTripTarget(proposal.target)
  if (
    !(await findTrip(key)) ||
    (await currentTripMark(proposal.target)) !== proposal.before
  ) {
    if (!(await settle("conflict"))) return lost
    return conflict
  }
  if (!(await settle("confirmed"))) return lost
  const stamp = now.toISOString()
  const included = proposal.after === "in"
  // The trip still saved, and the payment's mark still as it was
  const tripExists = sql`exists (select 1 from ${trips} where ${trips.key} = ${key})`
  const markIs = and(
    eq(tripPayments.trip_key, key),
    eq(tripPayments.transaction_id, transactionId)
  )
  const stillBefore = proposal.before
    ? and(markIs, eq(tripPayments.included, proposal.before === "in"))
    : undefined
  const condition = and(
    tripExists,
    stillBefore
      ? sql`exists (select 1 from ${tripPayments} where ${stillBefore})`
      : sql`not exists (select 1 from ${tripPayments} where ${markIs})`
  )!
  return logFirst(
    proposal,
    conflict,
    stamp,
    condition,
    stillBefore
      ? db
          .update(tripPayments)
          .set({ included, updated_at: stamp })
          .where(and(stillBefore, tripExists))
      : db.insert(tripPayments).select(
          db
            .select({
              trip_key: sql`${key}`.as("trip_key"),
              transaction_id: sql`${transactionId}`.as("transaction_id"),
              included: sql`${included ? 1 : 0}`.as("included"),
              updated_at: sql`${stamp}`.as("updated_at"),
            })
            .from(agentProposals)
            .where(and(eq(agentProposals.id, proposal.id), condition))
        )
  )
}

/**
 * The change-log row, then the write, in one batch, both on the same
 * condition (book lessons 22 and 26). The proposal's own row is the
 * one-row source for the log row, so it exists only if the condition holds.
 */
async function logFirst(
  proposal: ProposalRow,
  conflict: Result,
  stamp: string,
  condition: SQL,
  write: BatchItem<"sqlite">
): Promise<Result> {
  let entry: { id: number } | undefined
  try {
    const [rows] = await db.batch([
      db
        .insert(changeLog)
        .select(
          db
            .select({
              id: sql`null`.as("id"),
              created_at: sql`${stamp}`.as("created_at"),
              kind: sql`${proposal.kind}`.as("kind"),
              target: sql`${proposal.target}`.as("target"),
              before: sql`${proposal.before}`.as("before"),
              after: sql`${proposal.after}`.as("after"),
              source: sql`${proposal.source}`.as("source"),
              request: sql`${proposal.request}`.as("request"),
              proposal_id: sql`${proposal.id}`.as("proposal_id"),
              reverses_id: sql`null`.as("reverses_id"),
            })
            .from(agentProposals)
            .where(and(eq(agentProposals.id, proposal.id), condition))
        )
        .returning({ id: changeLog.id }),
      write,
    ])
    entry = rows[0]
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

// ---- Cash payments: spending that no bank statement will show ----

const MAX_CASH = 10_000
const MAX_CASH_TEXT = 80

/**
 * Store a proposal to add a cash payment (it goes in as a hand-entered
 * payment with no bank), optionally adding it to a saved trip.
 */
export async function proposeCashPayment(input: {
  date: string
  amount: number
  category: string
  description: string
  trip: string | null
  source: ConversationSource
  request: string
  now: Date
}): Promise<Proposal> {
  const description = input.description.replace(/\s+/g, " ").trim()
  if (description.length < 2 || description.length > MAX_CASH_TEXT)
    throw new ProposalError(
      `Describe it in 2 to ${MAX_CASH_TEXT} characters, e.g. Korea trip cash`
    )
  if (!Number.isFinite(input.amount) || input.amount <= 0)
    throw new ProposalError("The amount must be more than 0")
  if (input.amount > MAX_CASH)
    throw new ProposalError(
      `That is more than ${money(MAX_CASH)}; add it on the Transactions page instead`
    )
  if (!BUDGET_CATEGORIES.includes(input.category))
    throw new ProposalError("Use a spending category")
  const today = new Date(input.now.getTime() + 8 * 3_600_000)
    .toISOString()
    .slice(0, 10)
  if (input.date > today) throw new ProposalError("The date is in the future")
  let tripKeyValue: string | null = null
  let tripName = ""
  if (input.trip) {
    const trip = await findTrip(input.trip)
    if (!trip)
      throw new ProposalError(
        `No saved trip called “${input.trip}”; propose_trip first, or leave trip empty`
      )
    tripKeyValue = trip.key
    tripName = trip.name
  }
  const after = encodeCash({
    date: input.date,
    amount: Math.round(input.amount * 100) / 100,
    category: input.category,
    description,
    trip: tripKeyValue,
  })
  const summary =
    `New cash payment: ${describeCash(after)}, “${description}”` +
    (tripKeyValue ? `, added to the ${tripLabel(tripName)}` : "")
  const id = newId()
  await db.insert(agentProposals).values({
    id,
    kind: "cash_payment",
    // The payment's id, chosen now so the log and undo can name it
    target: randomUUID(),
    before: "",
    after,
    summary,
    source: input.source,
    request: input.request,
    created_at: input.now.toISOString(),
  })
  return { id, summary }
}

async function applyCashPayment(
  proposal: ProposalRow,
  settle: Settle,
  lost: Lost,
  now: Date
): Promise<Result> {
  const conflict = {
    outcome: "conflict" as const,
    message: "Nothing changed: that payment already exists.",
  }
  if (!(await settle("confirmed"))) return lost
  const cash = decodeCash(proposal.after)!
  const stamp = now.toISOString()
  const notThere = sql`not exists (select 1 from ${transactions} where ${transactions.id} = ${proposal.target})`
  const fromProposal = and(eq(agentProposals.id, proposal.id), notThere)
  // Log row, payment and trip mark, all on the same condition
  let entry: { id: number } | undefined
  try {
    const [rows] = await db.batch([
      db
        .insert(changeLog)
        .select(
          db
            .select({
              id: sql`null`.as("id"),
              created_at: sql`${stamp}`.as("created_at"),
              kind: sql`'cash_payment'`.as("kind"),
              target: sql`${proposal.target}`.as("target"),
              before: sql`''`.as("before"),
              after: sql`${proposal.after}`.as("after"),
              source: sql`${proposal.source}`.as("source"),
              request: sql`${proposal.request}`.as("request"),
              proposal_id: sql`${proposal.id}`.as("proposal_id"),
              reverses_id: sql`null`.as("reverses_id"),
            })
            .from(agentProposals)
            .where(fromProposal)
        )
        .returning({ id: changeLog.id }),
      ...(cash.trip
        ? [
            db.insert(tripPayments).select(
              db
                .select({
                  trip_key: sql`${cash.trip}`.as("trip_key"),
                  transaction_id: sql`${proposal.target}`.as("transaction_id"),
                  included: sql`1`.as("included"),
                  updated_at: sql`${stamp}`.as("updated_at"),
                })
                .from(agentProposals)
                .where(
                  and(
                    fromProposal,
                    sql`exists (select 1 from ${trips} where ${trips.key} = ${cash.trip})`
                  )
                )
            ),
          ]
        : []),
      // The id is the table's key, so this inserts only when the payment
      // isn't there: the same condition as the log row
      db
        .insert(transactions)
        .values({
          id: proposal.target,
          date: cash.date,
          description: cash.description,
          amount: -cash.amount,
          bank: OFF_BANK,
          category: cash.category,
          is_corrected: true,
          hash: "manual:" + proposal.target,
          uploaded_at: stamp,
        })
        .onConflictDoNothing(),
    ] as unknown as Parameters<typeof db.batch>[0])
    entry = (rows as { id: number }[])[0]
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
