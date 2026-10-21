/**
 * Read OCBC/UOB Payment Alert emails from Outlook into Transactions.
 *
 * Usage:
 *   npm run alerts:ingest -- --dry-run [--since 2026-10-01]
 *   npm run alerts:ingest -- [--since 2026-10-01]
 *
 * --dry-run shows what would be saved without writing anything.
 * --since defaults to the first of the current month.
 */
import { config } from "dotenv"
import path from "path"

config({ path: path.join(process.cwd(), ".env.local") })
config({ path: path.join(process.cwd(), ".env") })

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
  const { ingestPaymentAlerts } = await import("../lib/payment-alerts/ingest")
  const dryRun = process.argv.includes("--dry-run")
  const now = new Date()
  const since = new Date(
    arg("--since") ??
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
  )

  const result = await ingestPaymentAlerts({ since, dryRun })
  const money = new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
  })

  console.log(dryRun ? "DRY RUN: nothing written\n" : "")
  console.log(
    `Bank emails since ${since.toISOString().slice(0, 10)}: ${result.fetched}` +
      ` (already processed ${result.alreadyProcessed})\n`
  )
  for (const o of result.outcomes) {
    if (o.transaction) {
      const t = o.transaction
      console.log(
        [
          t.date,
          t.time ?? "--:--",
          t.bank.toUpperCase().padEnd(4),
          money.format(t.amount).padStart(12),
          t.category.padEnd(20),
          t.payee + (t.memo ? ` · ${t.memo}` : ""),
        ].join("  ")
      )
    } else if (o.status === "reversed") {
      console.log(`REVERSED    ${o.receivedAt.slice(0, 16)}  ${o.reason}`)
    } else if (o.status === "unrecognised") {
      console.log(`UNREAD      ${o.receivedAt.slice(0, 16)}  ${o.reason}`)
    }
  }
  const saved = result.outcomes.filter((o) => o.status === "saved")
  const spend = saved
    .filter((o) => o.transaction!.amount < 0)
    .reduce((sum, o) => sum + o.transaction!.amount, 0)
  console.log(
    `\n${saved.length} payments (${money.format(Math.abs(spend))} out),` +
      ` ${result.outcomes.filter((o) => o.status === "self-transfer").length} self transfers,` +
      ` ${result.outcomes.filter((o) => o.status === "reversed").length} reversals,` +
      ` ${result.outcomes.filter((o) => o.status === "ignored").length} not payments,` +
      ` ${result.outcomes.filter((o) => o.status === "unrecognised").length} unread`
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
