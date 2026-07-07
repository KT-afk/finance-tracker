import { RawTransaction, ParseResult } from './types'

const MONTHS: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04',
  MAY: '05', JUN: '06', JUL: '07', AUG: '08',
  SEP: '09', OCT: '10', NOV: '11', DEC: '12',
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
  const match = text.match(/\d+\s+[A-Z]{3}\s+(\d{4})\s+TO\s+\d+\s+[A-Z]{3}\s+\d{4}/i)
  if (match) return parseInt(match[1])
  return new Date().getFullYear()
}

function resolveDate(ddMmm: string, year: number): string {
  const parts = ddMmm.trim().split(/\s+/)
  if (parts.length !== 2) throw new Error(`Invalid date: ${ddMmm}`)
  const [day, mon] = parts
  const month = MONTHS[mon.toUpperCase()]
  if (!month) throw new Error(`Unknown month: ${mon}`)
  return `${year}-${month}-${day.padStart(2, '0')}`
}

const DATE_TOKEN = String.raw`\d{1,2}\s+[A-Z]{3}`

/**
 * Detect the column boundary between Withdrawal and Deposit columns
 * by finding the header line positions.
 */
function detectDepositColumn(text: string): number {
  const headerMatch = text.match(/^(.*)Withdrawal\s+Deposit/m)
  if (headerMatch) {
    return headerMatch[0].indexOf('Deposit')
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
    results.push({ date: tx.date, description: tx.description.trim(), amount: tx.amount, bank: 'ocbc' })
  }
}

function parseOCBCPDFColumnar(text: string): RawTransaction[] {
  const year = extractStatementYear(text)
  const depositColStart = detectDepositColumn(text)
  const lines = text.split('\n')
  const results: RawTransaction[] = []

  // currentTx: a fully resolved transaction (date + description + amount)
  let currentTx: { date: string; description: string; amount: number } | null = null
  // pendingTx: date + description parsed, waiting for the amounts line
  let pendingTx: { date: string; description: string } | null = null
  let inTransactionSection = false

  for (const line of lines) {
    // Detect start of transaction section
    if (/Date\s+Date\s+Description/i.test(line) || /Transaction\s+Date/i.test(line)) {
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
    if (SKIP_PATTERNS.some(p => p.test(line))) {
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
      new RegExp(String.raw`^\s+(${DATE_TOKEN})\s+${DATE_TOKEN}\s{2,}(.+)`, 'i')
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
        const txAmount = parseFloat(txAmountMatch[0].replace(/,/g, ''))
        const isDeposit = txAmountMatch.index! >= depositColStart
        const descStart = fullLine.indexOf(txMatch[2])
        const descEnd = txAmountMatch.index!
        const description = fullLine.substring(descStart, descEnd).replace(/\s{2,}/g, ' ').trim()
        currentTx = { date: resolveDate(dateStr, year), description, amount: isDeposit ? txAmount : -txAmount }
        pendingTx = null
      } else {
        // New format (2026): amounts on the next line — park date+description in pendingTx
        const descStart = fullLine.indexOf(txMatch[2])
        const description = fullLine.substring(descStart).replace(/\s{2,}/g, ' ').trim()
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
        const txAmount = parseFloat(txAmountMatch[0].replace(/,/g, ''))
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
      if (trimmed && !IGNORE_CONTINUATION.some(p => p.test(trimmed))) {
        pendingTx.description += ' ' + trimmed
      }
      continue
    }

    // Continuation line appended to a completed currentTx description
    if (currentTx) {
      const trimmed = line.trim()
      if (trimmed && !IGNORE_CONTINUATION.some(p => p.test(trimmed))) {
        currentTx.description += ' ' + trimmed
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
 * - Classify debit/credit by column position: amount is before balance,
 *   and we detect deposits via DEPOSIT_KEYWORDS on the description
 */
function parseOCBCPDFPlainText(text: string): RawTransaction[] {
  const year = extractStatementYear(text)
  const results: RawTransaction[] = []

  // Matches: "DD MMM  amount  balance TAB DD MMM  description"
  // The tab character separates the two column groups that pdf-parse interleaves
  const TX_LINE = /^(\d{1,2}\s+[A-Z]{3})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\t\d{1,2}\s+[A-Z]{3}\s+(.+)$/im

  const lines = text.split('\n')
  let pending: { date: string; amount: number; description: string } | null = null

  for (const line of lines) {
    const m = line.match(TX_LINE)
    if (m) {
      // Flush previous
      if (pending) {
        results.push({ date: pending.date, description: pending.description.trim(), amount: pending.amount, bank: 'ocbc' })
      }

      const dateStr = m[1]
      const firstAmt = parseFloat(m[2].replace(/,/g, ''))
      // m[3] is the running balance — not needed
      const description = m[4].trim()

      // Skip balance carry-forward lines
      if (/BALANCE/i.test(description)) { pending = null; continue }

      let date: string
      try { date = resolveDate(dateStr, year) } catch { pending = null; continue }

      // Determine credit vs debit by keyword — fallback to debit
      const isCredit = DEPOSIT_KEYWORDS.some(kw => kw.test(description))
      pending = { date, amount: isCredit ? firstAmt : -firstAmt, description }
      continue
    }

    // Continuation line — append to pending description if not boilerplate
    if (pending) {
      const trimmed = line.trim()
      if (trimmed && !IGNORE_CONTINUATION.some(p => p.test(trimmed)) && !/^Deposit Insurance/i.test(trimmed)) {
        pending.description += ' ' + trimmed
      }
      // Page boundary resets pending
      if (/^Deposit Insurance/i.test(trimmed)) {
        results.push({ date: pending.date, description: pending.description.trim(), amount: pending.amount, bank: 'ocbc' })
        pending = null
      }
    }
  }

  if (pending) {
    results.push({ date: pending.date, description: pending.description.trim(), amount: pending.amount, bank: 'ocbc' })
  }

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
      const val = parseFloat(m[1].replace(/,/g, ''))
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
export function parseOCBCPDF(text: string): ParseResult {
  const endingBalance = extractClosingBalance(text)

  const columnar = parseOCBCPDFColumnar(text)
  if (columnar.length > 0) return { transactions: columnar, endingBalance }

  // Columnar parse yielded nothing — likely plain-text extraction (no column alignment).
  // Log the first 40 lines to help diagnose future format changes.
  const preview = text.split('\n').slice(0, 40).join('\n')
  console.warn('[parseOCBCPDF] Columnar parse yielded 0 results, trying plain-text fallback.\nText preview:\n' + preview)

  const plainText = parseOCBCPDFPlainText(text)
  if (plainText.length === 0) {
    console.warn('[parseOCBCPDF] Plain-text fallback also yielded 0 results. Full text length:', text.length)
  }
  return { transactions: plainText, endingBalance }
}
