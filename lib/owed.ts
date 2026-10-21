import { randomUUID } from "crypto"
import { and, eq, gte, inArray, lt, ne } from "drizzle-orm"
import { db } from "./db"
import {
  OFF_BANK,
  SPEND_CATEGORIES,
  owedDismissed,
  owedEntries,
  owedRules,
  owedSenders,
  transactions,
} from "./schema"
import { classifyCashFlow } from "./cash-flow"
import { describeTransaction } from "./describe-transaction"
import {
  buildOwedLedger,
  owedRuleMatches,
  type ToSortItem,
} from "./owed-ledger"

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

/**
 * Trims and collapses spaces, and reuses an existing name regardless of
 * case so "jane" and "Jane" stay one person.
 */
async function cleanPerson(person: unknown): Promise<string> {
  const value =
    typeof person === "string" ? person.replace(/\s+/g, " ").trim() : ""
  if (!value) throw new OwedError("Say who owes this")
  if (value.length > 60) throw new OwedError("Name is too long")
  const known = [
    ...(await db
      .selectDistinct({ person: owedEntries.person })
      .from(owedEntries)),
    ...(await db.selectDistinct({ person: owedRules.person }).from(owedRules)),
  ].map((row) => row.person)
  return known.find((p) => p.toLowerCase() === value.toLowerCase()) ?? value
}

// Far above any real shared bill; catches typos like an extra few zeros
const MAX_AMOUNT = 1_000_000

function cleanAmount(
  amount: unknown,
  max = MAX_AMOUNT,
  tooMuch = "Amount can't be more than the payment"
): number {
  // Accept "1,000" or " 1000.50 "; reject anything else, like "0x10"
  if (typeof amount === "string") {
    const plain = amount.replace(/[,\s]/g, "")
    if (!/^\d+(\.\d+)?$/.test(plain)) {
      throw new OwedError("Amount must be a number, like 1000")
    }
    amount = plain
  } else if (typeof amount !== "number") {
    throw new OwedError("Amount must be more than 0")
  }
  if (Number(amount) > MAX_AMOUNT) throw new OwedError("Amount is too large")
  const value = roundMoney(Number(amount))
  if (!Number.isFinite(value) || value <= 0) {
    throw new OwedError("Amount must be more than 0")
  }
  if (value > roundMoney(max)) throw new OwedError(tooMuch)
  return value
}

export function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
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

// Shares and repayments are for money that moved through the owner's banks
async function getBankTransaction(id: string) {
  const transaction = await getTransaction(id)
  if (transaction.bank === OFF_BANK) {
    throw new OwedError("This isn’t a bank transaction")
  }
  return transaction
}

/** transaction id → amount owed back, for every split payment. */
export async function loadOwedShares(): Promise<Map<string, number>> {
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
  const transaction = await getBankTransaction(transactionId)
  if (transaction.amount >= 0) {
    throw new OwedError("Only money you paid out can be split")
  }
  const person = await cleanPerson(input.person)
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

/**
 * The whole transfer is the repayment: a part left over would count as
 * nothing. Anything she took off goes in as a "covered" entry instead.
 */
export async function markRepayment(
  transactionId: string,
  input: { person: unknown }
) {
  const transaction = await getBankTransaction(transactionId)
  if (transaction.amount <= 0) {
    throw new OwedError("Only money you received can be a repayment")
  }
  const person = await cleanPerson(input.person)
  const amount = roundMoney(transaction.amount)
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

  // Remember the bank's name for them, so their next transfer is suggested
  const sender = senderKey(transaction.description)
  if (sender) {
    await db
      .insert(owedSenders)
      .values({ sender, person, created_at: new Date().toISOString() })
      .onConflictDoUpdate({ target: owedSenders.sender, set: { person } })
  }
  return { person, amount }
}

function senderKey(description: string): string {
  return describeTransaction(description).title.trim().toLowerCase()
}

export const ADJUSTMENT_KINDS = ["covered", "forgiven"] as const
export type AdjustmentKind = (typeof ADJUSTMENT_KINDS)[number]

async function balanceOf(person: string): Promise<number> {
  const { balances } = await getOwedSummary()
  return balances.find((b) => b.person === person)?.balance ?? 0
}

/**
 * Takes down what someone owes without a bank transfer:
 * - covered: they paid for something of the owner's (default "Paid by Others")
 * - forgiven: the owner lets the amount go
 * Either way it becomes the owner's spend, recorded as an OFF_BANK
 * transaction so every spend total picks it up.
 */
export async function addOwedAdjustment(input: {
  kind: unknown
  person: unknown
  amount: unknown
  note: unknown
  category: unknown
  date: unknown
}) {
  const kind = input.kind as AdjustmentKind
  if (!ADJUSTMENT_KINDS.includes(kind)) throw new OwedError("Invalid kind")
  const person = await cleanPerson(input.person)
  const date = input.date
  if (!isValidIsoDate(date)) throw new OwedError("Pick a date")
  const category =
    typeof input.category === "string" && input.category
      ? input.category
      : "Paid by Others"
  if (!(SPEND_CATEGORIES as readonly string[]).includes(category)) {
    throw new OwedError("Invalid category")
  }
  const note =
    typeof input.note === "string" ? input.note.replace(/\s+/g, " ").trim() : ""
  if (note.length > 200) throw new OwedError("Note is too long")

  let amount: number
  if (kind === "forgiven") {
    const owed = await balanceOf(person)
    if (owed <= 0) throw new OwedError(`${person} doesn’t owe you anything`)
    amount = cleanAmount(input.amount, owed, "That’s more than they owe you")
  } else {
    amount = cleanAmount(input.amount)
  }

  const description =
    note ||
    (kind === "covered" ? `Paid by ${person}` : `Let go: owed by ${person}`)
  const id = randomUUID()
  const now = new Date().toISOString()
  await db.insert(transactions).values({
    id,
    date,
    description,
    amount: -amount,
    bank: OFF_BANK,
    category,
    is_corrected: true,
    hash: `owed:${id}`,
    uploaded_at: now,
  })
  await db.insert(owedEntries).values({
    id: randomUUID(),
    transaction_id: id,
    person,
    kind,
    amount,
    created_at: now,
  })
  return { transactionId: id, person, kind, amount, category, date }
}

/**
 * Removes an owed entry. A repayment's category goes back to Transfer so it
 * shows up for review again; a covered or forgiven amount is deleted along
 * with its OFF_BANK transaction.
 */
export async function removeOwedEntry(transactionId: string) {
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
  if (entry?.kind === "covered" || entry?.kind === "forgiven") {
    await db
      .delete(transactions)
      .where(
        and(eq(transactions.id, transactionId), eq(transactions.bank, OFF_BANK))
      )
  }
  return entry ?? null
}

/** Called when a transaction is deleted, so nothing points at it. */
export async function forgetTransaction(transactionId: string) {
  await db
    .delete(owedEntries)
    .where(eq(owedEntries.transaction_id, transactionId))
  await db
    .delete(owedDismissed)
    .where(eq(owedDismissed.transaction_id, transactionId))
}

/** Called when a category is changed by hand away from Repayment. */
export async function dropRepayment(transactionId: string) {
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
  const keyword =
    typeof input.keyword === "string"
      ? input.keyword.replace(/\s+/g, " ").trim().toLowerCase()
      : ""
  if (keyword.length < 3) {
    throw new OwedError("Matching text needs at least 3 characters")
  }
  const startsOn = input.startsOn
  if (!isValidIsoDate(startsOn)) throw new OwedError("Pick a start date")
  const person = await cleanPerson(input.person)
  const amount = cleanAmount(input.amount)

  const [existing] = await db
    .select({ id: owedRules.id })
    .from(owedRules)
    .where(eq(owedRules.keyword, keyword))
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

  // Updating a rule only changes future splits, so a split removed by hand
  // isn't brought back
  if (existing) return { rule, applied: 0 }

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
  // Splits it already made stay; they're real money owed.
  await db.delete(owedRules).where(eq(owedRules.id, id))
}

export async function getOwedSummary() {
  const rows = await db
    .select({
      transaction_id: owedEntries.transaction_id,
      person: owedEntries.person,
      kind: owedEntries.kind,
      amount: owedEntries.amount,
      date: transactions.date,
      description: transactions.description,
      category: transactions.category,
      transaction_amount: transactions.amount,
    })
    .from(owedEntries)
    .innerJoin(transactions, eq(transactions.id, owedEntries.transaction_id))
  const rules = await db.select().from(owedRules)
  return { ...buildOwedLedger(rows), rules, spendCategories: SPEND_CATEGORIES }
}

// How far back "To sort" looks
const TO_SORT_DAYS = 120

function daysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/**
 * Recent bank transactions that may belong on the owed page:
 * - incoming: transfers still to review, or from someone who has repaid
 *   before — likely repayments
 * - outgoing: unsplit Housing, or payments an auto-split rule matches but
 *   that aren't split — likely a missed share
 * Anything already on the page or dismissed is left out.
 */
export async function getToSort(since = daysAgo(TO_SORT_DAYS)): Promise<{
  incoming: ToSortItem[]
  outgoing: ToSortItem[]
}> {
  const rows = await db
    .select()
    .from(transactions)
    .where(and(gte(transactions.date, since), ne(transactions.bank, OFF_BANK)))
  const ids = rows.map((r) => r.id)
  const entries = await loadOwedEntriesFor(ids)
  const dismissed = new Set(
    (await db.select().from(owedDismissed)).map((d) => d.transaction_id)
  )
  const senders = new Map(
    (await db.select().from(owedSenders)).map((s) => [s.sender, s.person])
  )
  const rules = await db.select().from(owedRules)

  const incoming: ToSortItem[] = []
  const outgoing: ToSortItem[] = []
  for (const row of rows) {
    if (entries.has(row.id) || dismissed.has(row.id)) continue
    const item = {
      id: row.id,
      date: row.date,
      description: row.description,
      amount: row.amount,
      category: row.category,
      suggestedPerson: null as string | null,
    }
    if (row.amount > 0) {
      const known = senders.get(senderKey(row.description)) ?? null
      const classification = classifyCashFlow(row)
      const toReview =
        classification.isUnclassifiedTransfer ||
        (classification.category === "Reimbursement" && !row.is_corrected)
      if (known || toReview) incoming.push({ ...item, suggestedPerson: known })
    } else {
      const rule = rules.find((r) =>
        owedRuleMatches({ ...r, starts_on: "" }, row)
      )
      if (rule || row.category === "Housing") {
        outgoing.push({ ...item, suggestedPerson: rule?.person ?? null })
      }
    }
  }

  const byDateDesc = (a: ToSortItem, b: ToSortItem) =>
    b.date.localeCompare(a.date)
  incoming.sort(
    (a, b) =>
      Number(b.suggestedPerson !== null) - Number(a.suggestedPerson !== null) ||
      byDateDesc(a, b)
  )
  outgoing.sort(byDateDesc)
  return { incoming, outgoing }
}

/** "Not owed money": hide a transaction from To sort for good. */
export async function dismissToSort(transactionId: string) {
  await getBankTransaction(transactionId)
  await db
    .insert(owedDismissed)
    .values({
      transaction_id: transactionId,
      created_at: new Date().toISOString(),
    })
    .onConflictDoNothing()
}
