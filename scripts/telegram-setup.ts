/**
 * Connect the Telegram bot to the app.
 *
 * Usage:
 *   1. Send any message in each topic of the group (Daily insights, Ask anything).
 *   2. npm run telegram:setup
 *
 * Prints the group id, topic ids and your user id from recent messages, then
 * registers the webhook at $APP_URL/api/telegram with TELEGRAM_WEBHOOK_SECRET.
 * Needs TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and APP_URL (in the
 * environment or .env.local).
 */
import { config } from "dotenv"
import path from "path"

config({ path: path.join(process.cwd(), ".env.local") })
config({ path: path.join(process.cwd(), ".env") })

type Update = {
  message?: {
    message_thread_id?: number
    from?: { id: number; username?: string; first_name?: string }
    chat: { id: number; type: string; title?: string }
    text?: string
    forum_topic_created?: { name: string }
    reply_to_message?: { forum_topic_created?: { name: string } }
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    console.error(`Set ${name} first.`)
    process.exit(1)
  }
  return value
}

async function call<T>(token: string, method: string, body: object = {}) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const json = (await res.json()) as {
    ok: boolean
    result: T
    description?: string
  }
  if (!json.ok) throw new Error(`${method} failed: ${json.description}`)
  return json.result
}

async function main() {
  const token = required("TELEGRAM_BOT_TOKEN")
  const secret = required("TELEGRAM_WEBHOOK_SECRET")
  const appUrl = required("APP_URL").replace(/\/$/, "")
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
    console.error(
      "TELEGRAM_WEBHOOK_SECRET may only use letters, digits, _ and -."
    )
    process.exit(1)
  }

  // getUpdates only works while no webhook is set; pending updates are kept
  await call(token, "deleteWebhook", { drop_pending_updates: false })
  const updates = await call<Update[]>(token, "getUpdates", {
    allowed_updates: ["message"],
  })

  const groups = new Map<number, string>()
  const topics = new Map<string, string>()
  const people = new Map<number, string>()
  for (const { message } of updates) {
    if (!message) continue
    if (message.chat.type !== "private")
      groups.set(message.chat.id, message.chat.title ?? "")
    if (message.message_thread_id) {
      const name =
        message.forum_topic_created?.name ??
        message.reply_to_message?.forum_topic_created?.name ??
        `(first message: “${message.text ?? ""}”)`
      topics.set(`${message.chat.id}:${message.message_thread_id}`, name)
    }
    if (message.from)
      people.set(
        message.from.id,
        message.from.username ?? message.from.first_name ?? ""
      )
  }

  if (!updates.length)
    console.log(
      "No recent messages. Send a message in each topic, then run this again."
    )
  for (const [id, title] of groups)
    console.log(`Group: ${title}  TELEGRAM_GROUP_ID=${id}`)
  for (const [key, name] of topics)
    console.log(`Topic ${name}  thread id ${key.split(":")[1]}`)
  for (const [id, name] of people)
    console.log(`User ${name}  TELEGRAM_OWNER_ID=${id}`)

  await call(token, "setWebhook", {
    url: `${appUrl}/api/telegram`,
    secret_token: secret,
    allowed_updates: ["message"],
  })
  console.log(`Webhook set to ${appUrl}/api/telegram`)
  console.log(
    "Set TELEGRAM_ASK_TOPIC_ID (and TELEGRAM_INSIGHTS_TOPIC_ID) from the thread ids above."
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
