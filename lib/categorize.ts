import Anthropic from "@anthropic-ai/sdk"
import { CATEGORIES, Category } from "./schema"
import { findRuleCategory, saveRule } from "./rules"
import { parsePayNowDescription } from "./parsers/paynow"

const CATEGORY_LIST = CATEGORIES.join(", ")

let anthropicClient: Anthropic | null = null

type CategorizeOptions = {
  requireAi?: boolean
  amount?: number
}

export class CategorizationUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CategorizationUnavailableError"
  }
}

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return anthropicClient
}

/**
 * Determine whether a recipient string looks like a business name.
 * Heuristics:
 *   - Contains common business suffixes (PTE, LTD, SDN, STUDIO, etc.)
 *   - Or is all-caps and has at least 2 words
 */
function isBusinessName(name: string): boolean {
  if (!name) return false
  const upper = name.toUpperCase()
  const businessSuffixes = [
    "PTE",
    "LTD",
    "SDN",
    "BHD",
    "STUDIO",
    "INC",
    "CORP",
    "CO.",
    "PLC",
  ]
  if (businessSuffixes.some((s) => upper.includes(s))) return true
  // All-caps with at least 2 words → likely a merchant
  const words = name.trim().split(/\s+/)
  if (words.length >= 2 && name === name.toUpperCase()) return true
  return false
}

/**
 * Extract a short keyword from a memo for rule storage.
 * Takes the first 1–3 meaningful words (≥3 chars each).
 */
function extractMemoKeyword(memo: string): string {
  const stopwords = new Set([
    "for",
    "the",
    "and",
    "to",
    "a",
    "an",
    "of",
    "in",
    "on",
    "at",
  ])
  const words = memo
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !stopwords.has(w))
    .slice(0, 3)
  return words.join(" ").trim()
}

/**
 * Build a Claude prompt using structured PayNow fields when available,
 * falling back to raw description for non-PayNow transactions.
 */
function buildPrompt(
  description: string,
  memo: string,
  recipient: string,
  method: string,
  amount?: number
): string {
  const hasMemo = memo.length >= 3
  const hasRecipient = recipient.length > 0
  const hasMethod = method.length > 0

  // Non-PayNow: fall back to raw description
  if (!hasMemo && !hasRecipient && !hasMethod) {
    return `Categorize this Singapore bank transaction description into exactly one of these categories: ${CATEGORY_LIST}

Transaction: "${description}"

Reply with only the category name, nothing else.`
  }

  const lines: string[] = [
    `Categorize this Singapore bank transaction into exactly one of these categories: ${CATEGORY_LIST}`,
    "",
  ]

  if (amount !== undefined) {
    lines.push(`Direction: ${amount > 0 ? "money received" : "money sent"}`)
  }

  if (hasMemo) {
    lines.push(`Memo (written by the sender): "${memo}"`)
  }

  if (hasRecipient) {
    const label = hasMemo ? "Recipient" : "Merchant / Recipient"
    lines.push(`${label}: "${recipient}"`)
  }

  if (hasMethod) {
    lines.push(`Payment method: ${method}`)
    if (!hasMemo && method === "PayNow-Mobile") {
      lines.push(
        'Note: PayNow-Mobile payments are typically sent to individual people. If the recipient looks like a personal name with no specific memo, "Personal" is a likely category.'
      )
    }
  }

  if (hasMemo) {
    lines.push(
      "\nThe memo is the primary signal — use it as the main basis for categorisation."
    )
  }

  lines.push("\nReply with only the category name, nothing else.")
  return lines.join("\n")
}

/**
 * Patterns that deterministically identify credit card bill payments.
 * These appear in OCBC, UOB, DBS, and Trust bank transaction descriptions.
 */
const CC_PAYMENT_PATTERNS = [
  /PAYMT\s+THRU\s+E-BANK/i, // UOB: "PAYMT THRU E-BANK/HOMEB/CYBERB"
  /mBK-UOB\s+Cards?/i, // UOB credit card via mobile banking
  /mBK-DBS\s+Cards?/i, // DBS credit card via mobile banking
  /mBK-OCBC\s+Cards?/i, // OCBC credit card via mobile banking
  /COLLECTION\/TRANSFER.*Interactive/i, // OCBC credit card: "COLLECTION/TRANSFER OTHR Interactive Br"
  /BILL\s+PAYMENT.*CARD/i, // generic bill payment to card
  /CREDIT\s+CARD\s+(PAYMENT|BILL)/i, // explicit label
  /CC\s+BILL\s+PAYMENT/i,
  /GIRO.*CREDIT\s+CARD/i,
  /AUTO\s*PAY.*CREDIT\s*CARD/i,
]

const INCOMING_TRANSFER_PATTERN = /\b(?:PAYMENT\/)?TRANSFER\b.*\bfrom\b/i
const RENT_PAYMENT_PATTERN = /\b(?:rent|rental|lease)\b/i
const SELF_TRANSFER_NAMES = (
  process.env.FINANCE_SELF_TRANSFER_NAMES ?? "ONG KONG TAT"
)
  .split(",")
  .map((name) => name.trim().toLowerCase())
  .filter(Boolean)

function isSelfTransfer(description: string): boolean {
  const lower = description.toLowerCase()
  return SELF_TRANSFER_NAMES.some((name) => lower.includes(`from ${name}`))
}

export function getKnownCategory(
  description: string,
  amount: number
): Category | null {
  if (
    amount < 0 &&
    CC_PAYMENT_PATTERNS.some((pattern) => pattern.test(description))
  ) {
    return "Credit Card Payment"
  }

  if (isSelfTransfer(description)) return "Transfer"

  if (INCOMING_TRANSFER_PATTERN.test(description)) {
    return amount > 0 ? "Income" : "Transfer"
  }

  if (amount < 0 && RENT_PAYMENT_PATTERN.test(description)) return "Housing"

  return null
}

/**
 * Categorize a transaction description using:
 * 1. Deterministic CC payment pattern match (no DB/AI needed)
 * 2. Keyword rules (fast, DB lookup) — checked against memo, then recipient, then raw description
 * 3. Claude Haiku fallback (AI, only if no rule match) with structured PayNow fields
 * 4. "Others" fallback (if Claude fails or key is missing)
 */
export async function categorize(
  description: string,
  options: CategorizeOptions = {}
): Promise<Category> {
  // Parse PayNow/FAST/NETS/IBG description into structured fields
  const { memo, recipient, method } = parsePayNowDescription(description)

  // Step 1: Check saved rules — memo first, then recipient, then raw description
  const lookupTargets = [memo, recipient, description].filter(
    (s) => s.length > 0
  )
  for (const target of lookupTargets) {
    const ruleCategory = await findRuleCategory(target)
    if (
      ruleCategory &&
      (CATEGORIES as readonly string[]).includes(ruleCategory)
    ) {
      return ruleCategory as Category
    }
  }

  if (options.amount !== undefined) {
    const knownCategory = getKnownCategory(description, options.amount)
    if (knownCategory) return knownCategory
  }

  // Step 2: Claude Haiku fallback with structured prompt
  const client = getClient()
  if (!client) {
    if (options.requireAi) {
      throw new CategorizationUnavailableError(
        "ANTHROPIC_API_KEY is not configured."
      )
    }
    return "Others"
  }

  try {
    const prompt = buildPrompt(
      description,
      memo,
      recipient,
      method,
      options.amount
    )

    const message = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 20,
      messages: [{ role: "user", content: prompt }],
    })

    const raw = (
      message.content[0] as { type: string; text: string }
    ).text?.trim()

    const matched = CATEGORIES.find(
      (c) => c.toLowerCase() === raw?.toLowerCase()
    )

    if (matched) {
      // Step 3: Save keyword rule — memo or merchant, never reference codes or human names
      const keyword = deriveKeyword(memo, recipient)
      if (keyword.length >= 3) {
        await saveRule(keyword, matched)
      }
      return matched
    }

    return "Others"
  } catch (error) {
    if (options.requireAi) {
      const message =
        error instanceof Error ? error.message : "Unknown AI provider error"
      throw new CategorizationUnavailableError(
        `AI categorization failed: ${message}`
      )
    }
    // Claude API error — fall back silently
    return "Others"
  }
}

/**
 * Derive the best keyword to save as a rule after Claude categorises.
 *
 * Priority:
 * 1. Memo (if ≥3 chars) → extract first 1–3 meaningful words
 * 2. Recipient that is a business name → use full recipient string
 * 3. Otherwise (human name or no info) → don't save anything (return "")
 */
function deriveKeyword(memo: string, recipient: string): string {
  if (memo.length >= 3) {
    return extractMemoKeyword(memo)
  }
  if (recipient && isBusinessName(recipient)) {
    return recipient.toLowerCase().trim()
  }
  return ""
}
