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
export function parseOCBCPDF(text: string): RawTransaction[] {
  const year = extractStatementYear(text)
  const depositColStart = detectDepositColumn(text)
  const lines = text.split('\n')
  const results: RawTransaction[] = []

  let currentTx: { date: string; description: string; amount: number } | null = null
  let inTransactionSection = false

  for (const line of lines) {
    // Detect start of transaction section (header row with column names)
    if (/Date\s+Date\s+Description/i.test(line)) {
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
