import { Bank } from '../schema'
import { RawTransaction, ParseResult } from './types'
import { parseOCBC } from './ocbc'
import { parseDBS } from './dbs'
import { parseUOB } from './uob'
import { parseTrust } from './trust'
import { extractTextFromPDF } from './pdf'
import { parseUOBCreditCardPDF } from './uob-pdf'
import { parseOCBCPDF } from './ocbc-pdf'
import { parseTrustPDF } from './trust-pdf'

export type { RawTransaction } from './types'
export type { ParseResult } from './types'

/**
 * Route a CSV string to the correct parser based on the bank name.
 */
export function parseCSV(csv: string, bank: Bank): ParseResult {
  switch (bank) {
    case 'ocbc':
      return parseOCBC(csv)
    case 'dbs':
      return parseDBS(csv)
    case 'uob':
      return parseUOB(csv)
    case 'trust':
      return parseTrust(csv)
    default:
      throw new Error(`Unsupported bank: ${bank}`)
  }
}

/**
 * Parse a file (CSV or PDF) into RawTransactions.
 * Detects file type by filename extension.
 */
export async function parseFile(
  buffer: Buffer,
  filename: string,
  bank: Bank
): Promise<ParseResult> {
  const isPDF = filename.toLowerCase().endsWith('.pdf')

  if (isPDF) {
    const text = await extractTextFromPDF(buffer)

    if (bank === 'uob') {
      return { transactions: parseUOBCreditCardPDF(text) }
    }
    if (bank === 'ocbc') {
      return { transactions: parseOCBCPDF(text) }
    }
    if (bank === 'trust') {
      return { transactions: parseTrustPDF(text) }
    }
    throw new Error(`PDF upload is not supported for ${bank}. Please upload a CSV file.`)
  }

  // CSV path (existing)
  const csv = Buffer.from(buffer).toString('utf-8')
  return parseCSV(csv, bank)
}
