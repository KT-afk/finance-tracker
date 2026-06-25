import { RawTransaction } from './types'

const MONTHS: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04',
  MAY: '05', JUN: '06', JUL: '07', AUG: '08',
  SEP: '09', OCT: '10', NOV: '11', DEC: '12',
}

const DATE_TOKEN = String.raw`\d{1,2}\s+[A-Z]{3}`

// Match: DD MMM  DD MMM  Description  Amount
const TX_LINE = new RegExp(
  String.raw`^\s+(${DATE_TOKEN})\s+(${DATE_TOKEN})\s+(.+?)\s{2,}([\d,]+\.\d{2})\s*(CR)?\s*$`,
  'i'
)

// Lines to skip entirely
const SKIP_PATTERNS = [
  /PREVIOUS BALANCE/i,
  /SUB TOTAL/i,
  /TOTAL BALANCE/i,
  /^\s*$/,
]

// Lines that indicate a page boundary (flush current tx, exit section)
const PAGE_BOUNDARY = /Please note that you are bound/i

// Continuation lines to ignore (not part of merchant description)
const IGNORE_CONTINUATION = [
  /^Ref No\.\s*:/,
  /^USD\s+[\d,.]+/,
  /^[A-Z]{3}\s+[\d,.]+$/,  // Foreign currency line like "USD 139.00"
  /^-{10,}/,               // Page separator dashes
]

/**
 * Extract the statement year from pdftotext output.
 * Looks for "Statement Date" line with format "DD MMM YYYY".
 */
function extractStatementYear(text: string): number {
  const match = text.match(/Statement Date\s+(\d{1,2}\s+[A-Z]{3}\s+(\d{4}))/i)
  if (match) return parseInt(match[2])
  return new Date().getFullYear()
}

/**
 * Convert "DD MMM" + statement year to YYYY-MM-DD.
 * If the transaction month is after the statement month, it's from the previous year.
 */
function resolveDate(ddMmm: string, statementYear: number, statementMonth: number): string {
  const parts = ddMmm.trim().split(/\s+/)
  if (parts.length !== 2) throw new Error(`Invalid date: ${ddMmm}`)
  const [day, mon] = parts
  const month = MONTHS[mon.toUpperCase()]
  if (!month) throw new Error(`Unknown month: ${mon}`)

  const monthNum = parseInt(month)
  const year = monthNum > statementMonth + 1 ? statementYear - 1 : statementYear

  return `${year}-${month}-${day.padStart(2, '0')}`
}

/**
 * Parse UOB credit card PDF text (from pdftotext -layout) into RawTransactions.
 */
export function parseUOBCreditCardPDF(text: string): RawTransaction[] {
  const statementYear = extractStatementYear(text)
  const stmtMatch = text.match(/Statement Date\s+\d{1,2}\s+([A-Z]{3})\s+\d{4}/i)
  const statementMonth = stmtMatch ? parseInt(MONTHS[stmtMatch[1].toUpperCase()] ?? '1') : 1

  const lines = text.split('\n')
  const results: RawTransaction[] = []

  let inTransactionSection = false
  let currentTx: { date: string; description: string; amount: number } | null = null

  for (const line of lines) {
    if (/Post(?:ing)?(?:\s+Date)?\s+Trans(?:action)?(?:\s+Date)?\s+Description/i.test(line)) {
      inTransactionSection = true
      continue
    }

    // End of all transactions
    if (/End of Transaction Details/i.test(line)) {
      inTransactionSection = false
      if (currentTx) {
        results.push({
          date: currentTx.date,
          description: currentTx.description.trim(),
          amount: currentTx.amount,
          bank: 'uob',
        })
        currentTx = null
      }
      continue
    }

    // Page boundary — flush current tx and exit section (next page will re-enter)
    if (PAGE_BOUNDARY.test(line)) {
      if (currentTx) {
        results.push({
          date: currentTx.date,
          description: currentTx.description.trim(),
          amount: currentTx.amount,
          bank: 'uob',
        })
        currentTx = null
      }
      inTransactionSection = false
      continue
    }

    if (!inTransactionSection) continue

    if (SKIP_PATTERNS.some(p => p.test(line))) continue

    const txMatch = line.match(TX_LINE)
    if (txMatch) {
      if (currentTx) {
        results.push({
          date: currentTx.date,
          description: currentTx.description.trim(),
          amount: currentTx.amount,
          bank: 'uob',
        })
      }

      const [, , transDate, description, amountStr, cr] = txMatch
      const date = resolveDate(transDate, statementYear, statementMonth)
      const amount = parseFloat(amountStr.replace(/,/g, ''))

      currentTx = {
        date,
        description: description.trim(),
        amount: cr ? amount : -amount,
      }
    } else if (currentTx) {
      const trimmed = line.trim()
      // Skip ref numbers and foreign currency lines
      if (trimmed && !IGNORE_CONTINUATION.some(p => p.test(trimmed))) {
        currentTx.description += ' ' + trimmed
      }
    }
  }

  if (currentTx) {
    results.push({
      date: currentTx.date,
      description: currentTx.description.trim(),
      amount: currentTx.amount,
      bank: 'uob',
    })
  }

  return results
}
