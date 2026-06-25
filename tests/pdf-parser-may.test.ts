import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { extractTextFromPDF } from '../lib/parsers/pdf'
import { parseOCBCPDF } from '../lib/parsers/ocbc-pdf'
import { parseUOBCreditCardPDF } from '../lib/parsers/uob-pdf'

const exactOcbcPath = process.env.OCBC_MAY_PDF
const exactUobPath = process.env.UOB_MAY_PDF

const ocbcText = `
01 MAY 2026 TO 31 MAY 2026
Transaction Date Date Description Cheque Withdrawal       Deposit Balance
  1 May  1 May    PAYNOW TRANSFER TO SHOP       12.30                 987.70
  12 May 12 May   SALARY CREDIT                                 1,000.00     1,987.70
BALANCE C/F
`

const uobText = `
Statement Date 31 May 2026
Post Date Trans Date Description Amount
  1 May  1 May  COFFEE SHOP                  4.50
  10 May 10 May CASHBACK                     2.00 CR
End of Transaction Details
`

const ocbcTransactions = parseOCBCPDF(ocbcText)
assert.equal(ocbcTransactions.length, 2)
assert.deepEqual(
  ocbcTransactions.map(t => [t.date, t.description, t.amount, t.bank]),
  [
    ['2026-05-01', 'PAYNOW TRANSFER TO SHOP', -12.3, 'ocbc'],
    ['2026-05-12', 'SALARY CREDIT', 1000, 'ocbc'],
  ]
)

const uobTransactions = parseUOBCreditCardPDF(uobText)
assert.equal(uobTransactions.length, 2)
assert.deepEqual(
  uobTransactions.map(t => [t.date, t.description, t.amount, t.bank]),
  [
    ['2026-05-01', 'COFFEE SHOP', -4.5, 'uob'],
    ['2026-05-10', 'CASHBACK', 2, 'uob'],
  ]
)

async function main() {
  if (exactOcbcPath && existsSync(exactOcbcPath)) {
    const exactText = await extractTextFromPDF(readFileSync(exactOcbcPath))
    const exactTransactions = parseOCBCPDF(exactText)
    assert.equal(exactTransactions.length, 20)
    assert.equal(exactTransactions[0].date, '2026-05-01')
    assert.equal(exactTransactions.at(-1)?.date, '2026-05-31')
  }

  if (exactUobPath && existsSync(exactUobPath)) {
    const exactText = await extractTextFromPDF(readFileSync(exactUobPath))
    const exactTransactions = parseUOBCreditCardPDF(exactText)
    assert.equal(exactTransactions.length, 45)
    assert.equal(exactTransactions[0].date, '2026-04-26')
    assert.equal(exactTransactions.at(-1)?.date, '2026-05-23')
  }

  console.log('May PDF parser test passed')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
