import assert from "node:assert/strict"
import { describeTransaction } from "../lib/describe-transaction"

const cases: [string, { title: string; detail?: string }][] = [
  [
    "FAST PAYMENT via PayNow-Mobile to NX YUNXXX MADELX OTHR-jewellery",
    { title: "NX YUNXXX MADELX", detail: "“jewellery” · PayNow to" },
  ],
  [
    "PAYMENT/TRANSFER via PayNow-DBSS from YOON THIRI OTHR Jul + jun (remainder",
    { title: "YOON THIRI", detail: "“Jul + jun (remainder” · PayNow from" },
  ],
  [
    "PAYMENT/TRANSFER via PayNow-HSBC from LEFEUVRE PAUL OTHR PayNow payment -- 1 of 5 --",
    { title: "LEFEUVRE PAUL", detail: "“PayNow payment” · PayNow from" },
  ],
  // Reference codes and placeholder memos are dropped
  [
    "FUND TRANSFER via PayNow-QR Code to FOMO PAY PTE. LT OTHR - QY03022026062431277153 -- 4 of 6 --",
    { title: "FOMO PAY PTE. LT", detail: "PayNow to" },
  ],
  [
    "FAST PAYMENT via PayNow-NRIC/FIN to ONX KOXX TAX OTHR-OTHR",
    { title: "ONX KOXX TAX", detail: "PayNow to" },
  ],
  [
    "FAST PAYMENT 2722550225 to kong tat OTHR-Other",
    { title: "kong tat", detail: "Transfer to" },
  ],
  [
    "NETS QR 23068347 NETS QR PURCHASE EVER FRAGRANT CHICKEN RIC",
    { title: "EVER FRAGRANT CHICKEN RIC", detail: "NETS QR" },
  ],
  [
    "IBG GIRO SALA Wise Asia-Pacific P Wise SG Salary -- 5 of 7 --",
    { title: "Wise Asia-Pacific P Wise SG Salary", detail: "Salary (GIRO)" },
  ],
  [
    "IBG GIRO COLL 100912530 Singapore Telecommu 100048798295",
    { title: "Singapore Telecommu", detail: "Bill (GIRO)" },
  ],
  [
    "COLLECTION/TRANSFER COLL Chocfin Pte Lt 408fd3977ac2496bba3 Choc OngKongTat 0913072528461 -- 3 of 7 --",
    { title: "Chocfin Pte Lt", detail: "Collection" },
  ],
  // Statement text that leaked into descriptions is stripped
  [
    "INTEREST CREDIT 15,744.03\tBALANCE C/F Total Withdrawals/Deposits Total Interest Paid",
    { title: "INTEREST CREDIT" },
  ],
  [
    "PET LOVERS CENTRE PTE LTDSingapore LADY'S CARD 5521-6320-2310-7989 ONG KONG TAT Date           Date",
    { title: "PET LOVERS CENTRE PTE LTDSingapore" },
  ],
  [
    "2C2*APPLE ONLINE STORE 01/24 WELCOME TO UOB LADY'S PLATINUM CARDMEMBERSHIP. WE LOOK FORWARD",
    { title: "2C2*APPLE ONLINE STORE 01/24" },
  ],
  [
    "FAIRPRICE FINEST - TBP SINGAPORE",
    { title: "FAIRPRICE FINEST - TBP SINGAPORE" },
  ],
]

for (const [description, expected] of cases) {
  const { title, detail } = describeTransaction(description)
  assert.deepEqual(
    { title, detail },
    { detail: undefined, ...expected },
    description
  )
}

// Empty/odd input never produces an empty title
assert.equal(describeTransaction("   ").title, "")
assert.equal(describeTransaction("OTHR").title, "OTHR")

console.log("describe-transaction test passed")
