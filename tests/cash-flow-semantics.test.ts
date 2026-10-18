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
  amount: 500,
  category: "Income",
})
assert.equal(reimbursement.category, "Reimbursement")
assert.equal(reimbursement.countsAsReimbursement, true)
assert.equal(reimbursement.countsAsIncome, false)
assert.equal(reimbursement.effectiveAmount, 500)

// Incoming transfers stay "Transfer" for review, but once the user marks one
// as Reimbursement that choice must stick.
const markedRepaid = classifyCashFlow({
  description:
    "PAYMENT/TRANSFER via PayNow-DBSS from SIOW JER JIAN OTHR Send money",
  amount: 10.9,
  category: "Reimbursement",
})
assert.equal(markedRepaid.category, "Reimbursement")
assert.equal(markedRepaid.countsAsReimbursement, true)

// A charge mis-tagged as Reimbursement must not count as money repaid.
const mistaggedCharge = classifyCashFlow({
  description: "giving.sg SG",
  amount: -50,
  category: "Reimbursement",
})
assert.equal(mistaggedCharge.countsAsReimbursement, false)
assert.equal(mistaggedCharge.effectiveAmount, -50)

// Outgoing transfers to the account holder (incl. OCBC's masked name) are
// self transfers, never spending, whatever category was stored.
for (const description of [
  "FAST PAYMENT via PayNow-NRIC/FIN to ONG KONG TAT OTHR-OTHR",
  "FAST PAYMENT via PayNow-NRIC/FIN to ONX KOXX TAX OTHR-OTHR",
  "FAST PAYMENT via PayNow-Mobile to Kong Tat OTHR-OTHR",
]) {
  const outgoing = classifyCashFlow({
    description,
    amount: -941,
    category: "Groceries",
  })
  assert.equal(outgoing.category, "Self Transfer", description)
  assert.equal(outgoing.countsAsSpend, false, description)
}
// Top-ups to Chocolate Finance are moving own money; the spending is imported
// from the Chocolate statement itself.
for (const description of [
  "COLLECTION/TRANSFER COLL Chocfin Pte Lt 408fd3977ac2496bba3 Choc OngKongTat 0913072528461",
  "FAST PAYMENT via PayNow-UEN to CHOCFIN PTE. L OTHR-OTHR",
]) {
  assert.equal(
    classifyCashFlow({ description, amount: -250, category: "Transfer" })
      .category,
    "Self Transfer",
    description
  )
}
// Card statement text that merely contains the name is still spending.
assert.equal(
  classifyCashFlow({
    description: "DECATHLON 2478 Singapore LADY'S CARD 5521 ONG KONG TAT Date",
    amount: -15.2,
    category: "Personal",
  }).countsAsSpend,
  true
)

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
    amount: 500,
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

// A split payment: only the owner's part is spend
const splitRent = classifyCashFlow({
  description: "FAST PAYMENT via PayNow-Mobile to LANDLORD OTHR-rent",
  amount: -3000,
  category: "Housing",
  owedShare: 1000,
})
assert.equal(splitRent.effectiveAmount, -2000)
assert.equal(splitRent.countsAsSpend, true)

const fullyOwed = classifyCashFlow({
  description: "GRAB DINNER",
  amount: -50,
  category: "Food & Drink",
  owedShare: 50,
})
assert.equal(fullyOwed.countsAsSpend, false)

// A repayment of money owed is neither income nor a transfer to review
const repayment = classifyCashFlow({
  description:
    "PAYMENT/TRANSFER via PayNow-DBSS from SIOW JER JIAN OTHR Send money",
  amount: 1000,
  category: "Repayment",
})
assert.equal(repayment.category, "Repayment")
assert.equal(repayment.countsAsIncome, false)
assert.equal(repayment.countsAsReimbursement, false)
assert.equal(repayment.isUnclassifiedTransfer, false)
assert.equal(repayment.countsAsSpend, false)

console.log("cash flow semantics test passed")
