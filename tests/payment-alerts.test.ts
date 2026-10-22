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

// OCBC PayNow by NRIC, with the bank placeholder instead of a Memo
const ocbcNric = alertOf(
  OCBC,
  "PayNow transfer made",
  `The following PayNow transfer has been made to OXX KXXX using his/her NRIC (-123A).

Date\t: 05 Oct 2026
Time\t: 09:15 PM SGT
Amount\t: SGD 50.00
From your account\t: 360 Account (-000111)
Description\t: OTHR
Reference number\t: 0000000000000001`
)
assert.equal(ocbcNric.payeeNricEnding, "123A")
assert.equal(ocbcNric.memo, undefined)
assert.equal(
  isSelfTransferAlert(
    ocbcNric,
    selfAccountsFromEnv({ FINANCE_SELF_NRIC_ENDINGS: "s1234123a" })
  ),
  true
)

// OCBC PayNow to a business by UEN; a bare reference is not a Memo
const ocbcUen = alertOf(
  OCBC,
  "PayNow transfer made",
  `The following PayNow transfer has been made to MADE UP FOOD PTE LTD using their Unique Entity Number (UEN) 000000000A.
Date\t: 07 Oct 2026
Time\t: 02:13 AM SGT
Amount\t: SGD 7.70
From your account\t: 360 Account (-000111)
Description\t: QL0abcDEF1230000004XYZ
Reference number\t: 0000000000000002`
)
assert.equal(ocbcUen.payeeKind, "merchant")
assert.equal(ocbcUen.payee, "MADE UP FOOD PTE LTD")
assert.equal(ocbcUen.memo, undefined)

// OCBC top-up of the owner's Wise is a Wallet Top-up
const wise = alertOf(
  OCBC,
  "You have sent money to WISE ASIA-PACIFIC PTE LTD via PayNow-VPA UEN",
  `As you requested, we have sent money to WISE ASIA-PACIFIC PTE LTD using Virtual Payment Address UEN number UEN000000000R#WISE. Here are the details of your transfer:
Date of Transfer\t:\t08 Oct 2026
Time of Transfer\t:\t06:09 AM SGT
Amount\t:\tSGD 150.00
From your account\t:\t360 Account (-000111)
Description/reference no.\t:\tP00000000QR`
)
assert.equal(wise.payeeKind, "wallet")
assert.equal(wise.date, "2026-10-08")
assert.equal(wise.time, "06:09")
assert.equal(wise.amount, -150)

// OCBC withdrawal
const cash = alertOf(
  OCBC,
  "OCBC Alert Withdrawal Made",
  "A sum of SGD 100.00 was withdrawn from your account (-000111) at 7:42 AM on 14 Oct 2026."
)
assert.equal(cash.method, "withdrawal")
assert.equal(cash.time, "07:42")
assert.equal(cash.amount, -100)

// UOB reversal of a card charge
const reversed = parsePaymentAlert({
  from: UOB,
  subject: "Your transaction has been reversed",
  body: "A transaction of 12.30 SGD made with your UOB card ending 2222 on 4 Oct 26, 1:10AM at MADE UP CABS has been reversed. UOB EMAIL DISCLAIMER",
})
assert.equal(reversed.kind, "reversal")
if (reversed.kind === "reversal") {
  assert.equal(reversed.reversal.amount, 12.3)
  assert.equal(reversed.reversal.date, "2026-10-04")
  assert.equal(reversed.reversal.payee, "MADE UP CABS")
}

// Bank emails that are not money leaving are skipped, not surfaced
for (const subject of [
  "Your eStatement/eAdvice is ready for viewing",
  "Your card is locked",
  "UOB-PayNow transfer received",
]) {
  assert.equal(
    parsePaymentAlert({ from: UOB, subject, body: "" }).kind,
    "ignored",
    subject
  )
}

// Trust card spending, local: date before the card
const TRUST = "notification@trustbank.sg"
const trustCard = alertOf(
  TRUST,
  "Yay! Transaction successful 😁",
  "Didn't do this? Please contact us via your Trust App.\nYou've spent SGD 4.50 at MADE UP KOPITIAM 12345678 SG on 22 Oct 2026 13:05SGT with Trust Link card. Not you? Alert us via Trust App."
)
assert.equal(trustCard.bank, "trust")
assert.equal(trustCard.method, "card")
assert.equal(trustCard.payee, "MADE UP KOPITIAM")
assert.equal(trustCard.date, "2026-10-22")
assert.equal(trustCard.time, "13:05")
assert.equal(trustCard.amount, -4.5)

// Trust overseas: card before the date, SGD amount already converted
const trustOverseas = alertOf(
  TRUST,
  "Yay! Overseas transaction successful 😁",
  "1% FX fees! You've spent SGD 28.90 at MADE UP SUB +14155550000 US with Freedom credit card on 03 Oct 2026 09:12SGT. You'll receive estimated S$0.29 cashback*."
)
assert.equal(trustOverseas.payee, "MADE UP SUB")
assert.equal(trustOverseas.amount, -28.9)
assert.equal(trustOverseas.date, "2026-10-03")

// Trust sometimes writes the time as GMT+08:00
const trustGmt = alertOf(
  TRUST,
  "Yay! Transaction successful 😁",
  "You've spent SGD 1.20 at MADE UP CLOUD +6500000000 SG on 2 Oct 2026 06:42GMT+08:00 with Trust Link card."
)
assert.equal(trustGmt.payee, "MADE UP CLOUD")
assert.equal(trustGmt.date, "2026-10-02")
assert.equal(trustGmt.time, "06:42")

// A foreign charge without an SGD amount waits for the Statement
const trustUsd = alertOf(
  TRUST,
  "Yay! Overseas transaction successful 😁",
  "1% FX fees! You've spent USD 5.00 using Trust Link card at MADE UP HOSTING +14150000000 US on 8 Oct 2026 21:40SGT."
)
assert.equal(trustUsd.amount, null)
assert.equal(trustUsd.foreignAmount, -5)
assert.equal(trustUsd.currency, "USD")
assert.equal(trustUsd.payee, "MADE UP HOSTING")

// Digits stuck to the merchant name are a terminal number
assert.equal(
  alertOf(
    TRUST,
    "Yay! Transaction successful 😁",
    "You've spent SGD 13.46 at MADE UP App Paymen63805858 SG on 16 Oct 2026 17:16SGT with Trust Link card."
  ).payee,
  "MADE UP App Paymen"
)

// Trust PayNow out
const trustPayNow = alertOf(
  TRUST,
  "Yay! Your Paynow transfer's a success.",
  "Your PayNow transfer of SGD 1,200.00 from A/C ending 9999 to OXX KXXX on 05 Oct 2026 10:00 SGT is successful."
)
assert.equal(trustPayNow.method, "paynow")
assert.equal(trustPayNow.payee, "OXX KXXX")
assert.equal(trustPayNow.amount, -1200)
assert.equal(trustPayNow.accountEnding, "9999")

// Trust cancelled charge and refund are reversals; a refund can be weeks later
const cancelled = parsePaymentAlert({
  from: TRUST,
  subject: "Transaction cancelled 💳",
  body: "We've cancelled your purchase of SGD 12.40 at MADE UP RIDES Singapore SG on 10 Oct 2026 08:00SGT with Trust Link card.",
})
assert.equal(cancelled.kind, "reversal")
const refunded = parsePaymentAlert({
  from: TRUST,
  subject: "Ta-da! Transaction refunded 🙂",
  body: "We've refunded SGD 2.99 from MADE UP MEMBERSHIP SINGAPORE 12345 SG to your Trust card on 4 Oct 2026 07:30SGT. Tap to view your account.",
})
assert.equal(refunded.kind, "reversal")
if (refunded.kind === "reversal") {
  assert.equal(refunded.reversal.amount, 2.99)
  assert.equal(refunded.reversal.daysBack, 60)
}

// Trust emails that are not money leaving
for (const subject of [
  "Oh no! Transaction declined 😔",
  "Yay! You've received a PayNow transfer.",
  "Your credit card statement is in 😁",
]) {
  assert.equal(
    parsePaymentAlert({ from: TRUST, subject, body: "" }).kind,
    "ignored",
    subject
  )
}

console.log("payment alerts test passed")
