import { describeTransaction } from "./describe-transaction"
import type { OwedBalance, OwedLedgerEntry } from "./owed-ledger"

const dateFormat = new Intl.DateTimeFormat("en-SG", {
  day: "numeric",
  month: "short",
  year: "2-digit",
})

const monthFormat = new Intl.DateTimeFormat("en-SG", {
  month: "long",
  year: "numeric",
})

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d || 1)
}

export function formatOwedDate(iso: string): string {
  return dateFormat.format(parseIsoDate(iso))
}

export function formatOwedMonth(isoMonth: string): string {
  return monthFormat.format(parseIsoDate(isoMonth))
}

export function transactionTitle(description: string): string {
  return describeTransaction(description).title || description
}

export function owedEntryLabel(e: OwedLedgerEntry): string {
  const title = transactionTitle(e.description)
  switch (e.kind) {
    case "share":
      return `${e.person}’s share of ${title}`
    case "repayment":
      return `${e.person} paid you back`
    case "covered":
      return `${e.person} paid for ${title}`
    case "forgiven":
      return `You let ${e.person} off`
  }
}

export function owedBalanceLabel({ person, balance }: OwedBalance): string {
  if (balance > 0) return `${person} owes you`
  if (balance < 0) return `You owe ${person}`
  return `You and ${person} are square`
}
