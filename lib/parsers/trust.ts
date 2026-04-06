import { RawTransaction, parseCSVRows } from './types'

/**
 * Parse Trust Bank CSV export.
 * Expected columns: Date, Description, Amount
 * Amounts are already signed: negative = expense, positive = income.
 * Date format: YYYY-MM-DD
 */
export function parseTrust(csv: string): RawTransaction[] {
  const rows = parseCSVRows(csv, ['Date', 'Transaction Date'])
  const results: RawTransaction[] = []

  for (const row of rows) {
    const dateStr = row['Date'] ?? ''
    const description = row['Description'] ?? row['Transaction Description'] ?? ''
    const amountStr = row['Amount'] ?? ''

    if (!dateStr || !description || !amountStr) continue

    let date: string
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
      date = dateStr.trim()
    } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr.trim())) {
      const parts = dateStr.trim().split('/')
      date = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
    } else {
      continue
    }

    const amount = parseFloat(amountStr.replace(/,/g, ''))
    if (isNaN(amount)) continue

    results.push({ date, description: description.trim(), amount, bank: 'trust' })
  }

  return results
}
