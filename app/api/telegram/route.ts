import { after, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { runFinanceAgent } from "@/lib/agent/run-finance-agent"
import {
  answerCallbackQuery,
  editTelegramMessage,
  sendTelegramTo,
  sendTypingTo,
  telegramId,
} from "@/lib/telegram"
import { decideProposal } from "@/lib/agent/proposals"
import {
  handleTelegramUpdate,
  type TelegramConfig,
  type TelegramUpdate,
} from "@/lib/telegram-handler"

// The agent can take a while; it runs after Telegram has its reply
export const maxDuration = 60

/** Telegram sends the secret given at setWebhook in this header. */
export function isTelegramRequest(req: Request): boolean {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim()
  if (!secret) return false
  const given = Buffer.from(
    req.headers.get("x-telegram-bot-api-secret-token") ?? ""
  )
  const expected = Buffer.from(secret)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

function telegramConfig(): TelegramConfig | null {
  const ownerId = telegramId(process.env.TELEGRAM_OWNER_ID)
  const groupId = telegramId(process.env.TELEGRAM_GROUP_ID)
  const askTopicId = telegramId(process.env.TELEGRAM_ASK_TOPIC_ID)
  const insightsTopicId = telegramId(process.env.TELEGRAM_INSIGHTS_TOPIC_ID)
  if (!ownerId || !groupId || !askTopicId) return null
  return {
    ownerId,
    groupId,
    askTopicId,
    // Optional: replies in Daily insights work once it is set
    ...(insightsTopicId ? { insightsTopicId } : {}),
  }
}

/**
 * Telegram webhook. Answers 200 at once so Telegram doesn't retry while
 * the agent works, then handles the update after the response.
 */
export async function POST(req: Request) {
  if (!isTelegramRequest(req))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const config = telegramConfig()
  if (!config)
    return NextResponse.json(
      { error: "Telegram settings are not configured" },
      { status: 503 }
    )
  const update = (await req.json().catch(() => null)) as TelegramUpdate | null
  if (!update || typeof update.update_id !== "number")
    return NextResponse.json({ ok: true })

  after(() =>
    handleTelegramUpdate(update, {
      config,
      now: () => new Date(),
      runAgent: (question, { history, source, allowUndo }) =>
        runFinanceAgent(question, { history, source, allowUndo }),
      send: sendTelegramTo,
      sendTyping: sendTypingTo,
      decide: (id, decision) => decideProposal(id, decision, new Date()),
      answerCallback: answerCallbackQuery,
      editMessage: editTelegramMessage,
    }).catch((error) => console.error("Telegram update failed", error))
  )
  return NextResponse.json({ ok: true })
}
