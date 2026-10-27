import { db } from "./db"
import { telegramUpdates } from "./schema"
import { loadHistory, saveExchange, type Exchange } from "./agent/conversation"

export type TelegramTarget = { chatId: number; threadId?: number }

export type TelegramConfig = {
  ownerId: number
  groupId: number
  askTopicId: number
  // Daily insights, where the 10pm message goes; unset until configured
  insightsTopicId?: number
}

// Only the fields the handler reads; Telegram sends many more
export type TelegramUpdate = {
  update_id: number
  message?: {
    message_id: number
    message_thread_id?: number
    from?: { id: number }
    chat: { id: number }
    text?: string
    // Also set on every topic message, pointing at the topic's first message
    reply_to_message?: { message_id: number; text?: string }
  }
}

type Dependencies = {
  config: TelegramConfig
  now: () => Date
  runAgent: (
    question: string,
    options: { history: Exchange[] }
  ) => Promise<{ text: string }>
  send: (text: string, target: TelegramTarget) => Promise<void>
  sendTyping: (target: TelegramTarget) => Promise<void>
}

/** The conversation each topic keeps; the history topic key. */
function topicOf(threadId: number | undefined, config: TelegramConfig) {
  if (threadId === undefined) return null
  if (threadId === config.askTopicId) return "ask"
  if (threadId === config.insightsTopicId) return "daily"
  return null
}

/**
 * The text the owner replied to, if this is a real reply. Telegram also
 * sets reply_to_message on plain topic messages, pointing at the message
 * that opened the topic, whose id is the topic id.
 */
function repliedText(message: NonNullable<TelegramUpdate["message"]>) {
  const reply = message.reply_to_message
  if (!reply || reply.message_id === message.message_thread_id) return null
  return reply.text?.trim() || null
}

/** True the first time an update id is seen, false for a re-sent update. */
async function claimUpdate(updateId: number, at: Date): Promise<boolean> {
  const inserted = await db
    .insert(telegramUpdates)
    .values({ update_id: updateId, received_at: at.toISOString() })
    .onConflictDoNothing()
    .returning({ id: telegramUpdates.update_id })
  return inserted.length > 0
}

/**
 * Handle one Telegram update: the owner's question in the Ask anything or
 * Daily insights topic of their group gets the finance agent's answer in
 * that topic. A reply carries the replied-to message (such as the 10pm
 * message) as context. Anything else is ignored.
 */
export async function handleTelegramUpdate(
  update: TelegramUpdate,
  deps: Dependencies
): Promise<void> {
  const { config } = deps
  const message = update.message
  const question = message?.text?.trim()
  const topic = topicOf(message?.message_thread_id, config)
  if (
    !message ||
    !question ||
    !topic ||
    message.from?.id !== config.ownerId ||
    message.chat.id !== config.groupId
  )
    return
  if (!(await claimUpdate(update.update_id, deps.now()))) return

  const target = { chatId: config.groupId, threadId: message.message_thread_id }
  const context = repliedText(message)
  // Saved with the question, so follow-ups still know what was replied to.
  // The quoted text may come from anyone in the group: it can't close the quote
  const prompt = context
    ? `The owner is replying to this message:\n"""\n${context.replaceAll('"""', "''")}\n"""\n\n${question}`
    : question
  // The indicator is a nicety; never let it stop the answer
  await deps.sendTyping(target).catch(() => {})
  let answer: string
  try {
    const history = await loadHistory("telegram", topic, deps.now())
    answer = (await deps.runAgent(prompt, { history })).text
  } catch (error) {
    console.error("Telegram question failed", error)
    await deps.send(
      "Sorry, I couldn’t answer that just now. Please try again.",
      target
    )
    return
  }
  await deps.send(answer, target)
  await saveExchange({
    question: prompt,
    answer,
    source: "telegram",
    topic,
    at: deps.now(),
  })
}
