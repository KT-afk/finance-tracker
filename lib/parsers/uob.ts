import { RawTransaction, ParseResult, parseCSVRows, parseDDMMYYYY } from './types'

/**
 * Parse UOB CSV export.
 * Expected columns: Account, Transaction Date, Description, Withdrawal, Deposit, Balance
 * Date format: DD/MM/YYYY
 * Withdrawal = expense (negative), Deposit = income (positive)
 */
export function parseUOB(csv: string): ParseResult {
  const rows = parseCSVRows(csv, ['Transaction Date', 'Account', 'Date'])
  const results: RawTransaction[] = []
  let endingBalance: number | undefined

  for (const row of rows) {
    const dateStr = row['Transaction Date'] ?? row['Date'] ?? ''
    const description = row['Description'] ?? row['Reference'] ?? ''
    const withdrawalStr = row['Withdrawal'] ?? row['Withdrawals'] ?? ''
    const depositStr = row['Deposit'] ?? row['Deposits'] ?? ''
    const balanceStr = row['Balance'] ?? ''

    if (!dateStr || !description) continue

    let date: string
    try {
      date = parseDDMMYYYY(dateStr)
    } catch {
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
        date = dateStr.trim()
      } else {
        continue
      }
    }

    const withdrawal = parseFloat(withdrawalStr.replace(/,/g, '')) || 0
    const deposit = parseFloat(depositStr.replace(/,/g, '')) || 0
    const balance = parseFloat(balanceStr.replace(/,/g, '')) || 0

    let amount: number
    if (withdrawal > 0) {
      amount = -withdrawal
    } else if (deposit > 0) {
      amount = deposit
    } else {
      continue
    }

    results.push({ date, description: description.trim(), amount, bank: 'uob' })

    // Capture the last valid balance as the ending balance
    if (balance > 0 || balance < 0) {
      endingBalance = balance
    }
  }

  return { transactions: results, endingBalance }
}
