import assert from "node:assert/strict"
import {
  categorize,
  getEffectiveAmount,
  getKnownCategory,
} from "../lib/categorize"

async function main() {
  const previousKey = process.env.ANTHROPIC_API_KEY
  delete process.env.ANTHROPIC_API_KEY

  try {
    assert.equal(
      getKnownCategory(
        "PAYMENT/TRANSFER via PayNow-TRBU from ONG KONG TAT OTHR 20260607TRBUSGSGBRT318506",
        -3000
      ),
      "Transfer",
      "self-transfers must be excluded even when an imported amount has the wrong sign"
    )

    assert.equal(
      getKnownCategory("Ong KONG TAT", -4605),
      "Transfer",
      "account-holder metadata must not be counted as spending"
    )

    assert.equal(
      getKnownCategory(
        "IBG GIRO SALA Wise Asia-Pacific P Wise SG Salary",
        6733.55
      ),
      "Income",
      "salary credits must override generic merchant rules"
    )
    assert.equal(
      getEffectiveAmount(
        "IBG GIRO SALA Wise Asia-Pacific P Wise SG Salary",
        -6733.55
      ),
      6733.55,
      "mis-signed salary credits must be corrected for existing data"
    )

    assert.equal(
      await categorize(
        "PAYMENT/TRANSFER via PayNow-TRBU from ONG KONG TAT OTHR 20260607TRBUSGSGBRT318506",
        { amount: 3000 }
      ),
      "Transfer",
      "self-transfers must not be categorized as income or spend"
    )

    assert.equal(
      await categorize(
        "PAYMENT/TRANSFER via PayNow-DBSS from YOON THIRI OTHR Remainder of mar/apr",
        { amount: 500 }
      ),
      "Income",
      "incoming payments from other people must not be categorized as spend"
    )

    assert.equal(
      await categorize("FAST PAYMENT via PayNow-Mobile to LANDLORD OTHR-rent", {
        amount: -2400,
      }),
      "Housing",
      "rent payments must be categorized as Housing"
    )

    assert.equal(
      await categorize(
        "COLLECTION/TRANSFER OTHR Interactive Br U17113938.839959",
        { amount: -500 }
      ),
      "Credit Card Payment",
      "credit card repayments must be excluded from spend"
    )

    await assert.rejects(
      () => categorize("NETS QR PURCHASE PU TIAN", { requireAi: true }),
      /ANTHROPIC_API_KEY is not configured/
    )
  } finally {
    if (previousKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY
    } else {
      process.env.ANTHROPIC_API_KEY = previousKey
    }
  }

  console.log("strict categorization test passed")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
