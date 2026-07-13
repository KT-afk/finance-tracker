import assert from "node:assert/strict"
import {
  classifyCashFlow,
  shouldRecategorizeTransaction,
  summarizeCashFlow,
  type CashFlowTransaction,
} from "../lib/cash-flow"

const selfTransfer = classifyCashFlow({
  description:
    "PAYMENT/TRANSFER via PayNow-TRBU from ONG KONG TAT OTHR 20260618TRBUSGSGBRT024032",
  amount: 1300,
  category: "Transfer",
})
assert.equal(selfTransfer.category, "Self Transfer")
assert.equal(selfTransfer.countsAsIncome, false)
assert.equal(selfTransfer.countsAsSpend, false)

const ambiguousTransfer = classifyCashFlow({
  description:
    "PAYMENT/TRANSFER via PayNow-DBSS from TEO HWEE CHIN OTHR PayNow Transfer",
  amount: 40,
  category: "Income",
})
assert.equal(ambiguousTransfer.category, "Transfer")
assert.equal(ambiguousTransfer.countsAsIncome, false)
assert.equal(
  shouldRecategorizeTransaction({
    description:
      "PAYMENT/TRANSFER via PayNow-DBSS from TEO HWEE CHIN OTHR PayNow Transfer",
    amount: 40,
    category: "Transfer",
    is_corrected: false,
  }),
  false,
  "ambiguous transfers must remain available for review instead of being guessed by AI"
)

const reimbursement = classifyCashFlow({
  description:
    "PAYMENT/TRANSFER via PayNow-DBSS from YOON THIRI OTHR Remainder of mar/apr",
  amount: -500,
  category: "Income",
})
assert.equal(reimbursement.category, "Reimbursement")
assert.equal(reimbursement.countsAsReimbursement, true)
assert.equal(reimbursement.countsAsIncome, false)
assert.equal(reimbursement.effectiveAmount, 500)

assert.equal(
  shouldRecategorizeTransaction({
    description: "Bill Payment mBK-UOB Cards",
    amount: -1509.92,
    category: "Others",
    is_corrected: true,
  }),
  false,
  "user-corrected transactions must never be changed by the backfill"
)

assert.equal(
  classifyCashFlow({
    description: "IBG GIRO SALA Wise Asia-Pacific P Wise SG Salary",
    amount: 6733.55,
    category: "Transfer",
  }).category,
  "Income"
)

assert.equal(
  classifyCashFlow({
    description: "FAST PAYMENT via PayNow-Mobile to LANDLORD OTHR-rent",
    amount: -2400,
    category: "Transfer",
  }).category,
  "Housing"
)

assert.equal(
  classifyCashFlow({
    description: "Bill Payment mBK-UOB Cards",
    amount: -1509.92,
    category: "Others",
  }).category,
  "Credit Card Payment"
)

const summary = summarizeCashFlow([
  {
    description: "IBG GIRO SALA Wise Asia-Pacific P Wise SG Salary",
    amount: 6733.55,
    category: "Income",
  },
  {
    description:
      "PAYMENT/TRANSFER via PayNow-DBSS from YOON THIRI OTHR Remainder of mar/apr",
    amount: -500,
    category: "Income",
  },
  {
    description:
      "PAYMENT/TRANSFER via PayNow-TRBU from ONG KONG TAT OTHR 20260618TRBUSGSGBRT024032",
    amount: 1300,
    category: "Transfer",
  },
  {
    description: "FAST PAYMENT via PayNow-Mobile to LANDLORD OTHR-rent",
    amount: -2400,
    category: "Housing",
  },
  {
    description:
      "PAYMENT/TRANSFER via PayNow-DBSS from TEO HWEE CHIN OTHR PayNow Transfer",
    amount: 40,
    category: "Transfer",
  },
] satisfies CashFlowTransaction[])
assert.deepEqual(summary, {
  income: 6733.55,
  reimbursements: 500,
  spend: 2400,
  netCashFlow: 4833.55,
  unclassifiedTransfers: 40,
})

console.log("cash flow semantics test passed")
