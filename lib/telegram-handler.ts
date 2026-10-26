import { db } from "./db"
import { telegramUpdates } from "./schema"
import { loadHistory, saveExchange, type Exchange } from "./agent/conversation"

export type TelegramTarget = { chatId: number; threadId?: number }

export type TelegramConfig = {
  ownerId: number
  groupId: number
  askTopicId: number
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

const TOPIC = "ask"

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
 * Handle one Telegram update: the owner's question in the Ask anything
 * topic of their group gets the finance agent's answer in that topic.
 * Anything else is ignored.
 */
export async function handleTelegramUpdate(
  update: TelegramUpdate,
  deps: Dependencies
): Promise<void> {
  const { config } = deps
  const message = update.message
  const question = message?.text?.trim()
  if (
    !message ||
    !question ||
    message.from?.id !== config.ownerId ||
    message.chat.id !== config.groupId ||
    message.message_thread_id !== config.askTopicId
  )
    return
  if (!(await claimUpdate(update.update_id, deps.now()))) return

  const target = { chatId: config.groupId, threadId: config.askTopicId }
  // The indicator is a nicety; never let it stop the answer
  await deps.sendTyping(target).catch(() => {})
  let answer: string
  try {
    const history = await loadHistory("telegram", TOPIC, deps.now())
    answer = (await deps.runAgent(question, { history })).text
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
    question,
    answer,
    source: "telegram",
    topic: TOPIC,
    at: deps.now(),
  })
}
