import assert from "node:assert/strict"
import { parseChocolatePDF } from "../lib/parsers/chocolate-pdf"
import { checkReconciliation } from "../lib/parsers/reconcile"
import { normalize } from "../lib/parsers/normalizer"

// pdf-parse output from a real statement (trimmed): wrapped merchant names,
// a top-up, and returns that accrue without moving the balance on their row.
const text = `
1 Sep 2026 – 30 Sep 2026
SGD Account
Start of month balance
S$20.00
End of month balance
S$111.40
Your transactions
Date \tTransaction \tIn \tOut Balance after
transaction
01 Sep Card transaction: SMRT Buses / trains \tS$1.28 \tS$18.72
01 Sep Card transaction: SMRT Buses / trains \tS$1.28 \tS$17.44
13 Sep Money added \tS$100.00 \tS$117.44
17 Sep Card transaction: Everegreen106
Henderso S$4.00 \tS$113.44
Page 2 of 11

-- 2 of 11 --

https://chocolatefinance.com
21 Sep Card transaction: SP Digital \tS$2.14 \tS$111.30
30 Sep Monthly returns \tS$0.10 \tS$111.30
Page 3 of 11
Chocolate Managed Account
02 Sep 02 Sep Sell: USF 0.91 unit S$1.42 -S$1.28
`

const result = parseChocolatePDF(text)
assert.deepEqual(
  result.transactions.map((t) => [
    t.date,
    t.description,
    t.amount,
    t.categoryHint ?? null,
  ]),
  [
    ["2026-09-01", "SMRT Buses / trains", -1.28, "Transport"],
    ["2026-09-01", "SMRT Buses / trains", -1.28, "Transport"],
    ["2026-09-13", "Money added", 100, "Self Transfer"],
    ["2026-09-17", "Everegreen106 Henderso", -4, null],
    ["2026-09-21", "SP Digital", -2.14, "Bills & Utilities"],
    ["2026-09-30", "Monthly returns", 0.1, "Income"],
  ]
)
assert.equal(result.endingBalance, 111.4)
assert.equal(checkReconciliation(result)?.ok, true)
// Identical same-day rides must not collide on dedupe
const hashes = normalize(result.transactions).map((t) => t.hash)
assert.equal(new Set(hashes).size, hashes.length)

console.log("Chocolate PDF parser test passed")
