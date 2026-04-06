import { RawTransaction, parseCSVRows, parseDDMMMYYYY } from './types'

/**
 * Parse DBS/POSB CSV export.
 * Expected columns: Date, Reference, Debit Amount, Credit Amount, (Balance)
 * Date format: DD MMM YYYY (e.g. "01 Jan 2024")
 * Debit = expense (negative), Credit = income (positive)
 */
export function parseDBS(csv: string): RawTransaction[] {
  const rows = parseCSVRows(csv, ['Date', 'Transaction Date'])
  const results: RawTransaction[] = []

  for (const row of rows) {
    const dateStr = row['Date'] ?? ''
    const description = row['Reference'] ?? row['Description'] ?? row['Particulars'] ?? ''
    const debitStr = row['Debit Amount'] ?? row['Withdrawals'] ?? ''
    const creditStr = row['Credit Amount'] ?? row['Deposits'] ?? ''

    if (!dateStr || !description) continue

    let date: string
    try {
      date = parseDDMMMYYYY(dateStr)
    } catch {
      // Try YYYY-MM-DD fallback
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
        date = dateStr.trim()
      } else {
        continue
      }
    }

    const debit = parseFloat(debitStr.replace(/,/g, '')) || 0
    const credit = parseFloat(creditStr.replace(/,/g, '')) || 0

    let amount: number
    if (debit > 0) {
      amount = -debit
    } else if (credit > 0) {
      amount = credit
    } else {
      continue
    }

    results.push({ date, description: description.trim(), amount, bank: 'dbs' })
  }

  return results
}
