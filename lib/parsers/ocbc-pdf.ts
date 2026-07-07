import { RawTransaction } from './types'

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
function parseOCBCPDFColumnar(text: string): RawTransaction[] {
  const year = extractStatementYear(text)
  const depositColStart = detectDepositColumn(text)
  const lines = text.split('\n')
  const results: RawTransaction[] = []

  let currentTx: { date: string; description: string; amount: number } | null = null
  let inTransactionSection = false

  for (const line of lines) {
    // Detect start of transaction section (header row with column names)
    if (/Date\s+Date\s+Description/i.test(line) || /Transaction\s+Date/i.test(line)) {
      inTransactionSection = true
      continue
    }

    // Page boundary — flush current transaction, exit section (next page re-enters)
    // Only match "Deposit Insurance Scheme" at line start (not indented watermarks)
    if (/^Deposit Insurance Scheme/i.test(line)) {
      if (currentTx) {
        results.push({
          date: currentTx.date,
          description: currentTx.description.trim(),
          amount: currentTx.amount,
          bank: 'ocbc',
        })
        currentTx = null
      }
      inTransactionSection = false
      continue
    }

    // Skip known non-transaction lines
    if (SKIP_PATTERNS.some(p => p.test(line))) {
      if (/BALANCE C\/F/i.test(line)) {
        if (currentTx) {
          results.push({
            date: currentTx.date,
            description: currentTx.description.trim(),
            amount: currentTx.amount,
            bank: 'ocbc',
          })
          currentTx = null
        }
        inTransactionSection = false
      }
      continue
    }

    if (!inTransactionSection) continue

    // Try to match a transaction line: DD MMM  DD MMM  Description ... amounts
    const txMatch = line.match(
      new RegExp(String.raw`^\s+(${DATE_TOKEN})\s+${DATE_TOKEN}\s{2,}(.+)`, 'i')
    )

    if (txMatch) {
      // Flush previous transaction
      if (currentTx) {
        results.push({
          date: currentTx.date,
          description: currentTx.description.trim(),
          amount: currentTx.amount,
          bank: 'ocbc',
        })
      }

      const dateStr = txMatch[1]
      const fullLine = line

      // Find all amounts in the line
      const amounts = [...fullLine.matchAll(/([\d,]+\.\d{2})/g)]

      if (amounts.length >= 2) {
        // The transaction amount is the second-to-last; the last is balance
        const txAmountMatch = amounts[amounts.length - 2]
        const txAmount = parseFloat(txAmountMatch[0].replace(/,/g, ''))

        // Check if the amount is in the Deposit column (position >= depositColStart)
        const amountPosition = txAmountMatch.index!
        const isDeposit = amountPosition >= depositColStart

        // Description: everything in the description area (between value date and first amount)
        const descStart = fullLine.indexOf(txMatch[2])
        const descEnd = txAmountMatch.index!
        const description = fullLine.substring(descStart, descEnd).replace(/\s{2,}/g, ' ').trim()

        const date = resolveDate(dateStr, year)

        currentTx = {
          date,
          description,
          amount: isDeposit ? txAmount : -txAmount,
        }
      } else {
        currentTx = null
      }
    } else if (currentTx) {
      // Continuation line for current transaction description
      const trimmed = line.trim()
      if (trimmed && !IGNORE_CONTINUATION.some(p => p.test(trimmed))) {
        currentTx.description += ' ' + trimmed
      }
    }
  }

  // Flush last transaction
  if (currentTx) {
    results.push({
      date: currentTx.date,
      description: currentTx.description.trim(),
      amount: currentTx.amount,
      bank: 'ocbc',
    })
  }

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
  /GIRO\s+CREDIT/i,
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
 * Plain-text fallback parser for OCBC PDFs extracted without -layout flag.
 * Works on the unaligned text that pdf-parse returns.
 *
 * Strategy:
 * - Match lines starting with "DD MMM DD MMM" (transaction date + value date)
 * - Extract the description text between the dates and the first amount
 * - Classify debit/credit using keyword matching on the description
 * - If no keywords match, treat as debit (most OCBC transactions are withdrawals)
 */
function parseOCBCPDFPlainText(text: string): RawTransaction[] {
  const year = extractStatementYear(text)
  const results: RawTransaction[] = []

  // Match lines of the form: "DD MMM DD MMM description ... amount amount"
  // Both columnar and plain-text have this basic structure per transaction line
  const TX_LINE = new RegExp(
    String.raw`\b(\d{1,2}\s+[A-Z]{3})\s+\d{1,2}\s+[A-Z]{3}\s+(.+?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$`,
    'gim'
  )

  for (const m of text.matchAll(TX_LINE)) {
    const dateStr = m[1]
    const description = m[2].replace(/\s{2,}/g, ' ').trim()
    const secondToLast = parseFloat(m[3].replace(/,/g, ''))

    // Skip balance/summary lines
    if (SKIP_PATTERNS.some(p => p.test(description))) continue
    if (/BALANCE/i.test(description)) continue

    let date: string
    try {
      date = resolveDate(dateStr, year)
    } catch {
      continue
    }

    // Determine debit vs credit via keyword matching
    const isCredit = DEPOSIT_KEYWORDS.some(kw => kw.test(description))
    const amount = isCredit ? secondToLast : -secondToLast

    results.push({ date, description, amount, bank: 'ocbc' })
  }

  return results
}

/**
 * Parse OCBC 360 Account PDF text into RawTransactions.
 * Tries the columnar parser first (requires pdftotext -layout output).
 * Falls back to a plain-text regex parser if the columnar one yields 0 results
 * (which happens when pdf-parse is used as the extraction fallback on Vercel).
 */
export function parseOCBCPDF(text: string): RawTransaction[] {
  const columnar = parseOCBCPDFColumnar(text)
  if (columnar.length > 0) return columnar

  // Columnar parse yielded nothing — likely plain-text extraction (no column alignment).
  // Log the first 40 lines to help diagnose future format changes.
  const preview = text.split('\n').slice(0, 40).join('\n')
  console.warn('[parseOCBCPDF] Columnar parse yielded 0 results, trying plain-text fallback.\nText preview:\n' + preview)

  const plainText = parseOCBCPDFPlainText(text)
  if (plainText.length === 0) {
    console.warn('[parseOCBCPDF] Plain-text fallback also yielded 0 results. Full text length:', text.length)
  }
  return plainText
}
