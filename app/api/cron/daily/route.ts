import { NextRequest, NextResponse } from "next/server"
import {
  budgetWarnings,
  buildDailySummary,
  nightlyKind,
  formatDailyMessage,
} from "@/lib/daily-message"
import { buildWeeklyReview, formatWeeklyReview } from "@/lib/weekly-review"
import { buildMonthlyRecap, formatMonthlyRecap } from "@/lib/monthly-recap"
import { ingestPaymentAlerts } from "@/lib/payment-alerts/ingest"
import { OutlookAuthError } from "@/lib/payment-alerts/outlook"
import {
  dailyMessageTarget,
  sendTelegram,
  sendTelegramTo,
} from "@/lib/telegram"

// Reading mail, categorising and sending can take a while
export const maxDuration = 60

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const SGT_OFFSET_MS = 8 * 60 * 60 * 1000

function monthStartSgt(now: Date): Date {
  const sgt = new Date(now.getTime() + SGT_OFFSET_MS)
  return new Date(
    Date.UTC(sgt.getUTCFullYear(), sgt.getUTCMonth(), 1) - SGT_OFFSET_MS
  )
}

function appUrl(): string | null {
  const configured = process.env.APP_URL?.trim()
  if (configured) return configured.replace(/\/$/, "")
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  return vercel ? `https://${vercel}` : null
}

/**
 * The daily job: read new Payment Alerts, then send the 10pm message.
 * Vercel Cron calls it with `Authorization: Bearer $CRON_SECRET`.
 * `?dryRun=1` reads mail and builds the message without saving or sending.
 * On the 1st it sends the monthly review instead, and on Sundays the weekly
 * review (`?review=monthly|weekly` forces one).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 503 }
    )
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1"

  const now = new Date()
  const warnings: string[] = []
  let ingested = 0
  try {
    const result = await ingestPaymentAlerts({
      // The whole month so far (and at least a week, so a missed day at a
      // month start catches up); each email is still processed once
      since: new Date(
        Math.min(now.getTime() - WEEK_MS, monthStartSgt(now).getTime())
      ),
      dryRun,
    })
    ingested = result.outcomes.length
  } catch (error) {
    // The message still goes out, leading with what went wrong
    warnings.push(
      error instanceof OutlookAuthError
        ? "Couldn't read your email (Outlook sign-in), numbers are incomplete"
        : `Couldn't read your email (${error instanceof Error ? error.message : "unknown error"}), numbers are incomplete`
    )
  }

  // Daily insights in the group once configured, else the owner's chat
  const target = dailyMessageTarget()
  const send = (text: string) =>
    target ? sendTelegramTo(text, target) : sendTelegram(text)

  // One message a night: the monthly review on the 1st, the weekly review
  // on Sundays, otherwise the daily message. ?review=monthly|weekly forces one
  const sgt = new Date(now.getTime() + SGT_OFFSET_MS)
  const forced = req.nextUrl.searchParams.get("review")
  const kind =
    forced === "monthly" || forced === "weekly" ? forced : nightlyKind(now)

  let message: string
  if (kind === "daily") {
    message = formatDailyMessage(
      await buildDailySummary(now, warnings),
      appUrl()
    )
  } else {
    // Built for its warnings (such as bank emails it couldn't read)
    await buildDailySummary(now, warnings)
    let review: string
    if (kind === "monthly") {
      const last = new Date(
        Date.UTC(sgt.getUTCFullYear(), sgt.getUTCMonth() - 1, 1)
      )
      review = formatMonthlyRecap(
        await buildMonthlyRecap(last.toISOString().slice(0, 7))
      )
    } else {
      const weekly = await buildWeeklyReview(now)
      warnings.push(...budgetWarnings(weekly.budgets))
      review = formatWeeklyReview(weekly)
    }
    // Problems reading email still lead the message
    message = [
      ...warnings.map((w) => `⚠️ ${w}`),
      ...(warnings.length ? [""] : []),
      review,
    ].join("\n")
  }
  if (!dryRun) await send(message)

  return NextResponse.json({ ingested, sent: !dryRun, kind, message })
}
