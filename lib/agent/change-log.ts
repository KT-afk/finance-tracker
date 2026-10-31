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
  budgets,
  tripPayments,
  trips,
  OFF_BANK,
  categoryRules,
  changeLog,
  owedEntries,
  transactions,
  type ConversationSource,
} from "../schema"
import {
  decodeShare,
  describeBudget,
  describePayment,
  describeShare,
  decodeCash,
  decodeTrip,
  describeCash,
  describeTrip,
  describeTripMark,
  cashPaymentRow,
} from "./proposal-format"
import { ProposalError, splitTripTarget } from "./proposals"
import { tripLabel } from "./trip-spending"

type Entry = typeof changeLog.$inferSelect

/** Shares ("person|amount") and budgets ("200") are stored raw; show words. */
function shownValue(kind: Entry["kind"], value: string) {
  if (kind === "share") return describeShare(value)
  if (kind === "budget") return describeBudget(value)
  if (kind === "trip") return describeTrip(value)
  if (kind === "trip_payment") return describeTripMark(value)
  if (kind === "cash_payment") return describeCash(value)
  return value
}

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
  // Memories and rules are named by their key; the rest are payments
  const onPayment = (e: Entry) =>
    e.kind === "recategorise" || e.kind === "note" || e.kind === "share"
  const txIds = [
    ...entries.filter(onPayment).map((e) => e.target),
    ...entries
      .filter((e) => e.kind === "trip_payment")
      .map((e) => splitTripTarget(e.target)[1]),
  ]
  const txs = txIds.length
    ? await db
        .select()
        .from(transactions)
        .where(inArray(transactions.id, txIds))
    : []
  const byId = new Map(txs.map((t) => [t.id, t]))
  // Trip names as saved, for entries that only carry the lowercased key
  const tripNames = entries.some((e) => e.kind === "trip_payment")
    ? new Map((await db.select().from(trips)).map((t) => [t.key, t.name]))
    : new Map<string, string>()
  return entries.map((e) => {
    const tx = byId.get(
      e.kind === "trip_payment" ? splitTripTarget(e.target)[1] : e.target
    )
    return {
      id: e.id,
      at: e.created_at,
      kind: e.kind,
      what:
        e.kind === "memory"
          ? `memory “${e.target}”`
          : e.kind === "rule"
            ? `rule “${e.target}”`
            : e.kind === "budget"
              ? `budget for ${e.target}`
              : e.kind === "cash_payment"
                ? `cash payment “${decodeCash(e.after || e.before)?.description ?? e.target}”`
                : e.kind === "trip"
                  ? `trip “${decodeTrip(e.after || e.before)?.name ?? e.target}”`
                  : e.kind === "trip_payment"
                    ? `${tripLabel(tripNames.get(splitTripTarget(e.target)[0]) ?? splitTripTarget(e.target)[0])}: ${tx ? describePayment(tx) : "a transaction that no longer exists"}`
                    : tx
                      ? describePayment(tx)
                      : "a transaction that no longer exists",
      before: shownValue(e.kind, e.before),
      after: shownValue(e.kind, e.after),
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

/**
 * Forget a memory from the Ask page: deleted and logged in one batch, so
 * “undo” in chat can bring it back. False if it was already gone.
 */
export async function forgetMemory(
  id: number,
  ctx: { now: Date }
): Promise<boolean> {
  const [logged] = await db.batch([
    db
      .insert(changeLog)
      .select(
        db
          .select({
            id: sql`null`.as("id"),
            created_at: sql`${ctx.now.toISOString()}`.as("created_at"),
            kind: sql`'memory'`.as("kind"),
            target: aiMemory.key,
            before: aiMemory.value,
            after: sql`''`.as("after"),
            source: sql`'web'`.as("source"),
            request: sql<string>`'Ask page: forget ' || ${aiMemory.key}`.as(
              "request"
            ),
            proposal_id: sql`null`.as("proposal_id"),
            reverses_id: sql`null`.as("reverses_id"),
          })
          .from(aiMemory)
          .where(eq(aiMemory.id, id))
      )
      .returning({ id: changeLog.id }),
    db.delete(aiMemory).where(eq(aiMemory.id, id)),
  ])
  return logged.length > 0
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
  if (entry.kind === "rule") {
    const stillAfter = and(
      eq(categoryRules.keyword, entry.target),
      eq(categoryRules.category, entry.after)
    )
    const [log] = await db.batch([
      db
        .insert(changeLog)
        .select(
          db
            .select(
              logRow({ target: categoryRules.keyword, current: entry.after })
            )
            .from(categoryRules)
            .where(stillAfter)
        )
        .returning({ id: changeLog.id }),
      // A rule that didn't exist before is removed again
      entry.before
        ? db
            .update(categoryRules)
            .set({ category: entry.before })
            .where(stillAfter)
        : db.delete(categoryRules).where(stillAfter),
    ])
    logged = log
    if (!logged.length)
      current =
        (
          await db
            .select({ value: categoryRules.category })
            .from(categoryRules)
            .where(eq(categoryRules.keyword, entry.target))
        )[0]?.value ?? ""
  } else if (entry.kind === "cash_payment") {
    // Undo removes the payment (and its place in a trip) only if it is
    // unchanged and nobody split it; undoing that puts it back
    const removing = Boolean(entry.after)
    const cash = decodeCash(entry.after || entry.before)!
    const unchanged = sql`exists (select 1 from ${transactions} where ${transactions.id} = ${entry.target} and ${transactions.amount} = ${-cash.amount} and ${transactions.date} = ${cash.date} and ${transactions.category} = ${cash.category} and ${transactions.description} = ${cash.description}) and not exists (select 1 from ${owedEntries} where ${owedEntries.transaction_id} = ${entry.target})`
    const absent = sql`not exists (select 1 from ${transactions} where ${transactions.id} = ${entry.target})`
    // Putting it back into a trip needs the trip still saved, for the
    // whole batch, as when it was first added
    const tripSaved = cash.trip
      ? sql` and exists (select 1 from ${trips} where ${trips.key} = ${cash.trip})`
      : sql``
    const condition = removing ? unchanged : sql`${absent}${tripSaved}`
    const stamp = ctx.now.toISOString()
    const fromEntry = and(eq(changeLog.id, entry.id), condition)
    const [log] = await db.batch([
      db
        .insert(changeLog)
        .select(
          db
            .select(logRow({ target: entry.target, current: entry.after }))
            .from(changeLog)
            .where(fromEntry)
        )
        .returning({ id: changeLog.id }),
      ...(removing
        ? [
            db
              .delete(tripPayments)
              .where(
                and(eq(tripPayments.transaction_id, entry.target), condition)
              ),
            db
              .delete(transactions)
              .where(and(eq(transactions.id, entry.target), condition)),
          ]
        : [
            ...(cash.trip
              ? [
                  db.insert(tripPayments).select(
                    db
                      .select({
                        trip_key: sql`${cash.trip}`.as("trip_key"),
                        transaction_id: sql`${entry.target}`.as(
                          "transaction_id"
                        ),
                        included: sql`1`.as("included"),
                        updated_at: sql`${stamp}`.as("updated_at"),
                      })
                      .from(changeLog)
                      .where(
                        and(
                          fromEntry,
                          sql`not exists (select 1 from ${tripPayments} where ${tripPayments.trip_key} = ${cash.trip} and ${tripPayments.transaction_id} = ${entry.target})`
                        )
                      )
                  ),
                ]
              : []),
            db.insert(transactions).select(
              db
                .select(cashPaymentRow(entry.target, cash, stamp))
                .from(changeLog)
                .where(fromEntry)
            ),
          ]),
    ] as unknown as Parameters<typeof db.batch>[0])
    logged = log as { id: number }[]
    if (!logged.length)
      current = removing ? "changed or split since" : "already there"
  } else if (
    (entry.kind === "trip" || entry.kind === "trip_payment") &&
    !entry.after
  ) {
    // Undo of a removal (itself an undo): put it back if nothing has been
    // saved there since. The log row comes first, from the entry itself
    const [key, transactionId] =
      entry.kind === "trip" ? [entry.target, ""] : splitTripTarget(entry.target)
    const stamp = ctx.now.toISOString()
    const nothingThere =
      entry.kind === "trip"
        ? sql`not exists (select 1 from ${trips} where ${trips.key} = ${key})`
        : sql`not exists (select 1 from ${tripPayments} where ${tripPayments.trip_key} = ${key} and ${tripPayments.transaction_id} = ${transactionId})`
    const before = decodeTrip(entry.kind === "trip" ? entry.before : "")
    const [log] = await db.batch([
      db
        .insert(changeLog)
        .select(
          db
            .select(logRow({ target: entry.target, current: "" }))
            .from(changeLog)
            .where(and(eq(changeLog.id, entry.id), nothingThere))
        )
        .returning({ id: changeLog.id }),
      entry.kind === "trip"
        ? db
            .insert(trips)
            .values({ key, ...before!, updated_at: stamp })
            .onConflictDoNothing()
        : db
            .insert(tripPayments)
            .values({
              trip_key: key,
              transaction_id: transactionId,
              included: entry.before === "in",
              updated_at: stamp,
            })
            .onConflictDoNothing(),
    ])
    logged = log
    if (!logged.length) current = "something else"
  } else if (entry.kind === "trip") {
    const after = decodeTrip(entry.after)
    const before = decodeTrip(entry.before)
    const stillAfter = and(
      eq(trips.key, entry.target),
      ...(after
        ? [
            eq(trips.date_from, after.date_from),
            eq(trips.date_to, after.date_to),
            sql`${trips.country} is ${after.country}`,
          ]
        : [sql`0`])
    )
    const [log] = await db.batch([
      db
        .insert(changeLog)
        .select(
          db
            .select(logRow({ target: trips.key, current: entry.after }))
            .from(trips)
            .where(stillAfter)
        )
        .returning({ id: changeLog.id }),
      // A trip that didn't exist before is removed again; its added and
      // left-out payments stay, in case it is saved again
      before
        ? db
            .update(trips)
            .set({ ...before, updated_at: ctx.now.toISOString() })
            .where(stillAfter)
        : db.delete(trips).where(stillAfter),
    ])
    logged = log
    if (!logged.length) {
      const [row] = await db
        .select()
        .from(trips)
        .where(eq(trips.key, entry.target))
      current = row
        ? JSON.stringify({
            name: row.name,
            date_from: row.date_from,
            date_to: row.date_to,
            country: row.country,
          })
        : ""
    }
  } else if (entry.kind === "trip_payment") {
    const [key, transactionId] = splitTripTarget(entry.target)
    const stillAfter = and(
      eq(tripPayments.trip_key, key),
      eq(tripPayments.transaction_id, transactionId),
      entry.after ? eq(tripPayments.included, entry.after === "in") : sql`0`
    )
    const [log] = await db.batch([
      db
        .insert(changeLog)
        .select(
          db
            .select(logRow({ target: entry.target, current: entry.after }))
            .from(tripPayments)
            .where(stillAfter)
        )
        .returning({ id: changeLog.id }),
      entry.before
        ? db
            .update(tripPayments)
            .set({
              included: entry.before === "in",
              updated_at: ctx.now.toISOString(),
            })
            .where(stillAfter)
        : db.delete(tripPayments).where(stillAfter),
    ])
    logged = log
    if (!logged.length) {
      const [row] = await db
        .select({ included: tripPayments.included })
        .from(tripPayments)
        .where(
          and(
            eq(tripPayments.trip_key, key),
            eq(tripPayments.transaction_id, transactionId)
          )
        )
      current = row ? (row.included ? "in" : "out") : ""
    }
  } else if (entry.kind === "budget" && !entry.after) {
    // Undo a removal: put the budget back if none has been set since. The
    // log row comes first, from the entry itself, while no budget exists
    const [log] = await db.batch([
      db
        .insert(changeLog)
        .select(
          db
            .select(logRow({ target: entry.target, current: "" }))
            .from(changeLog)
            .where(
              and(
                eq(changeLog.id, entry.id),
                sql`not exists (select 1 from ${budgets} where ${budgets.category} = ${entry.target})`
              )
            )
        )
        .returning({ id: changeLog.id }),
      db
        .insert(budgets)
        .values({
          category: entry.target,
          monthly_limit: Number(entry.before),
          updated_at: ctx.now.toISOString(),
        })
        .onConflictDoNothing(),
    ])
    logged = log
    if (!logged.length) {
      const [row] = await db
        .select({ limit: budgets.monthly_limit })
        .from(budgets)
        .where(eq(budgets.category, entry.target))
      current = row ? String(row.limit) : ""
    }
  } else if (entry.kind === "budget") {
    const stillAfter = and(
      eq(budgets.category, entry.target),
      eq(budgets.monthly_limit, Number(entry.after))
    )
    const [log] = await db.batch([
      db
        .insert(changeLog)
        .select(
          db
            .select(logRow({ target: budgets.category, current: entry.after }))
            .from(budgets)
            .where(stillAfter)
        )
        .returning({ id: changeLog.id }),
      // A budget that didn't exist before is removed again
      entry.before
        ? db
            .update(budgets)
            .set({
              monthly_limit: Number(entry.before),
              updated_at: ctx.now.toISOString(),
            })
            .where(stillAfter)
        : db.delete(budgets).where(stillAfter),
    ])
    logged = log
    if (!logged.length) {
      const [row] = await db
        .select({ limit: budgets.monthly_limit })
        .from(budgets)
        .where(eq(budgets.category, entry.target))
      current = row ? String(row.limit) : ""
    }
  } else if (entry.kind === "share") {
    const after = decodeShare(entry.after)
    const before = decodeShare(entry.before)
    const stillAfter = and(
      eq(owedEntries.transaction_id, entry.target),
      eq(owedEntries.kind, "share"),
      ...(after
        ? [
            eq(owedEntries.person, after.person),
            eq(owedEntries.amount, after.amount),
          ]
        : [sql`0`])
    )
    const [log] = await db.batch([
      db
        .insert(changeLog)
        .select(
          db
            .select(
              logRow({
                target: owedEntries.transaction_id,
                current: entry.after,
              })
            )
            .from(owedEntries)
            .where(stillAfter)
        )
        .returning({ id: changeLog.id }),
      before
        ? db
            .update(owedEntries)
            .set({ person: before.person, amount: before.amount })
            .where(stillAfter)
        : db.delete(owedEntries).where(stillAfter),
    ])
    logged = log
    if (!logged.length) {
      const [row] = await db
        .select({ person: owedEntries.person, amount: owedEntries.amount })
        .from(owedEntries)
        .where(
          and(
            eq(owedEntries.transaction_id, entry.target),
            eq(owedEntries.kind, "share")
          )
        )
      current = row ? `${row.person}|${row.amount}` : ""
    }
  } else if (entry.kind === "memory" && !entry.after) {
    // Undo a forgotten memory: put it back if none has been saved since
    const noMemory = sql`not exists (select 1 from ${aiMemory} where lower(${aiMemory.key}) = ${entry.target.toLowerCase()})`
    const [log] = await db.batch([
      db
        .insert(changeLog)
        .select(
          db
            .select(logRow({ target: entry.target, current: "" }))
            .from(changeLog)
            .where(and(eq(changeLog.id, entry.id), noMemory))
        )
        .returning({ id: changeLog.id }),
      // The same check as the log row, ignoring case like every memory
      // lookup (the table's unique key doesn't). Who it came from isn't
      // kept, so it comes back as the owner's
      db.insert(aiMemory).select(
        db
          .select({
            id: sql`null`.as("id"),
            key: sql`${entry.target}`.as("key"),
            value: sql`${entry.before}`.as("value"),
            source: sql`'user'`.as("source"),
            created_at: sql`${ctx.now.toISOString()}`.as("created_at"),
          })
          .from(changeLog)
          .where(and(eq(changeLog.id, entry.id), noMemory))
      ),
    ])
    logged = log
    if (!logged.length)
      current =
        (
          await db
            .select({ value: aiMemory.value })
            .from(aiMemory)
            .where(sql`lower(${aiMemory.key}) = ${entry.target.toLowerCase()}`)
        )[0]?.value ?? ""
  } else if (entry.kind === "memory") {
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
          : `Nothing changed: ${view.what} is now ${shown(shownValue(entry.kind, current))}, not ${shown(view.after)}, so #${entry.id} can't be undone.`,
    }
  }
  const before = view.before || "none"
  return {
    outcome: "undone",
    message: `Undid #${entry.id} on ${view.what}: back to ${before}. Change #${logged[0].id} in the change log.`,
  }
}

export const listChangesTool = {
  name: "list_changes",
  strict: true,
  description:
    "Read the change log: every change the owner confirmed (categories, notes, memories, rules, shares, budgets, trips) and every undo, newest first, with before and after. Use it for questions like “what did you change this week?”. since is an ISO date YYYY-MM-DD.",
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
