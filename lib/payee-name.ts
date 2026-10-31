import { describeTransaction } from "./describe-transaction"

// A short name for the message: the alert's Payee, else the tidied bank text
export function displayName(row: {
  payee: string | null
  description: string
}) {
  const name = row.payee ?? describeTransaction(row.description).title
  return (
    name
      .replace(/\s+(?:SINGAPORE|SGP?)\b.*$/i, "")
      .replace(/\s·\s.*$/, "")
      .trim() || name
  )
}
