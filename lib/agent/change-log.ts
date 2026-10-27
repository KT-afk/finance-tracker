import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  notInArray,
  sql,
} from "drizzle-orm"
import type Anthropic from "@anthropic-ai/sdk"
import { db } from "../db"
import {
  aiMemory,
  changeLog,
  transactions,
  type ConversationSource,
} from "../schema"
import { describePayment, ProposalError } from "./proposals"

type Entry = typeof changeLog.$inferSelect

export type ChangeView = {
  id: number
  at: string
  kind: Entry["kind"]
  what: string // "Shopee $80 on 6 Sept 2026" or "memory “gym”"
  before: string // "" means none
  after: string
  source: Entry["source"]
  request: string
  reverses_id: number | null
}

/** Readable names for what each entry changed, looked up in one go. */
async function describe(entries: Entry[]): Promise<ChangeView[]> {
  const txIds = entries.filter((e) => e.kind !== "memory").map((e) => e.target)
  const txs = txIds.length
    ? await db
        .select()
        .from(transactions)
        .where(inArray(transactions.id, txIds))
    : []
  const byId = new Map(txs.map((t) => [t.id, t]))
  return entries.map((e) => {
    const tx = byId.get(e.target)
    return {
      id: e.id,
      at: e.created_at,
      kind: e.kind,
      what:
        e.kind === "memory"
          ? `memory “${e.target}”`
          : tx
            ? describePayment(tx)
            : "a transaction that no longer exists",
      before: e.before,
      after: e.after,
      source: e.source,
      request: e.request,
      reverses_id: e.reverses_id,
    }
  })
}

/** Start of a Singapore day as a UTC timestamp, to compare with created_at. */
function singaporeMidnight(date: string): string {
  return new Date(`${date}T00:00:00+08:00`).toISOString()
}

/** Change log entries, newest first. since is a YYYY-MM-DD date in Singapore. */
export async function listChanges(options: {
  since?: string
  limit?: number
}): Promise<ChangeView[]> {
  const rows = await db
    .select()
    .from(changeLog)
    .where(
      options.since
        ? gte(changeLog.created_at, singaporeMidnight(options.since))
        : undefined
    )
    .orderBy(desc(changeLog.id))
    .limit(options.limit ?? 20)
  return describe(rows)
}

export type UndoOutcome = "undone" | "conflict" | "not_found"

/**
 * Undo one entry (the newest when id is undefined) straight away: put back
 * its "before" value, only if the target still has its "after" value, and
 * record the undo as its own entry pointing at it. Entries are never
 * edited or deleted; undoing an undo puts the change back.
 */
export async function undoChange(
  id: number | undefined,
  ctx: { source: ConversationSource; request: string; now: Date }
): Promise<{ outcome: UndoOutcome; message: string }> {
  // "The last change" is the newest real change not already undone, so
  // saying it twice undoes two changes rather than redoing the first
  const reversed = db
    .select({ id: changeLog.reverses_id })
    .from(changeLog)
    .where(isNotNull(changeLog.reverses_id))
  const [entry] = await db
    .select()
    .from(changeLog)
    .where(
      id === undefined
        ? and(isNull(changeLog.reverses_id), notInArray(changeLog.id, reversed))
        : eq(changeLog.id, id)
    )
    .orderBy(desc(changeLog.id))
    .limit(1)
  if (!entry)
    return {
      outcome: "not_found",
      message:
        id === undefined
          ? "There is no change left to undo."
          : `There is no change #${id}.`,
    }
  const [view] = await describe([entry])

  // Like every write here (book lesson 22): the log row and the change are
  // in one batch, and both require the target to still have "after"
  const logRow = (source: { target: unknown; current: unknown }) => ({
    id: sql`null`.as("id"),
    created_at: sql`${ctx.now.toISOString()}`.as("created_at"),
    kind: sql`${entry.kind}`.as("kind"),
    target: sql`${source.target}`.as("target"),
    before: sql`${source.current}`.as("before"),
    after: sql`${entry.before}`.as("after"),
    source: sql`${ctx.source}`.as("source"),
    request: sql`${ctx.request}`.as("request"),
    proposal_id: sql`null`.as("proposal_id"),
    reverses_id: sql`${entry.id}`.as("reverses_id"),
  })

  let logged: { id: number }[]
  let current: string | undefined
  if (entry.kind === "memory") {
    const stillAfter = and(
      eq(aiMemory.key, entry.target),
      eq(aiMemory.value, entry.after)
    )
    const [log] = await db.batch([
      db
        .insert(changeLog)
        .select(
          db
            .select(logRow({ target: aiMemory.key, current: aiMemory.value }))
            .from(aiMemory)
            .where(stillAfter)
        )
        .returning({ id: changeLog.id }),
      // A memory that didn't exist before is removed again
      entry.before
        ? db.update(aiMemory).set({ value: entry.before }).where(stillAfter)
        : db.delete(aiMemory).where(stillAfter),
    ])
    logged = log
    if (!logged.length)
      current =
        (
          await db
            .select({ value: aiMemory.value })
            .from(aiMemory)
            .where(eq(aiMemory.key, entry.target))
        )[0]?.value ?? ""
  } else {
    const column =
      entry.kind === "note"
        ? sql<string>`coalesce(${transactions.note}, '')`
        : sql<string>`${transactions.category}`
    const stillAfter = and(
      eq(transactions.id, entry.target),
      sql`${column} = ${entry.after}`
    )
    const [log] = await db.batch([
      db
        .insert(changeLog)
        .select(
          db
            .select(logRow({ target: transactions.id, current: column }))
            .from(transactions)
            .where(stillAfter)
        )
        .returning({ id: changeLog.id }),
      db
        .update(transactions)
        .set(
          entry.kind === "note"
            ? { note: entry.before || null }
            : { category: entry.before }
        )
        .where(stillAfter),
    ])
    logged = log
    if (!logged.length)
      current = (
        await db
          .select({ value: column })
          .from(transactions)
          .where(eq(transactions.id, entry.target))
      )[0]?.value
  }

  if (!logged.length) {
    const shown = (v: string | undefined) => (v ? v : "none")
    return {
      outcome: "conflict",
      message:
        current === undefined
          ? `Nothing changed: ${view.what} no longer exists.`
          : `Nothing changed: ${view.what} is now ${shown(current)}, not ${shown(entry.after)}, so #${entry.id} can't be undone.`,
    }
  }
  const before = entry.before || "none"
  return {
    outcome: "undone",
    message: `Undid #${entry.id} on ${view.what}: back to ${before}. Change #${logged[0].id} in the change log.`,
  }
}

export const listChangesTool = {
  name: "list_changes",
  strict: true,
  description:
    "Read the change log: every change the owner confirmed (categories, notes, memories) and every undo, newest first, with before and after. Use it for questions like “what did you change this week?”. since is an ISO date YYYY-MM-DD.",
  input_schema: {
    type: "object" as const,
    properties: {
      since: { type: "string", description: "ISO date YYYY-MM-DD, inclusive" },
      limit: { type: "integer", description: "At most this many, up to 50" },
    },
    additionalProperties: false,
    required: [],
  },
} satisfies Anthropic.Tool

export const undoChangeTool = {
  name: "undo_change",
  strict: true,
  description:
    "Undo one change log entry straight away, without asking for a tap: “undo the last change” (leave change_id out: the newest change not already undone) or “undo #12” (change_id 12; giving the # of an undo puts that change back). It only works if nothing has changed the same thing since; otherwise it explains and changes nothing. Report the result as given.",
  input_schema: {
    type: "object" as const,
    properties: {
      change_id: { type: "integer", description: "The # of the entry" },
    },
    additionalProperties: false,
    required: [],
  },
} satisfies Anthropic.Tool

function checkKeys(input: unknown, allowed: string[]) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new ProposalError("Tool input must be an object")
  for (const key of Object.keys(input))
    if (!allowed.includes(key)) throw new ProposalError("Unknown field " + key)
  return input as Record<string, unknown>
}

/** Strict check of list_changes input. */
export function parseListInput(input: unknown): {
  since?: string
  limit: number
} {
  const { since, limit } = checkKeys(input, ["since", "limit"])
  if (
    since !== undefined &&
    (typeof since !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(since) ||
      new Date(`${since}T00:00:00Z`).toISOString().slice(0, 10) !== since)
  )
    throw new ProposalError("since must be a valid YYYY-MM-DD date")
  if (
    limit !== undefined &&
    (typeof limit !== "number" ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50)
  )
    throw new ProposalError("limit must be a whole number from 1 to 50")
  return {
    ...(typeof since === "string" ? { since } : {}),
    limit: typeof limit === "number" ? limit : 20,
  }
}

/** Strict check of undo_change input. */
export function parseUndoInput(input: unknown): { change_id?: number } {
  const { change_id } = checkKeys(input, ["change_id"])
  if (
    change_id !== undefined &&
    (typeof change_id !== "number" ||
      !Number.isInteger(change_id) ||
      change_id < 1)
  )
    throw new ProposalError("change_id must be the # of a change log entry")
  return change_id === undefined ? {} : { change_id }
}
