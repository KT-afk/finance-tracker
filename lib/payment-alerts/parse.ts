/**
 * Payment Alert email parsers (see CONTEXT.md and
 * docs/superpowers/specs/2026-10-18-daily-spending-telegram-design.md).
 *
 * Each parser takes one email and returns either a Payment Alert or
 * "unrecognised". An OCBC/UOB email in a format we have not seen yet is
 * never dropped: the caller records it as unread and surfaces it.
 */

export type AlertBank = "ocbc" | "uob"

export type AlertMethod =
  "paynow" | "nets-qr" | "card" | "bill-payment" | "withdrawal"

export type PayeeKind = "person" | "merchant" | "card-bill" | "wallet" | "cash"

export type PaymentAlert = {
  bank: AlertBank
  method: AlertMethod
  date: string // YYYY-MM-DD, Singapore time
  time?: string // HH:MM, 24h, Singapore time
  // SGD, negative = money out. Null for a foreign purchase until the
  // Statement gives the SGD amount.
  amount: number | null
  foreignAmount?: number
  currency?: string
  payee: string
  payeeKind: PayeeKind
  // Last digits of the Payee's PayNow mobile, as the bank shows them
  payeeMobileEnding?: string
  // Last characters of the Payee's NRIC, for PayNow sent by NRIC
  payeeNricEnding?: string
  // Last digits of the owner's account or card the money left from
  accountEnding?: string
  memo?: string
  reference?: string
  // The email body, kept verbatim as the Bank Description
  bankDescription: string
}

export type AlertEmail = {
  from: string
  subject: string
  body: string
}

// A card charge the bank has cancelled
export type Reversal = {
  bank: AlertBank
  date: string
  amount: number // SGD, positive
  payee: string
  accountEnding: string
}

export type ParsedAlert =
  | { kind: "alert"; alert: PaymentAlert }
  | { kind: "reversal"; reversal: Reversal }
  // A bank email that is not money leaving (statement ready, card locked,
  // money received): recorded so it is read once, never surfaced
  | { kind: "ignored"; bank: AlertBank; reason: string }
  | { kind: "unrecognised"; bank: AlertBank; reason: string }
  | { kind: "not-an-alert" }

// Subjects of bank emails that never describe money leaving
const NOT_SPENDING_SUBJECTS = [
  /e-?Statement/i,
  /eAdvice/i,
  /card (?:is|was) (?:still )?(?:locked|unlocked|declined)/i,
  /card replacement/i,
  /Wallet Removal/i,
  /transfer received/i,
]

const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
}

function fullYear(year: string): string {
  return year.length === 2 ? `20${year}` : year
}

// "17 Oct 2026" or "13 Sep 26"
function parseDayMonthYear(value: string): string | null {
  const m = value.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\w*\s+(\d{2,4})$/)
  const month = m && MONTHS[m[2].toLowerCase()]
  if (!m || !month) return null
  return `${fullYear(m[3])}-${month}-${m[1].padStart(2, "0")}`
}

// "20/10/26"
function parseSlashDate(value: string): string | null {
  const m = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (!m) return null
  return `${fullYear(m[3])}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
}

// "12:02 PM", "01:48pm", "5:33PM"
function parseTime(value: string): string | null {
  const m = value.trim().match(/^(\d{1,2}):(\d{2})\s*([ap]m)$/i)
  if (!m) return null
  let hour = Number(m[1]) % 12
  if (m[3].toLowerCase() === "pm") hour += 12
  return `${String(hour).padStart(2, "0")}:${m[2]}`
}

function parseMoney(value: string): number | null {
  const n = Number(value.replace(/,/g, ""))
  return Number.isFinite(n) ? n : null
}

function lastDigits(value: string): string | undefined {
  return value.match(/(\d+)\D*$/)?.[1]
}

/** "Label : value" lines, as OCBC alerts print them. */
function labelledFields(body: string): Map<string, string> {
  const fields = new Map<string, string>()
  for (const line of body.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z][A-Za-z ./]*?)\s*:\s*(.+?)\s*$/)
    if (m && !fields.has(m[1].toLowerCase())) {
      fields.set(m[1].toLowerCase(), m[2])
    }
  }
  return fields
}

function bankOf(email: AlertEmail): AlertBank | null {
  const from = email.from.toLowerCase()
  if (from.includes("ocbc")) return "ocbc"
  if (from.includes("uobgroup") || from.includes("uob.com")) return "uob"
  return null
}

function parseOcbc(email: AlertEmail): ParsedAlert {
  const body = email.body

  const withdrawal = body
    .replace(/\s+/g, " ")
    .match(
      /A sum of SGD ([\d,]+\.\d{2}) was withdrawn from your account \(-?(\d+)\) at (\d{1,2}:\d{2}\s*[AP]M) on (\d{1,2} [A-Za-z]{3} \d{4})/i
    )
  if (withdrawal) {
    const date = parseDayMonthYear(withdrawal[4])
    const value = parseMoney(withdrawal[1])
    if (!date || value === null) {
      return { kind: "unrecognised", bank: "ocbc", reason: "bad withdrawal" }
    }
    return {
      kind: "alert",
      alert: {
        bank: "ocbc",
        method: "withdrawal",
        date,
        time: parseTime(withdrawal[3]) ?? undefined,
        amount: -value,
        payee: "Withdrawal",
        payeeKind: "cash",
        accountEnding: withdrawal[2],
        bankDescription: body,
      },
    }
  }

  const fields = labelledFields(body)
  const date = parseDayMonthYear(
    (fields.get("date") ?? fields.get("date of transfer") ?? "").replace(
      /\s+SGT$/i,
      ""
    )
  )
  const time = parseTime(
    (fields.get("time") ?? fields.get("time of transfer") ?? "").replace(
      /\s*SGT$/i,
      ""
    )
  )
  const amountMatch = (fields.get("amount") ?? "").match(
    /^SGD\s*([\d,]+\.\d{2})$/i
  )
  const amount = amountMatch && parseMoney(amountMatch[1])
  const accountEnding = lastDigits(fields.get("from your account") ?? "")
  if (!date || amount === null || amount === undefined) {
    return {
      kind: "unrecognised",
      bank: "ocbc",
      reason: "missing date or amount",
    }
  }
  // "OTHR" and bare reference codes come from the bank, not the owner
  const description = fields.get("description")?.trim()
  const memo =
    description &&
    description.toUpperCase() !== "OTHR" &&
    !/^[A-Za-z0-9]{12,}$/.test(description)
      ? description
      : undefined
  const reference = fields.get("reference number")?.trim() || undefined
  const common = {
    bank: "ocbc" as const,
    date,
    time: time ?? undefined,
    amount: -amount,
    accountEnding,
    memo,
    reference,
    bankDescription: body,
  }

  const paynow = body.match(
    /PayNow transfer has been made to\s+(.+?)\s+using\s+(?:his\/her\s+)?Mobile\s*\(\+?[*\d\s]*?(\d{3,4})\)/i
  )
  if (paynow) {
    return {
      kind: "alert",
      alert: {
        ...common,
        method: "paynow",
        payee: paynow[1].trim(),
        payeeKind: "person",
        payeeMobileEnding: paynow[2],
      },
    }
  }

  const paynowNric = body.match(
    /PayNow transfer has been made to\s+(.+?)\s+using\s+(?:his\/her\s+)?NRIC\s*\(-?([\dA-Z]{3,5})\)/i
  )
  if (paynowNric) {
    return {
      kind: "alert",
      alert: {
        ...common,
        method: "paynow",
        payee: paynowNric[1].trim(),
        payeeKind: "person",
        payeeNricEnding: paynowNric[2].toUpperCase(),
      },
    }
  }

  const paynowUen = body.match(
    /PayNow transfer has been made to\s+(.+?)\s+using\s+(?:their\s+)?Unique Entity Number/i
  )
  if (paynowUen) {
    return {
      kind: "alert",
      alert: {
        ...common,
        method: "paynow",
        payee: paynowUen[1].trim(),
        payeeKind: "merchant",
      },
    }
  }

  // PayNow to a Virtual Payment Address, e.g. topping up the owner's Wise
  const vpa = body.match(
    /we have sent money to\s+(.+?)\s+using Virtual Payment Address/i
  )
  if (vpa) {
    const payee = vpa[1].trim()
    return {
      kind: "alert",
      alert: {
        ...common,
        memo: undefined,
        reference: fields.get("description/reference no.")?.trim(),
        method: "paynow",
        payee,
        payeeKind: /^WISE\b/i.test(payee) ? "wallet" : "merchant",
      },
    }
  }

  if (/NETS QR payment has been made/i.test(body)) {
    const payee = fields.get("to")?.trim()
    if (!payee) {
      return {
        kind: "unrecognised",
        bank: "ocbc",
        reason: "NETS QR without merchant",
      }
    }
    return {
      kind: "alert",
      alert: { ...common, method: "nets-qr", payee, payeeKind: "merchant" },
    }
  }

  return { kind: "unrecognised", bank: "ocbc", reason: "unknown OCBC format" }
}

function parseUob(email: AlertEmail): ParsedAlert {
  const body = email.body.replace(/\s+/g, " ")

  const reversal = body.match(
    /A transaction of ([\d,]+\.\d{2}) SGD made with your UOB card ending (\d+) on (\d{1,2} [A-Za-z]{3} \d{2,4}), [\d:]+\s*[AP]M at (.+?) has been reversed/i
  )
  if (reversal) {
    const date = parseDayMonthYear(reversal[3])
    const value = parseMoney(reversal[1])
    if (!date || value === null) {
      return { kind: "unrecognised", bank: "uob", reason: "bad reversal" }
    }
    return {
      kind: "reversal",
      reversal: {
        bank: "uob",
        date,
        amount: value,
        // Outlook sometimes rewrites the merchant name into a link
        payee:
          reversal[4].replace(/https?:\/\/\S+/g, "").trim() ||
          "Unknown merchant",
        accountEnding: reversal[2],
      },
    }
  }

  const card = body.match(
    /A transaction of ([A-Z]{3}) ([\d,]+\.\d{2}) was made with your UOB Card ending (\d+) on (\d{1,2}\/\d{1,2}\/\d{2,4}) at (.+?)\.\s*If unauthorised/i
  )
  if (card) {
    const date = parseSlashDate(card[4])
    const value = parseMoney(card[2])
    if (!date || value === null) {
      return {
        kind: "unrecognised",
        bank: "uob",
        reason: "bad card alert date or amount",
      }
    }
    const foreign = card[1].toUpperCase() !== "SGD"
    return {
      kind: "alert",
      alert: {
        bank: "uob",
        method: "card",
        date,
        amount: foreign ? null : -value,
        ...(foreign
          ? { foreignAmount: -value, currency: card[1].toUpperCase() }
          : {}),
        payee: card[5].trim(),
        payeeKind: "merchant",
        accountEnding: card[3],
        bankDescription: email.body,
      },
    }
  }

  const bill = body.match(
    /You made(?:\/scheduled)? a bill payment(?:\(s\))? of SGD ([\d,]+\.\d{2}) to (.+?) on your a\/c ending (\d+) at (\d{1,2}:\d{2}\s*[AP]M) SGT, (\d{1,2} [A-Za-z]{3} \d{2,4})/i
  )
  if (bill) {
    const date = parseDayMonthYear(bill[5])
    const value = parseMoney(bill[1])
    if (!date || value === null) {
      return {
        kind: "unrecognised",
        bank: "uob",
        reason: "bad bill payment date or amount",
      }
    }
    return {
      kind: "alert",
      alert: {
        bank: "uob",
        method: "bill-payment",
        date,
        time: parseTime(bill[4]) ?? undefined,
        amount: -value,
        payee: bill[2].trim(),
        payeeKind: "card-bill",
        accountEnding: bill[3],
        bankDescription: email.body,
      },
    }
  }

  const paynow = body.match(
    /You made a PayNow transfer of SGD ([\d,]+\.\d{2}) to (.+?) \(Mobile ending (\d+)\) on your a\/c ending (\d+) at (\d{1,2}:\d{2}\s*[AP]M) SGT, (\d{1,2} [A-Za-z]{3} \d{2,4})/i
  )
  if (paynow) {
    const date = parseDayMonthYear(paynow[6])
    const value = parseMoney(paynow[1])
    if (!date || value === null) {
      return {
        kind: "unrecognised",
        bank: "uob",
        reason: "bad PayNow date or amount",
      }
    }
    return {
      kind: "alert",
      alert: {
        bank: "uob",
        method: "paynow",
        date,
        time: parseTime(paynow[5]) ?? undefined,
        amount: -value,
        payee: paynow[2].trim(),
        payeeKind: "person",
        payeeMobileEnding: paynow[3],
        accountEnding: paynow[4],
        bankDescription: email.body,
      },
    }
  }

  return { kind: "unrecognised", bank: "uob", reason: "unknown UOB format" }
}

export function parsePaymentAlert(email: AlertEmail): ParsedAlert {
  const bank = bankOf(email)
  if (bank && NOT_SPENDING_SUBJECTS.some((p) => p.test(email.subject))) {
    return { kind: "ignored", bank, reason: email.subject }
  }
  if (bank === "ocbc") return parseOcbc(email)
  if (bank === "uob") return parseUob(email)
  return { kind: "not-an-alert" }
}
