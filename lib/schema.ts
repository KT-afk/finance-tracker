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

// Marks transactions that never went through the owner's accounts: something
// another person paid for them, or an owed amount they let go. They count in
// "All" but under no bank.
export const OFF_BANK = "off_bank" as const
const TRANSACTION_BANKS = [...BANKS, OFF_BANK] as const

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
  "Paid by Others",
  "Travel",
  "Personal",
  "Income",
  // Nobody has decided yet. Counts as spending until labelled; distinct
  // from "Others", which is a decision that it fits no category.
  "Unlabelled",
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

export const SPEND_CATEGORIES = CATEGORIES.filter(
  (c) => !EXCLUDED_FROM_SPEND.includes(c)
)

export const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(),
  date: text("date").notNull(), // ISO date string YYYY-MM-DD
  description: text("description").notNull(),
  amount: real("amount").notNull(), // negative = expense, positive = income
  bank: text("bank", { enum: TRANSACTION_BANKS }).notNull(),
  category: text("category").notNull().default("Others"),
  is_corrected: integer("is_corrected", { mode: "boolean" })
    .notNull()
    .default(false),
  hash: text("hash").notNull().unique(),
  uploaded_at: text("uploaded_at").notNull(),
  // Where the Transaction is known from: a Statement upload or a Payment Alert
  source: text("source", { enum: ["statement", "alert"] })
    .notNull()
    .default("statement"),
  // Payment Alert details; null for Statement-only rows
  time: text("time"), // HH:MM, Singapore time
  payee: text("payee"),
  memo: text("memo"),
  foreign_amount: real("foreign_amount"),
  currency: text("currency"),
  // Set when a Statement Line has matched this alert (Confirmed Transaction)
  confirmed_at: text("confirmed_at"),
})

export const categoryRules = sqliteTable("category_rules", {
  id: text("id").primaryKey(),
  keyword: text("keyword").notNull().unique(),
  category: text("category").notNull(),
  created_at: text("created_at").notNull(),
})

// Money someone owes the owner. A "share" is the part of an outgoing payment
// they should cover and adds to what they owe. These take it down:
// - "repayment": an incoming transfer from them
// - "covered": something they paid for the owner (an OFF_BANK expense)
// - "forgiven": an amount the owner let go (an OFF_BANK expense)
export const OWED_ENTRY_KINDS = [
  "share",
  "repayment",
  "covered",
  "forgiven",
] as const
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

// Bank name on a transfer (lowercased) → who it is, learnt from repayments
export const owedSenders = sqliteTable("owed_senders", {
  sender: text("sender").primaryKey(),
  person: text("person").notNull(),
  created_at: text("created_at").notNull(),
})

// Transactions the owner said have nothing to do with owed money
export const owedDismissed = sqliteTable("owed_dismissed", {
  transaction_id: text("transaction_id").primaryKey(),
  created_at: text("created_at").notNull(),
})

export const CONVERSATION_SOURCES = ["web", "telegram"] as const
export type ConversationSource = (typeof CONVERSATION_SOURCES)[number]

export const aiConversations = sqliteTable("ai_conversations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  question: text("question").notNull(),
  answer_text: text("answer_text").notNull(),
  answer_data: text("answer_data"), // JSON blob, nullable
  created_at: text("created_at").notNull(),
  // Where the exchange happened; history is only shared within one source
  // and topic. Rows from before these columns are web questions.
  source: text("source", { enum: CONVERSATION_SOURCES })
    .notNull()
    .default("web"),
  topic: text("topic").notNull().default("ask"),
})

export const aiMemory = sqliteTable("ai_memory", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  source: text("source", { enum: ["user", "inferred"] }).notNull(),
  created_at: text("created_at").notNull(),
})

// The last dashboard insight, reused until its input changes or it expires
export const insightCache = sqliteTable("insight_cache", {
  key: text("key").primaryKey(),
  input_hash: text("input_hash").notNull(),
  text: text("text").notNull(),
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

// Every bank email the alert reader has looked at, so each is processed once.
// "unrecognised" ones are surfaced to the owner, never dropped.
export const alertEmails = sqliteTable("alert_emails", {
  message_id: text("message_id").primaryKey(),
  bank: text("bank", { enum: ["ocbc", "uob", "trust"] }).notNull(),
  received_at: text("received_at").notNull(),
  status: text("status", {
    enum: ["saved", "self-transfer", "reversed", "ignored", "unrecognised"],
  }).notNull(),
  reason: text("reason"),
  transaction_id: text("transaction_id"),
  processed_at: text("processed_at").notNull(),
})

// Credentials the app must update itself, such as the Outlook refresh
// token, which Microsoft replaces when it is used.
export const integrationTokens = sqliteTable("integration_tokens", {
  name: text("name").primaryKey(),
  value: text("value").notNull(),
  updated_at: text("updated_at").notNull(),
})
