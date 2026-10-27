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

/** Send to a chat, in a topic when threadId is given; long text is split. */
export async function sendTelegramTo(
  text: string,
  target: { chatId: number; threadId?: number }
): Promise<void> {
  for (const part of splitMessage(text))
    await callTelegram("sendMessage", {
      chat_id: target.chatId,
      message_thread_id: target.threadId,
      text: part,
      disable_web_page_preview: true,
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
