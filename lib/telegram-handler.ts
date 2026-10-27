import { db } from "./db"
import { telegramUpdates } from "./schema"
import { loadHistory, saveExchange, type Exchange } from "./agent/conversation"
import type { Decision, DecisionOutcome } from "./agent/proposals"

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
  // A tap on an inline button, such as ✅ or ❌ on a proposal
  callback_query?: {
    id: string
    from: { id: number }
    data?: string
    message?: {
      message_id: number
      message_thread_id?: number
      chat: { id: number }
      text?: string
    }
  }
}

export type TelegramButton = { text: string; data: string }

type Dependencies = {
  config: TelegramConfig
  now: () => Date
  runAgent: (
    question: string,
    options: { history: Exchange[]; source: "telegram"; allowUndo: boolean }
  ) => Promise<{
    text: string
    proposals?: { id: string; summary: string }[]
  }>
  send: (
    text: string,
    target: TelegramTarget,
    options?: { buttons?: TelegramButton[] }
  ) => Promise<void>
  sendTyping: (target: TelegramTarget) => Promise<void>
  decide: (
    id: string,
    decision: Decision
  ) => Promise<{ outcome: DecisionOutcome; message: string }>
  // Stops the spinner on a tapped button, with a short note
  answerCallback: (id: string, text: string) => Promise<void>
  editMessage: (
    chatId: number,
    messageId: number,
    text: string
  ) => Promise<void>
}

// Button data: "p:<proposal id>:y" to confirm, ":n" to reject (≤ 64 bytes)
const PROPOSAL_DATA = /^p:([A-Za-z0-9]{1,40}):([yn])$/

function proposalButtons(id: string): TelegramButton[] {
  return [
    { text: "✅ Confirm", data: `p:${id}:y` },
    { text: "❌ Reject", data: `p:${id}:n` },
  ]
}

/** A tap on a proposal's button: decide it, then say what happened. */
async function handleButton(
  query: NonNullable<TelegramUpdate["callback_query"]>,
  deps: Dependencies
) {
  const match = PROPOSAL_DATA.exec(query.data ?? "")
  if (!match) {
    await deps.answerCallback(query.id, "That button doesn’t do anything.")
    return
  }
  let result: { message: string }
  try {
    result = await deps.decide(
      match[1],
      match[2] === "y" ? "confirm" : "reject"
    )
  } catch (error) {
    console.error("Telegram button failed", error)
    await deps.answerCallback(
      query.id,
      "Sorry, I couldn’t do that just now. Nothing changed. Please try again."
    )
    return
  }
  await deps.answerCallback(query.id, result.message)
  // Show the result in place of the buttons, so an old proposal can't be
  // tapped again by mistake
  if (query.message)
    await deps
      .editMessage(
        query.message.chat.id,
        query.message.message_id,
        `${query.message.text ?? ""}\n\n${result.message}`.trim()
      )
      .catch((error) => console.error("Telegram edit failed", error))
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
  const query = update.callback_query
  if (query) {
    if (
      query.from.id !== config.ownerId ||
      query.message?.chat.id !== config.groupId
    )
      return
    if (!(await claimUpdate(update.update_id, deps.now()))) return
    await handleButton(query, deps)
    return
  }
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
  let proposals: { id: string; summary: string }[]
  try {
    const history = await loadHistory("telegram", topic, deps.now())
    const reply = await deps.runAgent(prompt, {
      history,
      source: "telegram",
      // Quoted text may come from anyone in the group
      allowUndo: !context,
    })
    answer = reply.text
    proposals = reply.proposals ?? []
  } catch (error) {
    console.error("Telegram question failed", error)
    await deps.send(
      "Sorry, I couldn’t answer that just now. Please try again.",
      target
    )
    return
  }
  await deps.send(answer, target)
  for (const proposal of proposals)
    await deps.send(`Proposed change:\n${proposal.summary}`, target, {
      buttons: proposalButtons(proposal.id),
    })
  await saveExchange({
    question: prompt,
    answer,
    source: "telegram",
    topic,
    at: deps.now(),
  })
}
