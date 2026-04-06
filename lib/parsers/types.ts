import { Bank } from '../schema'

export interface RawTransaction {
  date: string        // ISO date string YYYY-MM-DD
  description: string
  amount: number      // negative = expense, positive = income
  bank: Bank
}

/**
 * Tokenize an entire CSV string into rows of fields.
 * Correctly handles:
 *   - Double-quoted fields containing commas, newlines, or escaped quotes ("")
 *   - Windows (\r\n), Unix (\n), and old Mac (\r) line endings
 */
export function tokenizeCSV(csv: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  // Normalise line endings to \n
  const src = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          // Escaped quote
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        // Newlines inside quotes are part of the field value
        field += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        row.push(field)
        field = ''
      } else if (ch === '\n') {
        row.push(field)
        field = ''
        rows.push(row)
        row = []
      } else {
        field += ch
      }
    }
  }
  // Push the last field/row
  row.push(field)
  if (row.some(f => f !== '')) rows.push(row)

  return rows
}

/**
 * Parse a CSV string into an array of key-value records.
 * Handles quoted fields, multi-line fields, and metadata rows before the header.
 * The header row is identified as the first row whose first cell matches any of
 * the provided candidate header names (case-insensitive). Falls back to the
 * first non-empty row.
 */
export function parseCSVRows(
  csv: string,
  headerCandidates?: string[]
): Record<string, string>[] {
  const allRows = tokenizeCSV(csv)
  if (allRows.length === 0) return []

  // Find the header row
  let headerIdx = 0
  if (headerCandidates && headerCandidates.length > 0) {
    const candidates = headerCandidates.map(c => c.toLowerCase())
    for (let i = 0; i < allRows.length; i++) {
      const firstCell = (allRows[i][0] ?? '').trim().toLowerCase()
      if (candidates.includes(firstCell)) {
        headerIdx = i
        break
      }
    }
  } else {
    // Default: skip blank rows to find first non-empty row
    while (headerIdx < allRows.length && allRows[headerIdx].every(c => c.trim() === '')) {
      headerIdx++
    }
  }

  if (headerIdx >= allRows.length) return []

  const headers = allRows[headerIdx].map(h => h.trim())
  const rows: Record<string, string>[] = []

  for (let i = headerIdx + 1; i < allRows.length; i++) {
    const values = allRows[i]
    if (values.every(v => v.trim() === '')) continue
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      row[h] = (values[idx] ?? '').trim()
    })
    rows.push(row)
  }

  return rows
}

/**
 * Convert DD MMM YYYY (e.g. "01 Jan 2024") to YYYY-MM-DD
 */
export function parseDDMMMYYYY(dateStr: string): string {
  const months: Record<string, string> = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04',
    May: '05', Jun: '06', Jul: '07', Aug: '08',
    Sep: '09', Oct: '10', Nov: '11', Dec: '12',
  }
  const parts = dateStr.trim().split(' ')
  if (parts.length !== 3) throw new Error(`Invalid date: ${dateStr}`)
  const [day, mon, year] = parts
  const month = months[mon]
  if (!month) throw new Error(`Unknown month: ${mon}`)
  return `${year}-${month}-${day.padStart(2, '0')}`
}

/**
 * Convert DD/MM/YYYY to YYYY-MM-DD
 */
export function parseDDMMYYYY(dateStr: string): string {
  const parts = dateStr.trim().split('/')
  if (parts.length !== 3) throw new Error(`Invalid date: ${dateStr}`)
  const [day, month, year] = parts
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

/**
 * Convert YYYY-MM-DD or DD/MM/YYYY or DD MMM YYYY to YYYY-MM-DD
 */
export function parseFlexibleDate(dateStr: string): string {
  const s = dateStr.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return parseDDMMYYYY(s)
  if (/^\d{2} \w{3} \d{4}$/.test(s)) return parseDDMMMYYYY(s)
  throw new Error(`Unrecognised date format: ${dateStr}`)
}
