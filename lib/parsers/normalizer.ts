import { createHash, randomUUID } from 'crypto'
import { RawTransaction } from './types'

export interface NormalizedTransaction {
  id: string
  date: string
  description: string
  amount: number
  bank: string
  category: string
  is_corrected: boolean
  hash: string
  uploaded_at: string
}

/**
 * Compute a SHA256 hash from the key fields to enable deduplication.
 * Hash is based on: date + description + amount + bank
 */
export function computeHash(raw: RawTransaction): string {
  const input = `${raw.date}|${raw.description}|${raw.amount.toFixed(2)}|${raw.bank}`
  return createHash('sha256').update(input).digest('hex')
}

/**
 * Convert RawTransaction[] into NormalizedTransaction[] ready for DB insertion.
 * Category is left as 'Others' initially — the categorization step fills it in.
 */
export function normalize(raws: RawTransaction[]): NormalizedTransaction[] {
  const now = new Date().toISOString()
  return raws.map(raw => ({
    id: randomUUID(),
    date: raw.date,
    description: raw.description,
    amount: raw.amount,
    bank: raw.bank,
    category: 'Others',
    is_corrected: false,
    hash: computeHash(raw),
    uploaded_at: now,
  }))
}
