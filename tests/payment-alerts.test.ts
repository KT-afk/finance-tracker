/**
 * Payment Alert parsers, on made-up samples in the real formats.
 * Every name, number and reference here is invented.
 */
import assert from "node:assert/strict"
import { parsePaymentAlert } from "../lib/payment-alerts/parse"
import {
  isSelfTransferAlert,
  selfAccountsFromEnv,
} from "../lib/payment-alerts/self-accounts"

const OCBC = "notifications@ocbc.com"
const UOB = "unialerts@uobgroup.com"

function alertOf(from: string, subject: string, body: string) {
  const parsed = parsePaymentAlert({ from, subject, body })
  assert.equal(parsed.kind, "alert", JSON.stringify(parsed))
  return (parsed as Extract<typeof parsed, { kind: "alert" }>).alert
}

// OCBC PayNow to a Person, with a Memo
const ocbcPayNow = alertOf(
  OCBC,
  "OCBC Alerts",
  `The following PayNow transfer has been made to JXXX TXX using his/her Mobile (+******1111)

Date : 17 Oct 2026
Time : 12:02 PM SGT
Amount : SGD 0.30
From your account : 360 Account (-000111)
Description : chicken raw
Reference number : REF0000000001`
)
assert.equal(ocbcPayNow.method, "paynow")
assert.equal(ocbcPayNow.payeeKind, "person")
assert.equal(ocbcPayNow.payee, "JXXX TXX")
assert.equal(ocbcPayNow.payeeMobileEnding, "1111")
assert.equal(ocbcPayNow.date, "2026-10-17")
assert.equal(ocbcPayNow.time, "12:02")
assert.equal(ocbcPayNow.amount, -0.3)
assert.equal(ocbcPayNow.accountEnding, "000111")
assert.equal(ocbcPayNow.memo, "chicken raw")
assert.equal(ocbcPayNow.reference, "REF0000000001")

// OCBC NETS QR to a Merchant; the time is printed differently
const ocbcNets = alertOf(
  OCBC,
  "OCBC Alerts",
  `The following NETS QR payment has been made:

Date : 18 Oct 2026
Time : 01:48pm SGT
Amount : SGD 1,234.50
From your account : 360 Account (-000111)
To : THE MADE UP CAFE
NETS merchant ID : 000000000000001
NETS Stan ID : 000001`
)
assert.equal(ocbcNets.method, "nets-qr")
assert.equal(ocbcNets.payeeKind, "merchant")
assert.equal(ocbcNets.payee, "THE MADE UP CAFE")
assert.equal(ocbcNets.time, "13:48")
assert.equal(ocbcNets.amount, -1234.5)

// UOB card purchase: DD/MM/YY date, no time, merchant cut off by the bank
const uobCard = alertOf(
  UOB,
  "UOB - Transaction Alert",
  "A transaction of SGD 3.00 was made with your UOB Card ending 2222 on 20/10/26 at HENDERSO. If unauthorised, call 24/7 Fraud Hotline now. Long disclaimer follows."
)
assert.equal(uobCard.method, "card")
assert.equal(uobCard.date, "2026-10-20")
assert.equal(uobCard.time, undefined)
assert.equal(uobCard.amount, -3)
assert.equal(uobCard.payee, "HENDERSO")
assert.equal(uobCard.accountEnding, "2222")

// A foreign card purchase has no SGD amount until the Statement
const uobForeign = alertOf(
  UOB,
  "UOB - Transaction Alert",
  "A transaction of JPY 1,500.00 was made with your UOB Card ending 2222 on 01/11/26 at MADE UP RAMEN. If unauthorised, call now."
)
assert.equal(uobForeign.amount, null)
assert.equal(uobForeign.foreignAmount, -1500)
assert.equal(uobForeign.currency, "JPY")

// UOB card bill payment: never spending
const uobBill = alertOf(
  UOB,
  "UOB Personal Internet Banking Notification Alerts",
  "You made/scheduled a bill payment(s) of SGD 357.76 to UOB Cards on your a/c ending 3333 at 3:23PM SGT, 13 Sep 26. Bill ref: ending 4444."
)
assert.equal(uobBill.method, "bill-payment")
assert.equal(uobBill.payeeKind, "card-bill")
assert.equal(uobBill.date, "2026-09-13")
assert.equal(uobBill.time, "15:23")
assert.equal(uobBill.amount, -357.76)

// UOB PayNow from a bank account
const uobPayNow = alertOf(
  UOB,
  "UOB Personal Internet Banking Notification Alerts",
  "You made a PayNow transfer of SGD 200.00 to OXX KXXX (Mobile ending 5555) on your a/c ending 3333 at 5:33PM SGT, 18 Sep 26."
)
assert.equal(uobPayNow.payeeMobileEnding, "5555")
assert.equal(uobPayNow.time, "17:33")
assert.equal(uobPayNow.amount, -200)

// A bank email we have not seen is surfaced, not dropped
const unknown = parsePaymentAlert({
  from: OCBC,
  subject: "OCBC Alerts",
  body: "Your card statement is ready.",
})
assert.equal(unknown.kind, "unrecognised")

// Mail from anyone else is ignored
assert.equal(
  parsePaymentAlert({ from: "friend@example.com", subject: "hi", body: "" })
    .kind,
  "not-an-alert"
)

// Self Transfer by where the money went, not by name
const self = selfAccountsFromEnv({
  FINANCE_SELF_PAYNOW_MOBILES: "9000 5555",
  FINANCE_SELF_ACCOUNT_ENDINGS: "000111",
})
assert.equal(isSelfTransferAlert(uobPayNow, self), true)
assert.equal(isSelfTransferAlert(ocbcPayNow, self), false)
assert.equal(isSelfTransferAlert(ocbcNets, self), false)

console.log("payment alerts test passed")
