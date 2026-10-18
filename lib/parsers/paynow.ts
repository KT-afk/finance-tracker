/**
 * PayNow/FAST/NETS/IBG description parser.
 *
 * Singapore bank CSV exports describe PayNow and FAST transactions as
 * unstructured strings that embed the payment method, reference code,
 * user-written memo, and recipient name in a single field. This module
 * extracts those into structured fields before categorisation.
 */

export interface PayNowFields {
  memo: string
  recipient: string
  method: string
}

const EMPTY: PayNowFields = { memo: "", recipient: "", method: "" }

/**
 * Returns true if the given string is a junk memo — i.e. a raw reference
 * code or placeholder that carries no human meaning.
 *
 * Junk patterns:
 *   - exactly "OTHR" (the literal placeholder)
 *   - pure numeric string (e.g. "2000009271526037")
 *   - long alphanumeric code ≥8 chars with no spaces (e.g. "QL0kSl11BTI30000004CGX")
 */
function isJunkMemo(value: string): boolean {
  const v = value.trim()
  if (!v || v.toUpperCase() === "OTHR") return true
  if (/^\d+$/.test(v)) return true
  if (/^[A-Za-z0-9]{8,}$/.test(v)) return true
  return false
}

function cleanMemo(raw: string): string {
  const v = raw.trim()
  return isJunkMemo(v) ? "" : v
}

/**
 * Parse a raw Singapore bank transaction description into structured fields.
 *
 * Patterns handled:
 *
 * 1. FUND TRANSFER OTHR - [REF] via PayNow-[METHOD] to [MERCHANT]
 * 2. FUND TRANSFER OTHR - [REF] to [MERCHANT] via PayNow-[METHOD]
 * 3. FAST PAYMENT OTHR-[MEMO] to [RECIPIENT] via PayNow-[METHOD]
 * 4. FAST PAYMENT OTHR-[MEMO] via PayNow-[METHOD] to [RECIPIENT]
 * 5. NETS QR [MERCHANT] [LOC_CODE] NETS QR PURCHASE
 * 6. IBG GIRO [REF] [PARTIAL_MERCHANT]COLL [REF]
 */
export function parsePayNowDescription(description: string): PayNowFields {
  const d = description.trim()

  // ── Pattern 1: FUND TRANSFER OTHR - [REF] via PayNow-[METHOD] to [MERCHANT]
  // e.g. "FUND TRANSFER OTHR - 123 via PayNow-QR Code to EVERGREEN GLOBAL"
  let m = d.match(
    /^FUND TRANSFER OTHR\s*-\s*\S+\s+via\s+(PayNow-\S+(?:\s+\S+)?)\s+to\s+(.+)$/i
  )
  if (m) {
    const method = normaliseMethod(m[1].trim())
    const recipient = m[2].trim()
    return { memo: "", recipient, method }
  }

  // ── Pattern 2: FUND TRANSFER OTHR - [REF] to [MERCHANT] via PayNow-[METHOD]
  // e.g. "FUND TRANSFER OTHR - 123 to EVERGREEN GLOBAL via PayNow-QR Code"
  // Note: bank may truncate description, causing "MERCHANTvia" (no space before "via")
  m = d.match(
    /^FUND TRANSFER OTHR\s*-\s*\S+\s+to\s+(.+?)\s*via\s+(PayNow-\S+(?:\s+\S+)?)$/i
  )
  if (m) {
    // Strip any trailing truncation char that got merged with "via" (e.g. "STUDIO P")
    const recipient = m[1].replace(/\s+\S$/, "").trim() || m[1].trim()
    const method = normaliseMethod(m[2].trim())
    return { memo: "", recipient, method }
  }

  // ── Pattern 3: FAST PAYMENT OTHR-[MEMO] to [RECIPIENT] via PayNow-[METHOD]
  // e.g. "FAST PAYMENT OTHR-rent for feb to CHEW NGENG HIANG via PayNow-Mobile"
  // Bank may truncate: "OTHR-2000009271526037 to YEAHPAY SINGAPORvia PayNow-UEN"
  m = d.match(
    /^FAST PAYMENT OTHR-(.+?)\s+to\s+(.+?)\s*via\s+(PayNow-\S+(?:\s+\S+)?)$/i
  )
  if (m) {
    const memo = cleanMemo(m[1])
    const recipient = m[2].replace(/\s+\S$/, "").trim() || m[2].trim()
    const method = normaliseMethod(m[3].trim())
    return { memo, recipient, method }
  }

  // ── Pattern 4: FAST PAYMENT OTHR-[MEMO] via PayNow-[METHOD] to [RECIPIENT]
  // e.g. "FAST PAYMENT OTHR-OTHR via PayNow-Mobile to Thiri"
  m = d.match(
    /^FAST PAYMENT OTHR-(.+?)\s+via\s+(PayNow-\S+(?:\s+\S+)?)\s+to\s+(.+)$/i
  )
  if (m) {
    const memo = cleanMemo(m[1])
    const method = normaliseMethod(m[2].trim())
    const recipient = m[3].trim()
    return { memo, recipient, method }
  }

  // ── Pattern 5: NETS QR [MERCHANT] [LOC_CODE] NETS QR PURCHASE
  // e.g. "NETS QR KING KONG CURRY NETS QR PURCHASE 69529901"
  // Merchant is everything between first "NETS QR " and the next "NETS QR"
  m = d.match(/^NETS QR\s+(.+?)\s+NETS QR\b/i)
  // PDF statements put the terminal number here instead — not a merchant
  if (m && !/^\d+$/.test(m[1].trim())) {
    const recipient = m[1].trim()
    return { memo: "", recipient, method: "NETS-QR" }
  }

  // ── Pattern 6: IBG GIRO [REF] [PARTIAL_MERCHANT]COLL [REF]
  // e.g. "IBG GIRO 100046927378 Singapore TelecommuCOLL 100912530"
  // Merchant is between the first ref and "COLL"
  m = d.match(/^IBG GIRO\s+\S+\s+(.+?)COLL\b/i)
  if (m) {
    const recipient = m[1].trim()
    return { memo: "", recipient, method: "GIRO" }
  }

  return EMPTY
}

// Text that PDF extraction appends to a description
const STATEMENT_ARTIFACTS = [
  /\s*--\s*\d+\s+of\s+\d+\s*--.*$/i,
  /\s+[\d,]+\.\d{2}\s+BALANCE C\/F.*$/i,
]

// Bank placeholders, not something a person typed
const PLACEHOLDER_MEMOS = new Set([
  "othr",
  "othr-othr",
  "other",
  "123",
  "pay",
  "transfer",
  "transfer - mobile",
  "paynow transfer",
  "paynow payment",
])

/**
 * Statement memos are often reference codes with a short suffix
 * ("DICNP17825440367882F 9ZC", "qsb-sqr-sg-382408149 951").
 */
function isStatementJunkMemo(memo: string): boolean {
  const v = memo.trim()
  if (!v || PLACEHOLDER_MEMOS.has(v.toLowerCase())) return true
  if (/^\d+$/.test(v)) return true
  const first = v.split(/\s+/)[0]
  if (first.length >= 6 && /\d/.test(first)) return true
  if (/^[A-Z0-9]{10,}$/.test(first)) return true
  // A long letters+digits token anywhere ("QR3 dy00lx2t9 0069")
  if (
    v
      .split(/\s+/)
      .some((w) => w.length >= 8 && /\d/.test(w) && /[a-z]/i.test(w))
  ) {
    return true
  }
  return false
}

// Drop trailing reference numbers / hex IDs from a name
function stripReferences(name: string): string {
  const words = name.split(/\s+/)
  const firstRef = words.findIndex(
    (w, i) => i > 0 && /\d/.test(w) && w.length >= 6
  )
  return (firstRef === -1 ? words : words.slice(0, firstRef)).join(" ")
}

function statementMethod(via: string): string {
  const m = via.match(/PayNow-(QR Code|Mobile|UEN|NRIC\/FIN|[A-Z]{4})/i)
  if (!m) return "FAST"
  const kind = m[1].toUpperCase()
  if (kind === "QR CODE") return "PayNow-QR"
  if (kind === "MOBILE") return "PayNow-Mobile"
  if (kind === "UEN") return "PayNow-UEN"
  if (kind === "NRIC/FIN") return "PayNow-NRIC"
  return "PayNow" // incoming, labelled with the sender's bank code (DBSS, HSBC…)
}

/**
 * Parse descriptions as printed on PDF statements (the current upload path),
 * where the order is "… via PayNow-X to|from NAME OTHR-memo" and NETS lines
 * read "NETS QR <terminal> NETS QR PURCHASE <MERCHANT>".
 */
export function parseStatementDescription(description: string): PayNowFields {
  let d = description.replace(/\s+/g, " ").trim()
  for (const pattern of STATEMENT_ARTIFACTS) d = d.replace(pattern, "").trim()

  let m = d.match(
    /^(?:FAST PAYMENT|FUND TRANSFER|PAYMENT\/TRANSFER)\b(.*?)\b(?:to|from)\s+(.+?)(?:\s+OTHR\b\s*-?\s*(.*))?$/i
  )
  if (m) {
    const [, via, recipient, memo = ""] = m
    return {
      memo: isStatementJunkMemo(memo) ? "" : memo.trim(),
      recipient: recipient.trim(),
      method: statementMethod(via),
    }
  }

  m = d.match(/^NETS QR\s+\d+\s+NETS QR PURCHASE\s+(.+)$/i)
  if (m && !/^\d+$/.test(m[1].trim())) {
    return { memo: "", recipient: m[1].trim(), method: "NETS-QR" }
  }

  m = d.match(/^IBG GIRO\s+(?:SALA|COLL|OTHR)\s+(?:\d+\s+)?(.+)$/i)
  if (m) return { memo: "", recipient: stripReferences(m[1]), method: "GIRO" }

  m = d.match(/^COLLECTION\/TRANSFER\s+(?:COLL|OTHR)\s+(.+)$/i)
  if (m)
    return { memo: "", recipient: stripReferences(m[1]), method: "Collection" }

  return EMPTY
}

/**
 * Normalise the raw method string from the description.
 * "PayNow-QR Code" → "PayNow-QR"
 * "PayNow-Mobile Number" → "PayNow-Mobile"
 * "PayNow-UEN" → "PayNow-UEN"
 */
function normaliseMethod(raw: string): string {
  const r = raw.trim()
  if (/PayNow-QR/i.test(r)) return "PayNow-QR"
  if (/PayNow-Mobile/i.test(r)) return "PayNow-Mobile"
  if (/PayNow-UEN/i.test(r)) return "PayNow-UEN"
  if (/PayNow/i.test(r)) return "PayNow"
  return r
}
