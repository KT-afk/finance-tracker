/**
 * The propose_* tools the finance agent can call, and strict checks of
 * their input, like the other agent tools.
 */
import type Anthropic from "@anthropic-ai/sdk"
import { isValidIsoDate } from "../owed"
import { CATEGORIES } from "../schema"
import { ProposalError } from "./proposals"

/** An object with only the allowed fields. */
function strictObject(input: unknown, allowed: string[]) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new ProposalError("Tool input must be an object")
  for (const key of Object.keys(input))
    if (!allowed.includes(key)) throw new ProposalError("Unknown field " + key)
  return input as Record<string, unknown>
}

export const proposeNoteTool = {
  name: "propose_note",
  strict: true,
  description:
    "Propose a note on one transaction, for a fact about that payment, such as what it was for (“wedding ring”). Find the transaction first with search_transactions and use its id. The note then comes back with the payment in every lookup. This stores a proposal and changes nothing until the owner confirms it with a button.",
  input_schema: {
    type: "object" as const,
    properties: {
      transaction_id: {
        type: "string",
        description: "The id from search_transactions",
      },
      note: {
        type: "string",
        description: "Short note, e.g. Wedding ring for my wife",
      },
    },
    additionalProperties: false,
    required: ["transaction_id", "note"],
  },
} satisfies Anthropic.Tool

/** Strict check of the propose_note input. */
export function parseNoteInput(input: unknown): {
  transaction_id: string
  note: string
} {
  const { transaction_id, note } = strictObject(input, [
    "transaction_id",
    "note",
  ])
  if (typeof transaction_id !== "string" || !transaction_id.trim())
    throw new ProposalError(
      "transaction_id must be the id from search_transactions"
    )
  if (typeof note !== "string") throw new ProposalError("note must be a string")
  return { transaction_id: transaction_id.trim(), note }
}

export const proposeBudgetTool = {
  name: "propose_budget",
  strict: true,
  description:
    "Propose setting, changing or removing (amount null) the monthly budget for one spending category (e.g. cap Food & Drink at $500). To set several budgets in one message, call it once per category. Budgets run by calendar month in Singapore and don't roll over. This stores a proposal and changes nothing until the owner confirms it with a button.",
  input_schema: {
    type: "object" as const,
    properties: {
      category: { type: "string", enum: [...CATEGORIES] },
      amount: {
        type: ["number", "null"],
        description: "Monthly limit in SGD, or null to remove the budget",
      },
    },
    additionalProperties: false,
    required: ["category", "amount"],
  },
} satisfies Anthropic.Tool

/** Strict check of the propose_budget input. */
export function parseBudgetInput(input: unknown) {
  const { category, amount } = strictObject(input, ["category", "amount"])
  if (typeof category !== "string")
    throw new ProposalError("category must be a string")
  if (
    amount !== null &&
    (typeof amount !== "number" || !Number.isFinite(amount))
  )
    throw new ProposalError("amount must be a number or null")
  return { category, amount: amount as number | null }
}

export const proposeRecategoriseTool = {
  name: "propose_recategorise",
  strict: true,
  description:
    "Propose moving one transaction to another category, when the owner says a category is wrong. Find the transaction first with search_transactions and use its id. This stores a proposal and changes nothing: the owner confirms or rejects it with a button, and only confirming applies it. Returns the summary the owner will see.",
  input_schema: {
    type: "object" as const,
    properties: {
      transaction_id: {
        type: "string",
        description: "The id from search_transactions",
      },
      category: { type: "string", enum: [...CATEGORIES] },
    },
    additionalProperties: false,
    required: ["transaction_id", "category"],
  },
} satisfies Anthropic.Tool

/** Strict check of the tool input, like the other agent tools. */
export function parseProposeInput(input: unknown): {
  transaction_id: string
  category: string
} {
  const { transaction_id, category } = strictObject(input, [
    "transaction_id",
    "category",
  ])
  if (typeof transaction_id !== "string" || !transaction_id.trim())
    throw new ProposalError(
      "transaction_id must be the id from search_transactions"
    )
  if (typeof category !== "string")
    throw new ProposalError("category must be a string")
  return { transaction_id: transaction_id.trim(), category }
}

export const proposeMemoryTool = {
  name: "propose_memory",
  strict: true,
  description:
    "Propose saving a memory: a lasting fact to use in later answers, such as what a payment was for or that a monthly payment is expected. Use it when the owner says “remember that…” (owner_asked true), or when they tell you something worth keeping (owner_asked false). Reuse an existing memory's name to replace it. This stores a proposal and saves nothing until the owner confirms it with a button.",
  input_schema: {
    type: "object" as const,
    properties: {
      name: {
        type: "string",
        description: "Short name, e.g. wedding ring or gym payment",
      },
      fact: {
        type: "string",
        description:
          "The fact in one sentence, with dates and amounts, e.g. The $1,277 transfer to Yoon Thiri on 8 Jun 2026 was my wedding ring",
      },
      owner_asked: {
        type: "boolean",
        description: "True only if the owner asked you to remember it",
      },
    },
    additionalProperties: false,
    required: ["name", "fact", "owner_asked"],
  },
} satisfies Anthropic.Tool

/** Strict check of the propose_memory input. */
export function parseMemoryInput(input: unknown): {
  name: string
  fact: string
  owner_asked: boolean
} {
  const { name, fact, owner_asked } = strictObject(input, [
    "name",
    "fact",
    "owner_asked",
  ])
  if (typeof name !== "string" || typeof fact !== "string")
    throw new ProposalError("name and fact must be strings")
  if (typeof owner_asked !== "boolean")
    throw new ProposalError("owner_asked must be true or false")
  return { name, fact, owner_asked }
}

export const proposeRuleTool = {
  name: "propose_rule",
  strict: true,
  description:
    "Propose adding or changing a category rule: future uploads whose bank description contains the keyword go to the category (e.g. keyword grab → Transport). Past payments keep their categories; use propose_recategorise for those. This stores a proposal and changes nothing until the owner confirms it with a button.",
  input_schema: {
    type: "object" as const,
    properties: {
      keyword: {
        type: "string",
        description: "Text in the bank description, e.g. grab or fairprice",
      },
      category: { type: "string", enum: [...CATEGORIES] },
    },
    additionalProperties: false,
    required: ["keyword", "category"],
  },
} satisfies Anthropic.Tool

export const proposeShareTool = {
  name: "propose_share",
  strict: true,
  description:
    "Propose that someone owes the owner part of one payment they made (e.g. Jane owes $40 of a $120 dinner). Find the payment first with search_transactions and use its id. Once confirmed, the owner's spending counts only their part and the person shows in Owed to you. This stores a proposal and changes nothing until the owner confirms it with a button.",
  input_schema: {
    type: "object" as const,
    properties: {
      transaction_id: {
        type: "string",
        description: "The id from search_transactions",
      },
      person: { type: "string", description: "Who owes it, e.g. Jane" },
      amount: { type: "number", description: "How much they owe, in SGD" },
    },
    additionalProperties: false,
    required: ["transaction_id", "person", "amount"],
  },
} satisfies Anthropic.Tool

/** Strict check of the propose_rule input. */
export function parseRuleInput(input: unknown) {
  const { keyword, category } = strictObject(input, ["keyword", "category"])
  if (typeof keyword !== "string" || typeof category !== "string")
    throw new ProposalError("keyword and category must be strings")
  return { keyword, category }
}

/** Strict check of the propose_share input. */
export function parseShareInput(input: unknown) {
  const { transaction_id, person, amount } = strictObject(input, [
    "transaction_id",
    "person",
    "amount",
  ])
  if (typeof transaction_id !== "string" || !transaction_id.trim())
    throw new ProposalError(
      "transaction_id must be the id from search_transactions"
    )
  if (typeof person !== "string")
    throw new ProposalError("person must be a string")
  if (typeof amount !== "number" || !Number.isFinite(amount))
    throw new ProposalError("amount must be a number")
  return { transaction_id: transaction_id.trim(), person, amount }
}

export const proposeTripTool = {
  name: "propose_trip",
  strict: true,
  description:
    "Propose saving a trip, or changing a saved trip's dates or country: a short name (e.g. Korea), the first and last day, and the country's two-letter code (or null for several countries). Its payments are then those made abroad between the dates, plus any added with propose_trip_payment. This stores a proposal and changes nothing until the owner confirms it with a button.",
  input_schema: {
    type: "object" as const,
    properties: {
      name: {
        type: "string",
        description: "Short name, e.g. Korea or Japan 2025",
      },
      date_from: { type: "string", description: "First day, YYYY-MM-DD" },
      date_to: { type: "string", description: "Last day, YYYY-MM-DD" },
      country: {
        type: ["string", "null"],
        description: "Two-letter country code, e.g. KR, or null",
      },
    },
    additionalProperties: false,
    required: ["name", "date_from", "date_to", "country"],
  },
} satisfies Anthropic.Tool

/** Strict check of the propose_trip input. */
export function parseTripProposalInput(input: unknown) {
  const { name, date_from, date_to, country } = strictObject(input, [
    "name",
    "date_from",
    "date_to",
    "country",
  ])
  if (typeof name !== "string") throw new ProposalError("name must be a string")
  for (const d of [date_from, date_to])
    if (typeof d !== "string" || !isValidIsoDate(d))
      throw new ProposalError("Dates must be valid YYYY-MM-DD dates")
  if ((date_from as string) > (date_to as string))
    throw new ProposalError("date_to must not be before date_from")
  if (
    (Date.parse(date_to as string) - Date.parse(date_from as string)) /
      86_400_000 >
    92
  )
    throw new ProposalError("A trip can be at most 3 months")
  if (
    country !== null &&
    (typeof country !== "string" || !/^[A-Za-z]{2}$/.test(country))
  )
    throw new ProposalError(
      "country must be a two-letter code such as KR, or null"
    )
  return {
    name,
    date_from: date_from as string,
    date_to: date_to as string,
    country: country === null ? null : (country as string).toUpperCase(),
  }
}

export const proposeTripPaymentTool = {
  name: "propose_trip_payment",
  strict: true,
  description:
    "Propose adding one payment to a saved trip (a flight or hotel paid from Singapore, a cash entry: include true) or leaving one out of it (a payment abroad that wasn't part of the trip: include false). Find the payment first with search_transactions and use its id. This stores a proposal and changes nothing until the owner confirms it with a button.",
  input_schema: {
    type: "object" as const,
    properties: {
      trip: { type: "string", description: "The saved trip's name" },
      transaction_id: {
        type: "string",
        description: "The id from search_transactions",
      },
      include: {
        type: "boolean",
        description: "True to add it, false to leave it out",
      },
    },
    additionalProperties: false,
    required: ["trip", "transaction_id", "include"],
  },
} satisfies Anthropic.Tool

/** Strict check of the propose_trip_payment input. */
export function parseTripPaymentInput(input: unknown) {
  const { trip, transaction_id, include } = strictObject(input, [
    "trip",
    "transaction_id",
    "include",
  ])
  if (typeof trip !== "string" || !trip.trim())
    throw new ProposalError("trip must be a saved trip's name")
  if (typeof transaction_id !== "string" || !transaction_id.trim())
    throw new ProposalError(
      "transaction_id must be the id from search_transactions"
    )
  if (typeof include !== "boolean")
    throw new ProposalError("include must be true or false")
  return { trip: trip.trim(), transaction_id: transaction_id.trim(), include }
}

export const proposeCashPaymentTool = {
  name: "propose_cash_payment",
  strict: true,
  description:
    "Propose adding a cash payment, or other spending no bank statement shows, as a hand-entered payment (e.g. $1,000 cash spent in Korea). Never for card or bank payments, which come from statements. Up to $10,000; a spending category; a date that isn't in the future. Optionally add it to a saved trip. This stores a proposal and adds nothing until the owner confirms it with a button.",
  input_schema: {
    type: "object" as const,
    properties: {
      date: { type: "string", description: "YYYY-MM-DD; ask if unsure" },
      amount: { type: "number", description: "What was spent, in SGD" },
      category: { type: "string", enum: [...CATEGORIES] },
      description: {
        type: "string",
        description: "Short, e.g. Korea trip cash",
      },
      trip: {
        type: ["string", "null"],
        description: "A saved trip's name to add it to, or null",
      },
    },
    additionalProperties: false,
    required: ["date", "amount", "category", "description", "trip"],
  },
} satisfies Anthropic.Tool

/** Strict check of the propose_cash_payment input. */
export function parseCashPaymentInput(input: unknown) {
  const { date, amount, category, description, trip } = strictObject(input, [
    "date",
    "amount",
    "category",
    "description",
    "trip",
  ])
  if (typeof date !== "string" || !isValidIsoDate(date))
    throw new ProposalError("date must be a valid YYYY-MM-DD date")
  if (typeof amount !== "number" || !Number.isFinite(amount))
    throw new ProposalError("amount must be a number")
  if (typeof category !== "string")
    throw new ProposalError("category must be a string")
  if (typeof description !== "string")
    throw new ProposalError("description must be a string")
  if (trip !== null && (typeof trip !== "string" || !trip.trim()))
    throw new ProposalError("trip must be a saved trip's name, or null")
  return {
    date,
    amount,
    category,
    description,
    trip: trip === null ? null : (trip as string).trim(),
  }
}
