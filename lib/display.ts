export const CATEGORY_COLORS: Record<string, string> = {
  "Food & Drink": "#F97316",
  Groceries: "#84CC16",
  Transport: "#38BDF8",
  Shopping: "#E879F9",
  Subscriptions: "#F43F5E",
  Health: "#2DD4BF",
  Entertainment: "#F472B6",
  "Bills & Utilities": "#60A5FA",
  Housing: "#FB923C",
  Transfer: "#64748B",
  "Self Transfer": "#94A3B8",
  Reimbursement: "#14B8A6",
  "Credit Card Payment": "#A78BFA",
  Personal: "#818CF8",
  Income: "#22C55E",
  Others: "#FBBF24",
}

export function formatSGD(amount: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function relativeDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
  )
  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  return date.toLocaleDateString("en-SG", { day: "numeric", month: "short" })
}

import { BANKS } from "./schema"

export const BANK_TABS = ["all", ...BANKS] as const
export type BankTab = (typeof BANK_TABS)[number]
