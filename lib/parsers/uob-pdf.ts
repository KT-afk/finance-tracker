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

  const layoutTransactions = parseLayoutCreditCardText(text, statementYear, statementMonth)
  if (layoutTransactions.length > 0) return layoutTransactions

  const stackedTransactions = parseStackedCreditCardText(text, statementYear, statementMonth)
  if (stackedTransactions.length > 0) return stackedTransactions

  return parseAccountStatementText(text)
}

function parseLayoutCreditCardText(
  text: string,
  statementYear: number,
  statementMonth: number
): RawTransaction[] {
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

function parseStackedCreditCardText(
  text: string,
  statementYear: number,
  statementMonth: number
): RawTransaction[] {
  const lines = text.split('\n')
  const results: RawTransaction[] = []

  let inTransactionSection = false
  let pendingTx: { date: string; description: string } | null = null

  function pushTransaction(description: string, date: string, amountStr: string, cr?: string) {
    results.push({
      date,
      description: description.trim(),
      amount: cr ? parseFloat(amountStr.replace(/,/g, '')) : -parseFloat(amountStr.replace(/,/g, '')),
      bank: 'uob',
    })
  }

  for (const line of lines) {
    const trimmed = line.trim()

    if (/Description of Transaction Transaction Amount/i.test(trimmed)) {
      inTransactionSection = true
      pendingTx = null
      continue
    }

    if (/End of Transaction Details/i.test(trimmed)) {
      inTransactionSection = false
      pendingTx = null
      continue
    }

    if (!inTransactionSection) continue
    if (SKIP_PATTERNS.some(p => p.test(trimmed))) continue
    if (/^(SGD|Post|Date|Trans)$/i.test(trimmed)) continue
    if (/^--\s*\d+\s+of\s+\d+\s*--$/i.test(trimmed)) continue
    if (/^Page \d+ of \d+/i.test(trimmed)) continue
    if (/^Please note that/i.test(trimmed)) continue
    if (/United Overseas Bank Limited/i.test(trimmed)) continue
    if (/^\d{4}-\d{4}-\d{4}-\d{4}/.test(trimmed)) continue

    const amountOnly = trimmed.match(/^([\d,]+\.\d{2})\s*(CR)?$/i)
    if (amountOnly && pendingTx) {
      pushTransaction(pendingTx.description, pendingTx.date, amountOnly[1], amountOnly[2])
      pendingTx = null
      continue
    }

    if (IGNORE_CONTINUATION.some(p => p.test(trimmed))) continue

    const txMatch = trimmed.match(
      new RegExp(String.raw`^(${DATE_TOKEN})\s+(${DATE_TOKEN})\s+(.+?)(?:\s+([\d,]+\.\d{2})\s*(CR)?)?$`, 'i')
    )

    if (txMatch) {
      const [, , transDate, description, amountStr, cr] = txMatch
      const date = resolveDate(transDate, statementYear, statementMonth)

      if (amountStr) {
        pushTransaction(description, date, amountStr, cr)
      } else {
        pendingTx = { date, description: description.trim() }
      }
      continue
    }

    if (pendingTx) {
      pendingTx.description += ' ' + trimmed
    }
  }

  return results
}

function parseAccountStatementText(text: string): RawTransaction[] {
  const periodMatch = text.match(/Period:\s+\d{1,2}\s+([A-Za-z]{3})\s+(\d{4})\s+to/i)
  const year = periodMatch ? parseInt(periodMatch[2]) : new Date().getFullYear()

  const lines = text.split('\n')
  const results: RawTransaction[] = []
  let inTransactionSection = false
  let runningBalance: number | null = null
  let pendingTx: { date: string; descriptionParts: string[] } | null = null

  function parseBalance(raw: string): number {
    const isOverdrawn = /OD$/i.test(raw)
    const value = parseFloat(raw.replace(/[,\sA-Z]/gi, ''))
    return isOverdrawn ? -value : value
  }

  function resolveAccountDate(dateStr: string): string {
    const [day, mon] = dateStr.trim().split(/\s+/)
    const month = MONTHS[mon.toUpperCase()]
    if (!month) throw new Error(`Unknown month: ${mon}`)
    return `${year}-${month}-${day.padStart(2, '0')}`
  }

  function cleanDescription(parts: string[]): string {
    return parts
      .filter(part => !/^(?=.*\d)[A-Z0-9]{12,}$/i.test(part.trim()))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  function inferAmount(amount: number, nextBalance: number): number {
    if (runningBalance === null) return -amount

    const depositDelta = Math.abs((runningBalance + amount) - nextBalance)
    const withdrawalDelta = Math.abs((runningBalance - amount) - nextBalance)
    return depositDelta <= withdrawalDelta ? amount : -amount
  }

  function pushPending(amountRaw: string, balanceRaw: string) {
    if (!pendingTx) return

    const amount = parseFloat(amountRaw.replace(/,/g, ''))
    const nextBalance = parseBalance(balanceRaw)
    const signedAmount = inferAmount(amount, nextBalance)

    results.push({
      date: pendingTx.date,
      description: cleanDescription(pendingTx.descriptionParts),
      amount: signedAmount,
      bank: 'uob',
    })

    runningBalance = nextBalance
    pendingTx = null
  }

  for (const line of lines) {
    const trimmed = line.trim()

    if (/Account Transaction Details/i.test(trimmed)) {
      inTransactionSection = true
      pendingTx = null
      continue
    }

    if (/End of Transaction Details/i.test(trimmed)) {
      inTransactionSection = false
      pendingTx = null
      continue
    }

    if (!inTransactionSection) continue
    if (/^(SGD|Deposits|Withdrawals|Balance)$/i.test(trimmed)) continue
    if (/^Date Description Withdrawals/i.test(trimmed)) continue
    if (/^One Account/i.test(trimmed)) continue
    if (/^Total\s/i.test(trimmed)) continue
    if (!trimmed) continue

    const balanceMatch = trimmed.match(/^(\d{1,2}\s+[A-Za-z]{3})\s+BALANCE B\/F\s+([\d,]+\.\d{2}(?:OD)?)$/i)
    if (balanceMatch) {
      runningBalance = parseBalance(balanceMatch[2])
      continue
    }

    const datedAmountMatch = trimmed.match(
      /^(\d{1,2}\s+[A-Za-z]{3})\s+(.+?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2}(?:OD)?)$/i
    )
    if (datedAmountMatch) {
      const [, dateStr, description, amountRaw, balanceRaw] = datedAmountMatch
      pendingTx = {
        date: resolveAccountDate(dateStr),
        descriptionParts: [description],
      }
      pushPending(amountRaw, balanceRaw)
      continue
    }

    const amountMatch = trimmed.match(/^([\d,]+\.\d{2})\s+([\d,]+\.\d{2}(?:OD)?)$/i)
    if (amountMatch) {
      pushPending(amountMatch[1], amountMatch[2])
      continue
    }

    const dateMatch = trimmed.match(/^(\d{1,2}\s+[A-Za-z]{3})\s+(.+)$/)
    if (dateMatch) {
      pendingTx = {
        date: resolveAccountDate(dateMatch[1]),
        descriptionParts: [dateMatch[2]],
      }
      continue
    }

    if (pendingTx) {
      pendingTx.descriptionParts.push(trimmed)
    }
  }

  return results
}
