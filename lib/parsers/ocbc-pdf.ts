import { RawTransaction, ParseResult, statementDateFromText } from "./types"

const MONTHS: Record<string, string> = {
  JAN: "01",
  FEB: "02",
  MAR: "03",
  APR: "04",
  MAY: "05",
  JUN: "06",
  JUL: "07",
  AUG: "08",
  SEP: "09",
  OCT: "10",
  NOV: "11",
  DEC: "12",
}

const SKIP_PATTERNS = [
  /BALANCE B\/F/i,
  /BALANCE C\/F/i,
  /Total Withdrawals/i,
  /Total Interest Paid/i,
  /^\s*$/,
]

/**
 * Lines between pages or in boilerplate sections that should never be
 * appended to a transaction description.
 */
const IGNORE_CONTINUATION = [
  /^Oversea-Chinese Banking/i,
  /^Co\. Reg\./i,
  /^Deposit Insurance/i,
  /^Singapore dollar deposits/i,
  /^for up to/i,
  /^and separately/i,
  /^RNB\d/,
  /^Page \d/,
  /^STATEMENT OF ACCOUNT/i,
  /^Account No\./,
  /^Transaction\s+Value/,
  /^Date\s+Date/,
  /^360 ACCOUNT/,
  /^OCBC FRANK/,
  /^\d+ [A-Z]{3} \d{4} TO/,
  /^OCBC (Bank|Centre)/i,
  /^65 Chulia/i,
  /^Singapore 049513/i,
  /^TRANSACTION CODE/i,
  /^our Customer Service/i,
  /^For enquiries/i,
  /^As part of our efforts/i,
  /^statements will now/i,
  /^Contact for/i,
  /^APPLICATIONS FOR/i,
  /^Application for/i,
  /^eBANKING/i,
  /^ATM Card/i,
  /^INTERNET/i,
  /^Three easy ways/i,
  /^Select '/i,
  /^Download and/i,
  /^\(Personal\)/i,
  /^stated on/i,
  /^Apply at/i,
  /^Complete the/i,
  /^www\.ocbc/i,
  /^or$/i,
  /^Information$/i,
  /^\d{5}\\N\\/,
  // Transaction code legend table entries (two-column layout with Chinese characters)
  /^[A-Z\/ ]{2,24}\s{2,}[A-Za-z ]{2,}/,
  /^C\/Order/i,
  /Cashier's Order/i,
  // Any line containing Chinese/CJK characters (legend table, boilerplate)
  /[\u4e00-\u9fff]/,
  // Application/instructions boilerplate
  /^\d+\.\s+(Apply|Download)/i,
  /^and mail it/i,
  /^and PIN/i,
  /^Select/i,
]

function extractStatementYear(text: string): number {
  const match = text.match(
    /\d+\s+[A-Z]{3}\s+(\d{4})\s+TO\s+\d+\s+[A-Z]{3}\s+\d{4}/i
  )
  if (match) return parseInt(match[1])
  return new Date().getFullYear()
}

function resolveDate(ddMmm: string, year: number): string {
  const parts = ddMmm.trim().split(/\s+/)
  if (parts.length !== 2) throw new Error(`Invalid date: ${ddMmm}`)
  const [day, mon] = parts
  const month = MONTHS[mon.toUpperCase()]
  if (!month) throw new Error(`Unknown month: ${mon}`)
  return `${year}-${month}-${day.padStart(2, "0")}`
}

const DATE_TOKEN = String.raw`\d{1,2}\s+[A-Z]{3}`

/**
 * Detect the column boundary between Withdrawal and Deposit columns
 * by finding the header line positions.
 */
function detectDepositColumn(text: string): number {
  const headerMatch = text.match(/^(.*)Withdrawal\s+Deposit/m)
  if (headerMatch) {
    return headerMatch[0].indexOf("Deposit")
  }
  // Fallback: typical OCBC PDF position
  return 145
}

/**
 * Parse OCBC 360 Account PDF text (from pdftotext -layout) into RawTransactions.
 *
 * The PDF has a fixed-width columnar layout:
 * - Transaction Date | Value Date | Description | Cheque | Withdrawal | Deposit | Balance
 * - Descriptions span multiple lines (continuation lines are indented)
 * - Amounts with commas (e.g., "3,000.00")
 * - Pages repeat headers and have boilerplate between them
 */
function flushTx(
  tx: { date: string; description: string; amount: number } | null,
  results: RawTransaction[]
) {
  if (tx) {
    results.push({
      date: tx.date,
      description: tx.description.trim(),
      amount: tx.amount,
      bank: "ocbc",
    })
  }
}

function parseOCBCPDFColumnar(text: string): RawTransaction[] {
  const year = extractStatementYear(text)
  const depositColStart = detectDepositColumn(text)
  const lines = text.split("\n")
  const results: RawTransaction[] = []

  // currentTx: a fully resolved transaction (date + description + amount)
  let currentTx: { date: string; description: string; amount: number } | null =
    null
  // pendingTx: date + description parsed, waiting for the amounts line
  let pendingTx: { date: string; description: string } | null = null
  let inTransactionSection = false

  for (const line of lines) {
    // Detect start of transaction section
    if (
      /Date\s+Date\s+Description/i.test(line) ||
      /Transaction\s+Date/i.test(line)
    ) {
      inTransactionSection = true
      continue
    }

    // Page boundary — flush and exit section
    if (/^Deposit Insurance Scheme/i.test(line)) {
      flushTx(currentTx, results)
      currentTx = null
      pendingTx = null
      inTransactionSection = false
      continue
    }

    // Skip known non-transaction lines
    if (SKIP_PATTERNS.some((p) => p.test(line))) {
      if (/BALANCE C\/F/i.test(line)) {
        flushTx(currentTx, results)
        currentTx = null
        pendingTx = null
        inTransactionSection = false
      }
      continue
    }

    if (!inTransactionSection) continue

    // Try to match a transaction header line: DD MMM  DD MMM  Description
    const txMatch = line.match(
      new RegExp(String.raw`^\s+(${DATE_TOKEN})\s+${DATE_TOKEN}\s{2,}(.+)`, "i")
    )

    if (txMatch) {
      // Flush any previously completed transaction
      flushTx(currentTx, results)
      currentTx = null

      const dateStr = txMatch[1]
      const fullLine = line
      const amounts = [...fullLine.matchAll(/([\d,]+\.\d{2})/g)]

      if (amounts.length >= 2) {
        // Old format: amounts on the same line as the date
        const txAmountMatch = amounts[amounts.length - 2]
        const txAmount = parseFloat(txAmountMatch[0].replace(/,/g, ""))
        const isDeposit = txAmountMatch.index! >= depositColStart
        const descStart = fullLine.indexOf(txMatch[2])
        const descEnd = txAmountMatch.index!
        const description = fullLine
          .substring(descStart, descEnd)
          .replace(/\s{2,}/g, " ")
          .trim()
        currentTx = {
          date: resolveDate(dateStr, year),
          description,
          amount: isDeposit ? txAmount : -txAmount,
        }
        pendingTx = null
      } else {
        // New format (2026): amounts on the next line — park date+description in pendingTx
        const descStart = fullLine.indexOf(txMatch[2])
        const description = fullLine
          .substring(descStart)
          .replace(/\s{2,}/g, " ")
          .trim()
        pendingTx = { date: resolveDate(dateStr, year), description }
      }
      continue
    }

    // Check if this line is an amounts-only line that resolves a pending transaction
    if (pendingTx) {
      const amounts = [...line.matchAll(/([\d,]+\.\d{2})/g)]
      if (amounts.length >= 2) {
        // second-to-last = tx amount, last = running balance
        const txAmountMatch = amounts[amounts.length - 2]
        const txAmount = parseFloat(txAmountMatch[0].replace(/,/g, ""))
        const isDeposit = txAmountMatch.index! >= depositColStart
        currentTx = {
          date: pendingTx.date,
          description: pendingTx.description,
          amount: isDeposit ? txAmount : -txAmount,
        }
        pendingTx = null
        continue
      }
      // amounts line not yet seen — append non-boilerplate text to pending description
      const trimmed = line.trim()
      if (trimmed && !IGNORE_CONTINUATION.some((p) => p.test(trimmed))) {
        pendingTx.description += " " + trimmed
      }
      continue
    }

    // Continuation line appended to a completed currentTx description
    if (currentTx) {
      const trimmed = line.trim()
      if (trimmed && !IGNORE_CONTINUATION.some((p) => p.test(trimmed))) {
        currentTx.description += " " + trimmed
      }
    }
  }

  flushTx(currentTx, results)
  return results
}

/**
 * Keywords that strongly indicate a credit/deposit transaction in OCBC statements.
 * Used by the plain-text fallback when column positions are unavailable.
 */
const DEPOSIT_KEYWORDS = [
  /FAST\s+(CREDIT|INWARD)/i,
  /SALARY/i,
  /INTEREST\s+CREDIT/i,
  /CREDIT\s+INTEREST/i,
  /INTEREST\s+CREDIT/i,
  /^INTEREST\s+CREDIT$/i,
  /GIRO\s+(CREDIT|SALARY)/i,
  /INWARD\s+REMITTANCE/i,
  /PAYNOW\s+CREDIT/i,
  /FUNDS\s+TRANSFER\s+CREDIT/i,
  /STANDING\s+INSTRUCTION\s+CREDIT/i,
  /REFUND/i,
  /CASHBACK/i,
  /DIVIDEND/i,
  /BONUS\s+INTEREST/i,
]

/**
 * Plain-text fallback parser for OCBC PDFs extracted via pdf-parse (no -layout).
 *
 * pdf-parse reorders columns so each transaction line looks like:
 *   "DD MMM  amount  balance\tDD MMM  description"
 *   e.g. "01 MAY 3,000.00 12,546.01\t02 MAY FAST PAYMENT"
 *
 * Strategy:
 * - Match lines of the form: DATE amount balance TAB DATE description
 * - Accumulate continuation lines (via PayNow, to NAME, etc.) into description
 * - Classify debit/credit from the change in running balance; fall back to
 *   DEPOSIT_KEYWORDS only when no previous balance is known
 */
function parseOCBCPDFPlainText(text: string): RawTransaction[] {
  const year = extractStatementYear(text)
  const results: RawTransaction[] = []

  // Matches: "DD MMM  amount  balance TAB DD MMM  description"
  // The tab character separates the two column groups that pdf-parse interleaves
  const TX_LINE =
    /^(\d{1,2}\s+[A-Z]{3})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\t\d{1,2}\s+[A-Z]{3}\s+(.+)$/im

  const lines = text.split("\n")
  let pending: {
    date: string
    amount: number
    description: string
    isCredit: boolean | null
  } | null = null
  let previousBalance: number | null = null

  function flushPending() {
    if (!pending) return
    const isCredit =
      pending.isCredit ??
      DEPOSIT_KEYWORDS.some((keyword) => keyword.test(pending!.description))
    results.push({
      date: pending.date,
      description: pending.description.trim(),
      amount: isCredit ? pending.amount : -pending.amount,
      bank: "ocbc",
    })
    pending = null
  }

  for (const line of lines) {
    const broughtForward = line.match(/^([\d,]+\.\d{2})\s+BALANCE B\/F/i)
    if (broughtForward) {
      previousBalance = parseFloat(broughtForward[1].replace(/,/g, ""))
      continue
    }

    const m = line.match(TX_LINE)
    if (m) {
      // Flush previous after all continuation lines have been read.
      flushPending()

      const dateStr = m[1]
      const firstAmt = parseFloat(m[2].replace(/,/g, ""))
      const balance = parseFloat(m[3].replace(/,/g, ""))
      const description = m[4].trim()

      let isCredit: boolean | null = null
      if (previousBalance !== null) {
        const delta = balance - previousBalance
        if (Math.abs(delta - firstAmt) < 0.005) isCredit = true
        else if (Math.abs(delta + firstAmt) < 0.005) isCredit = false
      }
      previousBalance = balance

      // Skip balance carry-forward lines
      if (/BALANCE/i.test(description)) {
        pending = null
        continue
      }

      let date: string
      try {
        date = resolveDate(dateStr, year)
      } catch {
        pending = null
        continue
      }

      pending = { date, amount: firstAmt, description, isCredit }
      continue
    }

    // Continuation line — append to pending description if not boilerplate
    if (pending) {
      const trimmed = line.trim()
      if (
        trimmed &&
        !IGNORE_CONTINUATION.some((p) => p.test(trimmed)) &&
        !/^Deposit Insurance/i.test(trimmed)
      ) {
        pending.description += " " + trimmed
      }
      // Page boundary resets pending
      if (/^Deposit Insurance/i.test(trimmed)) {
        flushPending()
      }
    }
  }

  flushPending()

  return results
}

/**
 * Extract the closing balance from the BALANCE C/F line.
 * Works for both pdftotext columnar and pdf-parse plain-text output.
 */
function extractClosingBalance(text: string): number | undefined {
  const patterns = [
    /BALANCE\s+C\/F[^\n]*?([\d,]+\.\d{2})/i,
    /([\d,]+\.\d{2})[^\n]*BALANCE\s+C\/F/i,
  ]
  for (const pat of patterns) {
    const m = text.match(pat)
    if (m) {
      const val = parseFloat(m[1].replace(/,/g, ""))
      if (!isNaN(val) && val > 0) return val
    }
  }
  return undefined
}

/**
 * Parse OCBC 360 Account PDF text into a ParseResult.
 * Tries the columnar parser first (requires pdftotext -layout output).
 * Falls back to a plain-text regex parser if the columnar one yields 0 results
 * (which happens when pdf-parse is used as the extraction fallback on Vercel).
 */
/**
 * Extract the opening balance from the BALANCE B/F line.
 */
function extractOpeningBalance(text: string): number | undefined {
  const patterns = [
    /BALANCE\s+B\/F[^\n]*?([\d,]+\.\d{2})/i,
    /([\d,]+\.\d{2})[^\n]*BALANCE\s+B\/F/i,
  ]
  for (const pat of patterns) {
    const m = text.match(pat)
    if (m) {
      const val = parseFloat(m[1].replace(/,/g, ""))
      if (!isNaN(val)) return val
    }
  }
  return undefined
}

export function parseOCBCPDF(text: string): ParseResult {
  const endingBalance = extractClosingBalance(text)
  const statementDate = statementDateFromText(text, [
    /\d+\s+[A-Z]{3}\s+\d{4}\s+TO\s+(\d+\s+[A-Z]{3}\s+\d{4})/i,
  ])
  const openingBalance = extractOpeningBalance(text)
  const expectedNet =
    endingBalance !== undefined && openingBalance !== undefined
      ? endingBalance - openingBalance
      : undefined

  const columnar = parseOCBCPDFColumnar(text)
  if (columnar.length > 0)
    return { transactions: columnar, endingBalance, statementDate, expectedNet }

  // Columnar parse yielded nothing — plain-text (pdf-parse) extraction, the
  // default path since extractTextFromPDF prefers pdf-parse.

  const plainText = parseOCBCPDFPlainText(text)
  if (plainText.length === 0) {
    console.warn(
      "[parseOCBCPDF] Plain-text fallback also yielded 0 results. Full text length:",
      text.length
    )
  }
  return { transactions: plainText, endingBalance, statementDate, expectedNet }
}
