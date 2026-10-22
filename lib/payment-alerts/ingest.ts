import { randomUUID } from "crypto"
import { and, eq, gte, inArray, lte } from "drizzle-orm"
import { categorize } from "../categorize"
import { db } from "../db"
import { applyOwedRulesTo } from "../owed"
import { computeHash } from "../parsers/normalizer"
import { alertEmails, transactions, type Category } from "../schema"
import { fetchAlertEmails, type InboxEmail } from "./outlook"
import {
  parsePaymentAlert,
  type AlertBank,
  type PaymentAlert,
  type Reversal,
} from "./parse"
import { isSelfTransferAlert, selfAccountsFromEnv } from "./self-accounts"

type AlertTransaction = {
  id: string
  date: string
  time: string | null
  bank: AlertBank
  amount: number
  payee: string
  memo: string | null
  category: Category
}

export type IngestOutcome = {
  messageId: string
  receivedAt: string
  status: "saved" | "self-transfer" | "reversed" | "ignored" | "unrecognised"
  reason?: string
  transaction?: AlertTransaction
  // For a reversal: the earlier charge it cancelled
  cancelled?: AlertTransaction
}

export type IngestResult = {
  fetched: number
  alreadyProcessed: number
  outcomes: IngestOutcome[]
}

/**
 * One line in the bank-statement style the rest of the app already
 * understands, so Category Rules and the AI see the Memo and Payee the
 * same way they do for an upload.
 */
export function alertDescription(alert: PaymentAlert): string {
  switch (alert.method) {
    case "paynow":
      return `FAST PAYMENT OTHR-${alert.memo ?? "OTHR"} to ${alert.payee} via PayNow-Mobile`
    case "nets-qr":
      return `NETS QR ${alert.payee} NETS QR PURCHASE`
    case "bill-payment":
      return `BILL PAYMENT ${alert.payee}`
    case "withdrawal":
      return "CASH WITHDRAWAL"
    case "card":
      return alert.payee
  }
}

async function categoryFor(
  alert: PaymentAlert,
  description: string,
  selfTransfer: boolean,
  learn: boolean
): Promise<Category> {
  // A Wallet Top-up moves the owner's own money; the Wallet's own
  // payments are the spending
  if (selfTransfer || alert.payeeKind === "wallet") return "Self Transfer"
  if (alert.method === "bill-payment") return "Credit Card Payment"
  if (alert.method === "withdrawal") return "Unlabelled"
  return categorize(description, { amount: alert.amount ?? undefined, learn })
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function samePayee(a: string, b: string): boolean {
  const first = (s: string) =>
    s
      .trim()
      .split(/[\s*]+/)[0]
      ?.toLowerCase() ?? ""
  return first(a) !== "" && first(a) === first(b)
}

/**
 * The card charge a reversal cancels: same bank and amount, same merchant,
 * within a few days. Charges saved earlier in this run count too, so a dry
 * run shows the same result as a real one.
 */
async function findReversedCharge(
  reversal: Reversal,
  thisRun: AlertTransaction[]
): Promise<AlertTransaction | null> {
  const from = shiftDate(reversal.date, -(reversal.daysBack ?? 3))
  const to = shiftDate(reversal.date, 3)
  const matches = (t: { amount: number; payee: string | null; date: string }) =>
    Math.abs(t.amount + reversal.amount) < 0.005 &&
    samePayee(t.payee ?? "", reversal.payee) &&
    t.date >= from &&
    t.date <= to

  const inRun = thisRun.find((t) => t.bank === reversal.bank && matches(t))
  if (inRun) return inRun

  const saved = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.source, "alert"),
        eq(transactions.bank, reversal.bank),
        eq(transactions.is_corrected, false),
        gte(transactions.date, from),
        lte(transactions.date, to)
      )
    )
  const row = saved.find(matches)
  return row
    ? {
        id: row.id,
        date: row.date,
        time: row.time,
        bank: reversal.bank,
        amount: row.amount,
        payee: row.payee ?? "",
        memo: row.memo,
        category: row.category as Category,
      }
    : null
}

/**
 * Reads bank emails since `since`, turns each new one into a Transaction,
 * and records every email it looked at so it is processed once. With
 * `dryRun`, nothing is written and no Category Rule is learned.
 */
export async function ingestPaymentAlerts({
  since,
  dryRun,
  emails,
}: {
  since: Date
  dryRun: boolean
  // For tests: skip Outlook and use these
  emails?: InboxEmail[]
}): Promise<IngestResult> {
  const inbox = emails ?? (await fetchAlertEmails(since))
  const ids = inbox.map((email) => email.id)
  const seen = new Set(
    ids.length
      ? (
          await db
            .select({ id: alertEmails.message_id })
            .from(alertEmails)
            .where(inArray(alertEmails.message_id, ids))
        ).map((row) => row.id)
      : []
  )
  const self = selfAccountsFromEnv()
  const result: IngestResult = {
    fetched: inbox.length,
    alreadyProcessed: 0,
    outcomes: [],
  }
  const savedThisRun: AlertTransaction[] = []

  for (const email of inbox) {
    if (seen.has(email.id)) {
      result.alreadyProcessed++
      continue
    }
    const parsed = parsePaymentAlert(email)
    if (parsed.kind === "not-an-alert") continue

    const base = { messageId: email.id, receivedAt: email.receivedAt }
    let outcome: IngestOutcome
    let bank: AlertBank

    if (parsed.kind === "ignored" || parsed.kind === "unrecognised") {
      bank = parsed.bank
      outcome = {
        ...base,
        status: parsed.kind,
        reason:
          parsed.kind === "ignored"
            ? parsed.reason
            : `${email.subject}: ${parsed.reason}`,
      }
    } else if (parsed.kind === "reversal") {
      bank = parsed.reversal.bank
      const charge = await findReversedCharge(parsed.reversal, savedThisRun)
      outcome = {
        ...base,
        status: "reversed",
        reason: charge
          ? `cancels ${charge.payee} ${charge.date}`
          : `no matching charge for ${parsed.reversal.payee} ${parsed.reversal.date}`,
        ...(charge ? { cancelled: charge } : {}),
      }
      if (charge && !dryRun) {
        await db.delete(transactions).where(eq(transactions.id, charge.id))
      }
      if (charge) savedThisRun.splice(savedThisRun.indexOf(charge), 1)
    } else if (parsed.alert.amount === null) {
      bank = parsed.alert.bank
      outcome = {
        ...base,
        status: "unrecognised",
        reason: `${email.subject}: foreign amount, SGD not known until the Statement`,
      }
    } else {
      const alert = parsed.alert
      bank = alert.bank
      const selfTransfer = isSelfTransferAlert(alert, self)
      const description = alertDescription(alert)
      const category = await categoryFor(
        alert,
        description,
        selfTransfer,
        !dryRun
      )
      const tx: AlertTransaction = {
        id: randomUUID(),
        date: alert.date,
        time: alert.time ?? null,
        bank: alert.bank,
        amount: alert.amount as number,
        payee: alert.payee,
        memo: alert.memo ?? null,
        category,
      }
      outcome = {
        ...base,
        status: category === "Self Transfer" ? "self-transfer" : "saved",
        transaction: tx,
      }
      savedThisRun.push(tx)
      if (!dryRun) {
        await db
          .insert(transactions)
          .values({
            id: tx.id,
            date: tx.date,
            description,
            amount: tx.amount,
            bank: tx.bank,
            category: tx.category,
            is_corrected: false,
            hash: computeHash({
              date: tx.date,
              description,
              amount: tx.amount,
              bank: tx.bank,
              externalId: `alert:${email.id}`,
            }),
            uploaded_at: new Date().toISOString(),
            source: "alert",
            time: tx.time,
            payee: tx.payee,
            memo: tx.memo,
            foreign_amount: alert.foreignAmount ?? null,
            currency: alert.currency ?? null,
          })
          .onConflictDoNothing({ target: transactions.hash })
      }
    }

    if (!dryRun) {
      await db
        .insert(alertEmails)
        .values({
          message_id: email.id,
          bank,
          received_at: email.receivedAt,
          status: outcome.status,
          reason: outcome.reason ?? null,
          transaction_id:
            outcome.transaction?.id ?? outcome.cancelled?.id ?? null,
          processed_at: new Date().toISOString(),
        })
        .onConflictDoNothing()
    }
    result.outcomes.push(outcome)
  }
  // e.g. split this month's rent with the partner's share, as uploads do
  if (!dryRun) await applyOwedRulesTo(savedThisRun.map((tx) => tx.id))
  return result
}
