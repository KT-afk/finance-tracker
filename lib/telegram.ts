/** Telegram delivery: the owner's chat by default, or a group topic. */
export async function sendTelegram(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim()
  if (!token || !chatId) {
    throw new Error("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required")
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      description?: string
    }
    throw new Error(
      `Telegram returned ${res.status}: ${body.description ?? "no details"}`
    )
  }
}

function botToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required")
  return token
}

async function callTelegram(method: string, body: object): Promise<void> {
  const res = await fetch(
    `https://api.telegram.org/bot${botToken()}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  )
  if (!res.ok) {
    const details = (await res.json().catch(() => ({}))) as {
      description?: string
    }
    throw new Error(
      `Telegram returned ${res.status}: ${details.description ?? "no details"}`
    )
  }
}

// Telegram refuses messages over 4,096 characters
const MAX_MESSAGE_LENGTH = 4096

/** Split text into messages Telegram accepts, at line breaks where possible. */
export function splitMessage(text: string, max = MAX_MESSAGE_LENGTH): string[] {
  const parts: string[] = []
  let rest = text
  while (rest.length > max) {
    const cut = rest.lastIndexOf("\n", max)
    const at = cut > 0 ? cut : max
    parts.push(rest.slice(0, at))
    rest = rest.slice(at).replace(/^\n/, "")
  }
  parts.push(rest)
  return parts
}

export type TelegramTarget = { chatId: number; threadId?: number }
export type TelegramButton = { text: string; data: string }

/**
 * Send to a chat, in a topic when threadId is given; long text is split.
 * Buttons go on the last part, in one row.
 */
export async function sendTelegramTo(
  text: string,
  target: TelegramTarget,
  options: { buttons?: TelegramButton[] } = {}
): Promise<void> {
  const parts = splitMessage(text)
  for (const [i, part] of parts.entries())
    await callTelegram("sendMessage", {
      chat_id: target.chatId,
      message_thread_id: target.threadId,
      text: part,
      disable_web_page_preview: true,
      ...(options.buttons && i === parts.length - 1
        ? {
            reply_markup: {
              inline_keyboard: [
                options.buttons.map((b) => ({
                  text: b.text,
                  callback_data: b.data,
                })),
              ],
            },
          }
        : {}),
    })
}

/** Stop the spinner on a tapped button and show a short note. */
export async function answerCallbackQuery(
  id: string,
  text: string
): Promise<void> {
  // Telegram shows at most 200 characters here
  await callTelegram("answerCallbackQuery", {
    callback_query_id: id,
    text: text.slice(0, 200),
  })
}

/** Replace a message's text; its buttons go away. */
export async function editTelegramMessage(
  chatId: number,
  messageId: number,
  text: string
): Promise<void> {
  await callTelegram("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: splitMessage(text)[0],
  })
}

/** Show "typing…" in a chat or topic for a few seconds. */
export async function sendTypingTo(target: {
  chatId: number
  threadId?: number
}): Promise<void> {
  await callTelegram("sendChatAction", {
    chat_id: target.chatId,
    message_thread_id: target.threadId,
    action: "typing",
  })
}

/**
 * Where the 10pm message goes: the group's Daily insights topic once both
 * ids are set, or null to keep using the owner's chat (TELEGRAM_CHAT_ID).
 */
export function dailyMessageTarget(
  env: Record<string, string | undefined> = process.env
): { chatId: number; threadId: number } | null {
  const chatId = telegramId(env.TELEGRAM_GROUP_ID)
  const threadId = telegramId(env.TELEGRAM_INSIGHTS_TOPIC_ID)
  return chatId && threadId ? { chatId, threadId } : null
}

/**
 * A Telegram id from a setting: a non-zero whole number, or null. Used for
 * every Telegram id setting, so the webhook and the 10pm message agree.
 */
export function telegramId(value: string | undefined): number | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  const id = Number(trimmed)
  return Number.isInteger(id) && id !== 0 ? id : null
}
