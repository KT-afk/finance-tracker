import { OFF_BANK, type Category } from "./schema"

export type CashFlowTransaction = {
  description: string
  amount: number
  category: string
  // Part of an outgoing payment someone else owes back; not the owner's spend.
  owedShare?: number
  bank?: string
  // Set when the owner picked the category themselves
  is_corrected?: boolean
}

export type CashFlowClassification = {
  category: Category
  effectiveAmount: number
  countsAsIncome: boolean
  countsAsReimbursement: boolean
  countsAsSpend: boolean
  isUnclassifiedTransfer: boolean
}

export type CashFlowSummary = {
  income: number
  reimbursements: number
  spend: number
  netCashFlow: number
  unclassifiedTransfers: number
}

const CC_PAYMENT_PATTERNS = [
  /PAYMT\s+THRU\s+E-BANK/i,
  /mBK-UOB\s+Cards?/i,
  /mBK-DBS\s+Cards?/i,
  /mBK-OCBC\s+Cards?/i,
  /COLLECTION\/TRANSFER.*Interactive/i,
  /BILL\s+PAYMENT.*CARD/i,
  /CREDIT\s+CARD\s+(PAYMENT|BILL)/i,
  /CC\s+BILL\s+PAYMENT/i,
  /GIRO.*CREDIT\s+CARD/i,
  /AUTO\s*PAY.*CREDIT\s*CARD/i,
]

const INCOMING_TRANSFER_PATTERN = /\b(?:PAYMENT\/)?TRANSFER\b.*\bfrom\b/i
const RENT_PAYMENT_PATTERN = /\b(?:rent|rental|lease)\b/i
const SALARY_INCOME_PATTERN = /\b(?:salary|payroll|wages)\b/i
const REIMBURSEMENT_PATTERN =
  /\b(?:reimburse(?:ment)?|repay(?:ment)?|remainder|split|share)\b/i
// Includes how banks print the name on outgoing PayNow: short form and
// OCBC's masked form.
const SELF_TRANSFER_NAMES = (
  process.env.FINANCE_SELF_TRANSFER_NAMES ??
  "ONG KONG TAT,ONX KOXX TAX,KONG TAT"
)
  .split(",")
  .map((name) => name.trim().toLowerCase())
  .filter(Boolean)

const OUTGOING_TRANSFER_PATTERN =
  /^(?:FAST PAYMENT|FUND TRANSFER|PAYMENT\/TRANSFER)\b/i

function isSelfTransfer(description: string): boolean {
  const lower = description.toLowerCase()
  if (SELF_TRANSFER_NAMES.some((name) => lower.includes(`from ${name}`))) {
    return true
  }
  return (
    OUTGOING_TRANSFER_PATTERN.test(description) &&
    SELF_TRANSFER_NAMES.some((name) =>
      new RegExp(`\\bto ${name}(?:\\s|$)`, "i").test(lower)
    )
  )
}

function isAccountHolderLabel(description: string): boolean {
  return SELF_TRANSFER_NAMES.includes(description.trim().toLowerCase())
}

function categoryFromDescription(
  description: string,
  amount: number
): Category | null {
  if (CC_PAYMENT_PATTERNS.some((pattern) => pattern.test(description))) {
    return "Credit Card Payment"
  }
  if (
    isSelfTransfer(description) ||
    isAccountHolderLabel(description) ||
    // Top-ups to the user's own Chocolate Finance spending account
    /\bchocfin\b/i.test(description)
  ) {
    return "Self Transfer"
  }
  if (SALARY_INCOME_PATTERN.test(description)) return "Income"
  if (INCOMING_TRANSFER_PATTERN.test(description)) {
    return REIMBURSEMENT_PATTERN.test(description)
      ? "Reimbursement"
      : "Transfer"
  }
  if (amount < 0 && RENT_PAYMENT_PATTERN.test(description)) return "Housing"
  return null
}

function asCategory(category: string): Category {
  return category as Category
}

export function classifyCashFlow(
  transaction: CashFlowTransaction
): CashFlowClassification {
  // Off-bank rows carry the owner's own note, not bank text: the category
  // they picked stands
  const deterministic =
    transaction.bank === OFF_BANK
      ? null
      : categoryFromDescription(transaction.description, transaction.amount)
  // Repayment is only ever set together with who repaid, so it always wins.
  // Incoming transfers otherwise default to "Transfer" for review; a
  // Reimbursement tag on those can only come from the user.
  const category =
    transaction.category === "Repayment"
      ? "Repayment"
      : deterministic === "Transfer" && transaction.category === "Reimbursement"
        ? "Reimbursement"
        : deterministic === "Transfer" && transaction.is_corrected
          ? asCategory(transaction.category)
          : (deterministic ?? asCategory(transaction.category))
  const effectiveAmount =
    transaction.amount < 0 && transaction.owedShare
      ? Math.min(0, transaction.amount + transaction.owedShare)
      : transaction.amount
  const countsAsIncome = category === "Income" && effectiveAmount > 0
  const countsAsReimbursement =
    category === "Reimbursement" && effectiveAmount > 0
  const isUnclassifiedTransfer = category === "Transfer"
  const countsAsSpend =
    effectiveAmount < 0 &&
    ![
      "Self Transfer",
      "Transfer",
      "Credit Card Payment",
      "Income",
      "Reimbursement",
      "Repayment",
    ].includes(category)

  return {
    category,
    effectiveAmount,
    countsAsIncome,
    countsAsReimbursement,
    countsAsSpend,
    isUnclassifiedTransfer,
  }
}

export function getDeterministicCategory(
  description: string,
  amount: number
): Category | null {
  return categoryFromDescription(description, amount)
}

export function shouldRecategorizeTransaction(
  transaction: CashFlowTransaction & { is_corrected: boolean }
): boolean {
  if (transaction.is_corrected) return false

  const deterministicCategory = getDeterministicCategory(
    transaction.description,
    transaction.amount
  )
  if (deterministicCategory !== null) {
    return transaction.category !== deterministicCategory
  }

  return (
    transaction.category === "Others" ||
    (transaction.category === "Credit Card Payment" &&
      deterministicCategory !== "Credit Card Payment")
  )
}

export function summarizeCashFlow(
  transactions: CashFlowTransaction[]
): CashFlowSummary {
  const summary: CashFlowSummary = {
    income: 0,
    reimbursements: 0,
    spend: 0,
    netCashFlow: 0,
    unclassifiedTransfers: 0,
  }

  for (const transaction of transactions) {
    const classification = classifyCashFlow(transaction)
    if (classification.countsAsIncome)
      summary.income += classification.effectiveAmount
    if (classification.countsAsReimbursement)
      summary.reimbursements += classification.effectiveAmount
    if (classification.countsAsSpend)
      summary.spend += Math.abs(classification.effectiveAmount)
    if (classification.isUnclassifiedTransfer) {
      summary.unclassifiedTransfers += Math.abs(classification.effectiveAmount)
    }
  }

  summary.netCashFlow = summary.income + summary.reimbursements - summary.spend
  return summary
}
