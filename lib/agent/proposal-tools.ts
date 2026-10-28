/**
 * The propose_* tools the finance agent can call, and strict checks of
 * their input, like the other agent tools.
 */
import type Anthropic from "@anthropic-ai/sdk"
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
