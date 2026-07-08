import { RawTransaction, ParseResult } from './types'

const MONTHS: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04',
  May: '05', Jun: '06', Jul: '07', Aug: '08',
  Sep: '09', Oct: '10', Nov: '11', Dec: '12',
}

const SKIP_LINES = [
  /Previous balance/i,
  /Interest$/i,
  /^\s*$/,
]

/**
 * Extract statement year and month from Trust Bank PDF.
 * Looks for "Statement period  1 Mar 2026 - 31 Mar 2026"
 */
function extractStatementInfo(text: string): { year: number; month: string } {
  const match = text.match(/Statement period\s+\d+\s+(\w+)\s+(\d{4})/i)
  if (match) {
    const mon = match[1]
    const year = parseInt(match[2])
    const monthNum = MONTHS[mon]
    return { year, month: monthNum ?? '01' }
  }
  const now = new Date()
  return { year: now.getFullYear(), month: String(now.getMonth() + 1).padStart(2, '0') }
}

/**
 * Parse Trust Bank PDF text (from pdftotext -layout) into RawTransactions.
 *
 * Format:
 *   Posting date   Description                    Amount in FCY   Amount in SGD
 *   DD MMM         Description text                               [+]amount
 *
 * - Amounts with "+" prefix are deposits/income
 * - Amounts without prefix are withdrawals/expenses
 * - Foreign currency transactions have an FCY amount and a separate SGD amount
 * - Continuation lines (e.g., FX rate info) are indented
 * - "Main Account" and "Savings" are section headers
 */
export function parseTrustPDF(text: string): ParseResult {
  const { year, month } = extractStatementInfo(text)
  const lines = text.split('\n')
  const results: RawTransaction[] = []
  let endingBalance: number | undefined

  let inTransactionSection = false
  let currentTx: { date: string; description: string; amount: number } | null = null

  for (const line of lines) {
    // Detect transaction section start
    if (/^Posting date\s+Description/i.test(line)) {
      inTransactionSection = true
      continue
    }

    // Section ends at page boundary or new section
    if (/^Page \d+ of \d+/i.test(line.trim()) || /^Trust Bank Singapore/i.test(line.trim())) {
      if (currentTx) {
        results.push({
          date: currentTx.date,
          description: currentTx.description.trim(),
          amount: currentTx.amount,
          bank: 'trust',
        })
        currentTx = null
      }
      inTransactionSection = false
      continue
    }

    // "Main Account" or "Savings" headers re-enter transaction mode on next header
    if (/^(Main Account|Savings)\s*$/i.test(line.trim())) {
      if (currentTx) {
        results.push({
          date: currentTx.date,
          description: currentTx.description.trim(),
          amount: currentTx.amount,
          bank: 'trust',
        })
        currentTx = null
      }
      continue
    }

    if (!inTransactionSection) continue

    // Capture closing balance before skipping
    const closingMatch = line.match(/Closing balance\s+([\d,]+\.\d{2})/i)
    if (closingMatch) {
      endingBalance = parseFloat(closingMatch[1].replace(/,/g, ''))
      continue
    }

    // Skip known non-transaction lines
    if (SKIP_LINES.some(p => p.test(line))) continue

    // Try to match a transaction line: DD MMM  Description  [FCY amount]  SGD amount
    const txMatch = line.match(
      /^(\d{2}\s+[A-Za-z]{3})\s{2,}(.+?)\s{2,}(\+?[\d,]+\.\d{2})\s*$/
    )

    if (txMatch) {
      // Flush previous
      if (currentTx) {
        results.push({
          date: currentTx.date,
          description: currentTx.description.trim(),
          amount: currentTx.amount,
          bank: 'trust',
        })
      }

      const [, dateStr, descAndMaybeFcy, amountStr] = txMatch

      // The description might include an FCY amount — strip it
      // FCY amounts look like "434,600.00 KRW" before the SGD amount
      const description = descAndMaybeFcy
        .replace(/[\d,]+\.\d{2}\s+[A-Z]{3}\s*$/, '')
        .trim()

      const day = dateStr.split(/\s+/)[0]
      const date = `${year}-${month}-${day.padStart(2, '0')}`

      const isDeposit = amountStr.startsWith('+')
      const amount = parseFloat(amountStr.replace(/[+,]/g, ''))

      currentTx = {
        date,
        description,
        amount: isDeposit ? amount : -amount,
      }
    } else if (currentTx) {
      // Continuation line (e.g., FX rate info) — skip, don't append
      // Trust PDFs put FX details on continuation lines which aren't useful for descriptions
    }
  }

  // Flush last
  if (currentTx) {
    results.push({
      date: currentTx.date,
      description: currentTx.description.trim(),
      amount: currentTx.amount,
      bank: 'trust',
    })
  }

  return { transactions: results, endingBalance }
}
