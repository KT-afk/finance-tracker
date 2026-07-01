import { RawTransaction, ParseResult, parseCSVRows } from './types'

/**
 * Parse OCBC CSV export.
 *
 * Real format (360 Account export):
 *   - 5 metadata rows at the top (account details, balances, blank line, "Transaction History")
 *   - Header row: "Transaction date,Value date,Description,Withdrawals(SGD),Deposits(SGD)"
 *   - Descriptions are multi-line quoted fields (newline embedded inside the quotes)
 *   - Date format: DD/MM/YYYY
 *   - Amounts may contain commas (e.g. "3,000.00")
 *
 * We use headerCandidates to skip the metadata and land on the right header row.
 */
export function parseOCBC(csv: string): ParseResult {
  // "Transaction date" is the first cell of the real header row
  const rows = parseCSVRows(csv, ['Transaction date', 'Transaction Date'])
  const results: RawTransaction[] = []
  let endingBalance: number | undefined

  for (const row of rows) {
    // Column name variants (case-insensitive key matching handled below)
    const dateStr =
      row['Transaction date'] ??
      row['Transaction Date'] ??
      row['Date'] ??
      ''

    // Description may contain embedded newlines — collapse them to a space
    const description = (
      row['Description'] ?? ''
    ).replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim()

    const withdrawalStr =
      row['Withdrawals(SGD)'] ??
      row['Withdrawals'] ??
      row['Withdrawal'] ??
      ''

    const depositStr =
      row['Deposits(SGD)'] ??
      row['Deposits'] ??
      row['Deposit'] ??
      ''

    const balanceStr =
      row['Balance'] ??
      row['Available Balance'] ??
      ''

    if (!dateStr || !description) continue

    // Parse DD/MM/YYYY → YYYY-MM-DD
    let date: string
    const trimmed = dateStr.trim()
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
      const parts = trimmed.split('/')
      date = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      date = trimmed
    } else {
      continue
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

    results.push({ date, description, amount, bank: 'ocbc' })

    // Capture the last valid balance as the ending balance
    if (balance > 0 || balance < 0) {
      endingBalance = balance
    }
  }

  return { transactions: results, endingBalance }
}
