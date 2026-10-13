import { ParseResult } from "./types"

export interface Reconciliation {
  expected: number // net change the statement's own totals imply
  actual: number // sum of parsed transaction amounts
  difference: number // actual - expected
  ok: boolean
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Compare parsed transactions against the statement's own opening/closing
 * figures. Returns undefined when the parser couldn't read those figures.
 */
export function checkReconciliation(
  result: Pick<ParseResult, "transactions" | "expectedNet">
): Reconciliation | undefined {
  if (result.expectedNet === undefined) return undefined

  const expected = round2(result.expectedNet)
  const actual = round2(
    result.transactions.reduce((sum, t) => sum + t.amount, 0)
  )
  const difference = round2(actual - expected)
  return { expected, actual, difference, ok: Math.abs(difference) < 0.005 }
}
