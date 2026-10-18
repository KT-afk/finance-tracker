import assert from "node:assert/strict"
import { parseWise } from "../lib/parsers/wise"
import { normalize } from "../lib/parsers/normalizer"

const header =
  'ID,Status,Direction,"Created on","Finished on","Source fee amount","Source fee currency","Target fee amount","Target fee currency","Source name","Source amount (after fees)","Source currency","Target name","Target amount (after fees)","Target currency","Exchange rate",Reference,Batch,"Created by",Category,Note'

const csv = [
  header,
  // One card payment split across EUR and SGD balances → one S$43.01 transaction
  '"CARD_TRANSACTION-4478177648",COMPLETED,OUT,"2026-10-16 10:36:54","2026-10-16 10:36:54",0.01,EUR,,,"Kong Tat Ong",2.78,EUR,Grab,4.00,SGD,1.4406300000000000,,,"Kong Tat Ong","Eating out",',
  '"CARD_TRANSACTION-4478177648",COMPLETED,OUT,"2026-10-16 10:36:54","2026-10-16 10:36:54",0.00,SGD,,,"Kong Tat Ong",39.00,SGD,Grab,39.00,SGD,1.0000000000000000,,,"Kong Tat Ong","Eating out",',
  // Self top-up
  'TRANSFER-2431483937,COMPLETED,IN,"2026-10-14 12:27:48","2026-10-14 12:28:21",0.00,SGD,,,"Kong Tat Ong",5.0,SGD,"Kong Tat Ong",5.0,SGD,1.0,,,"Kong Tat Ong","Money added",',
  // Cancelled / refunded are skipped
  '"CARD_TRANSACTION-4469366972",CANCELLED,OUT,"2026-10-14 12:23:50","2026-10-14 12:23:50",,,,,"Kong Tat Ong",43.00,SGD,Grab,43.00,SGD,1,,,"Kong Tat Ong","Eating out",',
  '"CARD_TRANSACTION-4452631354",REFUNDED,OUT,"2026-10-10 16:31:23","2026-10-10 16:31:23",,,,,"Kong Tat Ong",42.60,SGD,Grab,42.60,SGD,1,,,"Kong Tat Ong",Transport,',
  // Two identical Grab rides on the same day must both survive
  '"CARD_TRANSACTION-4450697403",COMPLETED,OUT,"2026-10-10 09:52:19","2026-10-10 09:52:19",0.00,SGD,,,"Kong Tat Ong",1.65,SGD,Grab,1.65,SGD,1.0000000000000000,,,"Kong Tat Ong",Transport,',
  '"CARD_TRANSACTION-4449691296",COMPLETED,OUT,"2026-10-10 04:33:01","2026-10-10 04:33:01",0.00,SGD,,,"Kong Tat Ong",1.65,SGD,Grab,1.65,SGD,1.0000000000000000,,,"Kong Tat Ong",Transport,',
  // MYR transfer with a fee and a typed reference; "General" → no category hint
  'TRANSFER-2419159602,COMPLETED,OUT,"2026-10-08 04:51:12","2026-10-08 04:51:15",0.04,SGD,,,"Kong Tat Ong",15.04,SGD,"CHEAH ENTERPRISE CO",48.0,MYR,3.19236,"alarm clock",,"Kong Tat Ong",General,',
  // Reference that is just a code is dropped
  'TRANSFER-2419072378,COMPLETED,OUT,"2026-10-08 03:17:23","2026-10-08 03:17:26",0.05,SGD,,,"Kong Tat Ong",17.45,SGD,"TAI TONG RESTAURANT",55.7,MYR,3.19288,MBBQR111113934736320,,"Kong Tat Ong",General,',
  'TRANSFER-2418787179,COMPLETED,IN,"2026-10-07 22:09:26","2026-10-07 22:09:56",0.00,SGD,,,"Kong Tat Ong",150.0,SGD,"Kong Tat Ong",150.0,SGD,1.0,,,"Kong Tat Ong","Money added",',
  '"CARD_TRANSACTION-4415462212",COMPLETED,OUT,"2026-10-02 16:20:08","2026-10-02 16:20:08",0.94,SGD,,,"Kong Tat Ong",491.03,SGD,Booking.com,1568.55,MYR,3.1943900000000000,,,"Kong Tat Ong",Trips,',
  // EUR spend: converted at the SGD→EUR rate of the latest conversion before it
  '"CARD_TRANSACTION-3913687723",COMPLETED,OUT,"2026-06-12 13:12:16","2026-06-12 13:12:16",0.00,EUR,,,"Kong Tat Ong",5.90,EUR,Bolt,5.90,EUR,1.0000000000000000,,,"Kong Tat Ong",Transport,',
  '"BALANCE_TRANSACTION-5468098798",COMPLETED,NEUTRAL,"2026-06-12 13:11:34","2026-06-12 13:11:34",0.14,SGD,,,"Kong Tat Ong",71.86,SGD,"Kong Tat Ong",48.38,EUR,0.6733060000000000,,,"Kong Tat Ong",General,',
  // Money from someone else stays a Transfer for review
  'TRANSFER-2187839986,COMPLETED,IN,"2026-06-12 10:22:39","2026-06-12 10:22:43",,,,,"Mei Xuan Jin",11.5,EUR,"Kong Tat Ong",11.5,EUR,1,684595,,,"Money added",',
  '"BALANCE_TRANSACTION-5461409635",COMPLETED,NEUTRAL,"2026-06-11 12:04:06","2026-06-11 12:04:06",0.20,SGD,,,"Kong Tat Ong",99.80,SGD,"Kong Tat Ong",67.16,EUR,0.6729770000000000,,,"Kong Tat Ong",General,',
].join("\n")

const { transactions, endingBalance } = parseWise(csv)
assert.equal(endingBalance, undefined)
assert.deepEqual(
  transactions.map((t) => [
    t.date,
    t.description,
    t.amount,
    t.categoryHint ?? null,
  ]),
  [
    ["2026-10-16", "Grab", -43.01, "Food & Drink"],
    ["2026-10-14", "Money added · Kong Tat Ong", 5, "Self Transfer"],
    ["2026-10-10", "Grab", -1.65, "Transport"],
    ["2026-10-10", "Grab", -1.65, "Transport"],
    [
      "2026-10-08",
      "CHEAH ENTERPRISE CO · 48.00 MYR · “alarm clock”",
      -15.08,
      null,
    ],
    ["2026-10-08", "TAI TONG RESTAURANT · 55.70 MYR", -17.5, null],
    ["2026-10-07", "Money added · Kong Tat Ong", 150, "Self Transfer"],
    ["2026-10-02", "Booking.com · 1,568.55 MYR", -491.97, "Travel"],
    // 5.90 EUR / 0.673306 (12 Jun 13:11 conversion) = S$8.76
    ["2026-06-12", "Bolt · 5.90 EUR", -8.76, "Transport"],
    // 11.50 EUR / 0.672977 (11 Jun conversion; the 13:11 one is later) = S$17.09
    ["2026-06-12", "Money added · Mei Xuan Jin · 11.50 EUR", 17.09, "Transfer"],
  ]
)
assert.ok(transactions.every((t) => t.bank === "wise"))

// Wise IDs drive dedupe, so identical same-day rides get different hashes
const hashes = normalize(transactions).map((t) => t.hash)
assert.equal(new Set(hashes).size, hashes.length)
// …and re-parsing the same file gives the same hashes
assert.deepEqual(
  normalize(parseWise(csv).transactions).map((t) => t.hash),
  hashes
)

console.log("Wise CSV parser test passed")
