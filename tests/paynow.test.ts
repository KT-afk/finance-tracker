import assert from "node:assert/strict"
import {
  parsePayNowDescription,
  parseStatementDescription,
} from "../lib/parsers/paynow"

// Old CSV formats keep working
assert.deepEqual(
  parsePayNowDescription(
    "FAST PAYMENT OTHR-rent for feb to CHEW NGENG HIANG via PayNow-Mobile"
  ),
  {
    memo: "rent for feb",
    recipient: "CHEW NGENG HIANG",
    method: "PayNow-Mobile",
  }
)
assert.deepEqual(
  parsePayNowDescription("NETS QR KING KONG CURRY NETS QR PURCHASE 69529901"),
  { memo: "", recipient: "KING KONG CURRY", method: "NETS-QR" }
)
// A bare terminal number is not a merchant
assert.deepEqual(
  parsePayNowDescription(
    "NETS QR 23068347 NETS QR PURCHASE EVER FRAGRANT CHICKEN RIC"
  ),
  { memo: "", recipient: "", method: "" }
)

// PDF statement formats
const cases: [string, { memo: string; recipient: string; method: string }][] = [
  [
    "FAST PAYMENT via PayNow-Mobile to NX YUNXXX MADELX OTHR-jewellery",
    {
      memo: "jewellery",
      recipient: "NX YUNXXX MADELX",
      method: "PayNow-Mobile",
    },
  ],
  [
    "FAST PAYMENT via PayNow-NRIC/FIN to ONX KOXX TAX OTHR-credit card bill -- 3 of 6 --",
    {
      memo: "credit card bill",
      recipient: "ONX KOXX TAX",
      method: "PayNow-NRIC",
    },
  ],
  [
    "FUND TRANSFER via PayNow-QR Code to CREATIVE COFFEE OTHR - QL0OcO0kBCbs00000001PE",
    { memo: "", recipient: "CREATIVE COFFEE", method: "PayNow-QR" },
  ],
  [
    "FAST PAYMENT via PayNow-UEN to HITPAY PAYMENTS OTHR-DICNP17825440367882F 9ZC",
    { memo: "", recipient: "HITPAY PAYMENTS", method: "PayNow-UEN" },
  ],
  [
    "FAST PAYMENT via PayNow-UEN to JOM TEH TARIK PT OTHR-EPOSSPSUR3QLNOMUWIKA CU",
    { memo: "", recipient: "JOM TEH TARIK PT", method: "PayNow-UEN" },
  ],
  [
    "PAYMENT/TRANSFER via PayNow-DBSS from YOON THIRI OTHR Jul + jun (remainder",
    { memo: "Jul + jun (remainder", recipient: "YOON THIRI", method: "PayNow" },
  ],
  [
    "PAYMENT/TRANSFER via PayNow-HSBC from LEFEUVRE PAUL OTHR PayNow payment -- 1 of 5 --",
    { memo: "", recipient: "LEFEUVRE PAUL", method: "PayNow" },
  ],
  [
    "FAST PAYMENT 2722550225 to kong tat OTHR-Other",
    { memo: "", recipient: "kong tat", method: "FAST" },
  ],
  [
    "NETS QR 23068347 NETS QR PURCHASE EVER FRAGRANT CHICKEN RIC",
    { memo: "", recipient: "EVER FRAGRANT CHICKEN RIC", method: "NETS-QR" },
  ],
  [
    "IBG GIRO COLL 100912530 Singapore Telecommu 100048798295",
    { memo: "", recipient: "Singapore Telecommu", method: "GIRO" },
  ],
  [
    "IBG GIRO SALA Wise Asia-Pacific P Wise SG Salary -- 5 of 7 --",
    {
      memo: "",
      recipient: "Wise Asia-Pacific P Wise SG Salary",
      method: "GIRO",
    },
  ],
  [
    "COLLECTION/TRANSFER COLL Chocfin Pte Lt 408fd3977ac2496bba3 Choc OngKongTat 0913072528461",
    { memo: "", recipient: "Chocfin Pte Lt", method: "Collection" },
  ],
  [
    "FUND TRANSFER via PayNow-QR Code to F&N FOODS PTE LT OTHR - QR3 dy00lx2t9 0069",
    { memo: "", recipient: "F&N FOODS PTE LT", method: "PayNow-QR" },
  ],
  [
    "FUND TRANSFER via PayNow-QR Code to TAX CHX LIXX OTHR - pau and siew mai",
    {
      memo: "pau and siew mai",
      recipient: "TAX CHX LIXX",
      method: "PayNow-QR",
    },
  ],
  // Not a transfer: nothing to extract
  ["FAIRPRICE FINEST - TBP SINGAPORE", { memo: "", recipient: "", method: "" }],
  ["INTEREST CREDIT", { memo: "", recipient: "", method: "" }],
]
for (const [description, expected] of cases) {
  assert.deepEqual(
    parseStatementDescription(description),
    expected,
    description
  )
}

console.log("paynow parser test passed")
