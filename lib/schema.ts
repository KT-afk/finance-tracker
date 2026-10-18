import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core"

export const BANKS = [
  "ocbc",
  "dbs",
  "uob",
  "trust",
  "wise",
  "chocolate",
] as const
export type Bank = (typeof BANKS)[number]

export const CATEGORIES = [
  "Food & Drink",
  "Groceries",
  "Transport",
  "Shopping",
  "Subscriptions",
  "Health",
  "Entertainment",
  "Bills & Utilities",
  "Housing",
  "Transfer",
  "Self Transfer",
  "Reimbursement",
  "Repayment",
  "Credit Card Payment",
  "Travel",
  "Personal",
  "Income",
  "Others",
] as const
export type Category = (typeof CATEGORIES)[number]

export const EXCLUDED_FROM_SPEND: readonly string[] = [
  "Transfer",
  "Self Transfer",
  "Reimbursement",
  "Repayment",
  "Credit Card Payment",
  "Income",
]

export const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(),
  date: text("date").notNull(), // ISO date string YYYY-MM-DD
  description: text("description").notNull(),
  amount: real("amount").notNull(), // negative = expense, positive = income
  bank: text("bank", { enum: BANKS }).notNull(),
  category: text("category").notNull().default("Others"),
  is_corrected: integer("is_corrected", { mode: "boolean" })
    .notNull()
    .default(false),
  hash: text("hash").notNull().unique(),
  uploaded_at: text("uploaded_at").notNull(),
})

export const categoryRules = sqliteTable("category_rules", {
  id: text("id").primaryKey(),
  keyword: text("keyword").notNull().unique(),
  category: text("category").notNull(),
  created_at: text("created_at").notNull(),
})

// Money someone owes the owner: a "share" is the part of an outgoing payment
// they should cover; a "repayment" is an incoming transfer that pays it back.
// Balance per person = sum of shares - sum of repayments.
export const OWED_ENTRY_KINDS = ["share", "repayment"] as const
export type OwedEntryKind = (typeof OWED_ENTRY_KINDS)[number]

export const owedEntries = sqliteTable("owed_entries", {
  id: text("id").primaryKey(),
  transaction_id: text("transaction_id").notNull().unique(),
  person: text("person").notNull(),
  kind: text("kind", { enum: OWED_ENTRY_KINDS }).notNull(),
  amount: real("amount").notNull(), // always positive
  created_at: text("created_at").notNull(),
})

// Splits every matching outgoing payment on or after starts_on, e.g. rent.
export const owedRules = sqliteTable("owed_rules", {
  id: text("id").primaryKey(),
  keyword: text("keyword").notNull().unique(),
  person: text("person").notNull(),
  amount: real("amount").notNull(),
  starts_on: text("starts_on").notNull(), // YYYY-MM-DD
  created_at: text("created_at").notNull(),
})

export const aiConversations = sqliteTable("ai_conversations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  question: text("question").notNull(),
  answer_text: text("answer_text").notNull(),
  answer_data: text("answer_data"), // JSON blob, nullable
  created_at: text("created_at").notNull(),
})

export const aiMemory = sqliteTable("ai_memory", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  source: text("source", { enum: ["user", "inferred"] }).notNull(),
  created_at: text("created_at").notNull(),
})

export const ACCOUNT_TYPES = ["savings", "credit_card"] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

export const balanceHistory = sqliteTable("balance_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bank: text("bank", { enum: BANKS }).notNull(),
  balance: real("balance").notNull(),
  account_type: text("account_type", { enum: ACCOUNT_TYPES })
    .notNull()
    .default("savings"),
  recorded_at: text("recorded_at").notNull(),
})
