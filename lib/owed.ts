import { randomUUID } from "crypto"
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm"
import { db } from "./db"
import { owedEntries, owedRules, transactions } from "./schema"
import { buildOwedLedger, owedRuleMatches } from "./owed-ledger"

let ensured: Promise<void> | null = null

// The drizzle journal is behind the schema (see balance-history.ts), so these
// tables are created in place on first use instead of by a migration.
export function ensureOwedTables(): Promise<void> {
  ensured ??= (async () => {
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS owed_entries (
        id text PRIMARY KEY NOT NULL,
        transaction_id text NOT NULL UNIQUE,
        person text NOT NULL,
        kind text NOT NULL,
        amount real NOT NULL,
        created_at text NOT NULL
      )
    `)
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS owed_rules (
        id text PRIMARY KEY NOT NULL,
        keyword text NOT NULL UNIQUE,
        person text NOT NULL,
        amount real NOT NULL,
        starts_on text NOT NULL,
        created_at text NOT NULL
      )
    `)
  })().catch((error) => {
    ensured = null
    throw error
  })
  return ensured
}

export class OwedError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message)
    this.name = "OwedError"
  }
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function cleanPerson(person: unknown): string {
  const value = typeof person === "string" ? person.trim() : ""
  if (!value) throw new OwedError("Say who owes this")
  if (value.length > 60) throw new OwedError("Name is too long")
  return value
}

function cleanAmount(amount: unknown, max: number): number {
  const value = roundMoney(Number(amount))
  if (!Number.isFinite(value) || value <= 0) {
    throw new OwedError("Amount must be more than 0")
  }
  if (value > roundMoney(max)) {
    throw new OwedError("Amount can't be more than the payment")
  }
  return value
}

async function getTransaction(id: string) {
  const [transaction] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, id))
    .limit(1)
  if (!transaction) throw new OwedError("Transaction not found", 404)
  return transaction
}

/** transaction id → amount owed back, for every split payment. */
export async function loadOwedShares(): Promise<Map<string, number>> {
  await ensureOwedTables()
  const rows = await db
    .select({ id: owedEntries.transaction_id, amount: owedEntries.amount })
    .from(owedEntries)
    .where(eq(owedEntries.kind, "share"))
  return new Map(rows.map((row) => [row.id, row.amount]))
}

/** Adds `owedShare` so classifyCashFlow() counts only the owner's part. */
export async function withOwedShares<T extends { id: string }>(
  rows: T[]
): Promise<Array<T & { owedShare: number }>> {
  const shares = await loadOwedShares()
  return rows.map((row) => ({ ...row, owedShare: shares.get(row.id) ?? 0 }))
}

export async function loadOwedEntriesFor(transactionIds: string[]) {
  await ensureOwedTables()
  if (transactionIds.length === 0) return new Map()
  const rows = await db
    .select()
    .from(owedEntries)
    .where(inArray(owedEntries.transaction_id, transactionIds))
  return new Map(rows.map((row) => [row.transaction_id, row]))
}

export async function setOwedShare(
  transactionId: string,
  input: { person: unknown; amount: unknown }
) {
  await ensureOwedTables()
  const transaction = await getTransaction(transactionId)
  if (transaction.amount >= 0) {
    throw new OwedError("Only money you paid out can be split")
  }
  const person = cleanPerson(input.person)
  const amount = cleanAmount(input.amount, Math.abs(transaction.amount))
  await db
    .insert(owedEntries)
    .values({
      id: randomUUID(),
      transaction_id: transactionId,
      person,
      kind: "share",
      amount,
      created_at: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: owedEntries.transaction_id,
      set: { person, kind: "share", amount },
    })
  return { person, amount }
}

export async function markRepayment(
  transactionId: string,
  input: { person: unknown; amount?: unknown }
) {
  await ensureOwedTables()
  const transaction = await getTransaction(transactionId)
  if (transaction.amount <= 0) {
    throw new OwedError("Only money you received can be a repayment")
  }
  const person = cleanPerson(input.person)
  const amount = cleanAmount(
    input.amount ?? transaction.amount,
    transaction.amount
  )
  await db
    .insert(owedEntries)
    .values({
      id: randomUUID(),
      transaction_id: transactionId,
      person,
      kind: "repayment",
      amount,
      created_at: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: owedEntries.transaction_id,
      set: { person, kind: "repayment", amount },
    })
  await db
    .update(transactions)
    .set({ category: "Repayment", is_corrected: true })
    .where(eq(transactions.id, transactionId))
  return { person, amount }
}

/**
 * Removes the split or repayment on a transaction. A repayment's category
 * goes back to Transfer so it shows up for review again.
 */
export async function removeOwedEntry(transactionId: string) {
  await ensureOwedTables()
  const [entry] = await db
    .delete(owedEntries)
    .where(eq(owedEntries.transaction_id, transactionId))
    .returning()
  if (entry?.kind === "repayment") {
    await db
      .update(transactions)
      .set({ category: "Transfer", is_corrected: true })
      .where(eq(transactions.id, transactionId))
  }
  return entry ?? null
}

/** Called when a category is changed by hand away from Repayment. */
export async function dropRepayment(transactionId: string) {
  await ensureOwedTables()
  await db
    .delete(owedEntries)
    .where(
      and(
        eq(owedEntries.transaction_id, transactionId),
        eq(owedEntries.kind, "repayment")
      )
    )
}

type OwedRule = typeof owedRules.$inferSelect

async function applyRules(
  rules: OwedRule[],
  candidates: Array<{
    id: string
    description: string
    amount: number
    date: string
  }>
): Promise<number> {
  if (rules.length === 0 || candidates.length === 0) return 0
  const existing = await loadOwedEntriesFor(candidates.map((c) => c.id))
  let applied = 0
  for (const transaction of candidates) {
    if (existing.has(transaction.id)) continue
    const rule = rules.find((r) => owedRuleMatches(r, transaction))
    if (!rule) continue
    const result = await db
      .insert(owedEntries)
      .values({
        id: randomUUID(),
        transaction_id: transaction.id,
        person: rule.person,
        kind: "share",
        amount: Math.min(rule.amount, Math.abs(transaction.amount)),
        created_at: new Date().toISOString(),
      })
      .onConflictDoNothing({ target: owedEntries.transaction_id })
      .returning({ id: owedEntries.id })
    applied += result.length
  }
  return applied
}

/**
 * Splits newly added transactions by any matching rule. Only runs on new
 * rows so a split the owner removed by hand doesn't come back.
 */
export async function applyOwedRulesTo(transactionIds: string[]) {
  if (transactionIds.length === 0) return 0
  await ensureOwedTables()
  const rules = await db.select().from(owedRules)
  if (rules.length === 0) return 0
  const candidates = await db
    .select({
      id: transactions.id,
      description: transactions.description,
      amount: transactions.amount,
      date: transactions.date,
    })
    .from(transactions)
    .where(
      and(inArray(transactions.id, transactionIds), lt(transactions.amount, 0))
    )
  return applyRules(rules, candidates)
}

export async function createOwedRule(input: {
  keyword: unknown
  person: unknown
  amount: unknown
  startsOn: unknown
}) {
  await ensureOwedTables()
  const keyword =
    typeof input.keyword === "string"
      ? input.keyword.replace(/\s+/g, " ").trim().toLowerCase()
      : ""
  if (keyword.length < 3) {
    throw new OwedError("Matching text needs at least 3 characters")
  }
  const startsOn = typeof input.startsOn === "string" ? input.startsOn : ""
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn)) {
    throw new OwedError("Pick a start date")
  }
  const person = cleanPerson(input.person)
  const amount = cleanAmount(input.amount, Number.MAX_SAFE_INTEGER)

  const [rule] = await db
    .insert(owedRules)
    .values({
      id: randomUUID(),
      keyword,
      person,
      amount,
      starts_on: startsOn,
      created_at: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: owedRules.keyword,
      set: { person, amount, starts_on: startsOn },
    })
    .returning()

  // Backfill payments already imported since the start date
  const candidates = await db
    .select({
      id: transactions.id,
      description: transactions.description,
      amount: transactions.amount,
      date: transactions.date,
    })
    .from(transactions)
    .where(and(lt(transactions.amount, 0), gte(transactions.date, startsOn)))
  const applied = await applyRules([rule], candidates)
  return { rule, applied }
}

export async function deleteOwedRule(id: string) {
  await ensureOwedTables()
  // Splits it already made stay; they're real money owed.
  await db.delete(owedRules).where(eq(owedRules.id, id))
}

export async function getOwedSummary() {
  await ensureOwedTables()
  const rows = await db
    .select({
      transaction_id: owedEntries.transaction_id,
      person: owedEntries.person,
      kind: owedEntries.kind,
      amount: owedEntries.amount,
      date: transactions.date,
      description: transactions.description,
    })
    .from(owedEntries)
    .innerJoin(transactions, eq(transactions.id, owedEntries.transaction_id))
  const rules = await db.select().from(owedRules)
  return { ...buildOwedLedger(rows), rules }
}
