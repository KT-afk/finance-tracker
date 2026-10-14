import assert from "node:assert/strict"
import { parseTrustPDF } from "../lib/parsers/trust-pdf"
import { checkReconciliation } from "../lib/parsers/reconcile"

// pdf-parse output from a real Trust savings statement (trimmed): tab-separated
// columns, FX amount on a later line, both closing balances after "Savings".
const trustPlainText = `
Statement period \t1 May 2026 - 31 May 2026
ACTIVITY SUMMARY
Savings Account by Trust
Main Account \tS$11.93 \tS$2,668.00 \tS$1,007.09
S$0.00
S$1,672.84
Savings \tS$0.00 \tS$1,000.00 \tS$0.00 \tS$1,000.00
Total \tS$11.93 \tS$3,668.00 \tS$1,007.09 \tS$0.00 \tS$2,672.84
TRANSACTION DETAILS
Main Account
Posting date \tDescription \tAmount in FCY \tAmount in SGD
01 May \tPrevious balance \t11.93
04 May \tAmazon Web Services \t0.72
06 May \tRAILWAY +14157077675 US
1 USD = 1.274 SGD TRUST FX CHARGE = 0%
5.00 USD \t6.37
17 May \tONG CHEE KIAM \t+2,668.00
27 May \tSavings \t1,000.00

-- 2 of 3 --

Trust Bank Singapore Limited
Page 3 of 3
Main Account
Posting date \tDescription \tAmount in FCY \tAmount in SGD
01 May \tPrevious balance \t11.93
Savings
Posting date \tDescription \tAmount in FCY \tAmount in SGD
01 May \tPrevious balance \t0.00
27 May \tMain Account \t+1,000.00
31 May \tClosing balance \t1,672.84
31 May \tClosing balance \t1,000.00
`

const result = parseTrustPDF(trustPlainText)
assert.deepEqual(
  result.transactions.map((t) => [t.date, t.description, t.amount]),
  [
    ["2026-05-04", "Amazon Web Services", -0.72],
    ["2026-05-06", "RAILWAY +14157077675 US", -6.37],
    ["2026-05-17", "ONG CHEE KIAM", 2668],
    ["2026-05-27", "Savings", -1000],
    ["2026-05-27", "Main Account", 1000],
  ]
)
assert.equal(result.accountType, "savings")
// Total across Main Account + Savings, not just the last pot listed.
assert.equal(result.endingBalance, 2672.84)
assert.equal(checkReconciliation(result)?.ok, true)

console.log("Trust PDF parser test passed")
