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

const uobPdfParseCreditCardText = `
Statement Date 26 FEB 2026
Credit Card(s) Statement
Post
Date
Trans
Date
Description of Transaction Transaction Amount
SGD
PREVIOUS BALANCE 1,680.36
27 JAN 26 JAN YA KUN KAYA TOAST SINGAPORE
Ref No. : 74103806026000022252028
7.50
28 JAN 27 JAN GITHUB, INC. GITHUB.COM
Ref No. : 24000776027100030875779
USD 30.19
39.66
04 FEB 04 FEB PAYMT THRU E-BANK/HOMEB/CYBERB (EP34) 1,662.29 CR
End of Transaction Details
`

const uobAccountPdfText = `
Period: 01 Feb 2026 to 28 Feb 2026
Account Transaction Details
One Account 761-334-971-9
Date Description Withdrawals
SGD
Deposits
SGD
Balance
SGD
01 Feb BALANCE B/F 0.44
04 Feb PAYNOW-FAST
PAYNOW OTHR
ONG KONG TAT
20260204TRBUSGSGBRT0530332
1,662.70 1,663.14
04 Feb Bill Payment
mBK-UOB Cards
4265882014524758
1,662.29 0.85
28 Feb Service Charge 5.00 4.15OD
Total 1,667.29 1,662.70 4.15OD
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

const uobPdfParseTransactions = parseUOBCreditCardPDF(uobPdfParseCreditCardText)
assert.equal(uobPdfParseTransactions.length, 3)
assert.deepEqual(
  uobPdfParseTransactions.map(t => [t.date, t.description, t.amount, t.bank]),
  [
    ['2026-01-26', 'YA KUN KAYA TOAST SINGAPORE', -7.5, 'uob'],
    ['2026-01-27', 'GITHUB, INC. GITHUB.COM', -39.66, 'uob'],
    ['2026-02-04', 'PAYMT THRU E-BANK/HOMEB/CYBERB (EP34)', 1662.29, 'uob'],
  ]
)

const uobAccountTransactions = parseUOBCreditCardPDF(uobAccountPdfText)
assert.equal(uobAccountTransactions.length, 3)
assert.deepEqual(
  uobAccountTransactions.map(t => [t.date, t.description, t.amount, t.bank]),
  [
    ['2026-02-04', 'PAYNOW-FAST PAYNOW OTHR ONG KONG TAT', 1662.7, 'uob'],
    ['2026-02-04', 'Bill Payment mBK-UOB Cards', -1662.29, 'uob'],
    ['2026-02-28', 'Service Charge', -5, 'uob'],
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
