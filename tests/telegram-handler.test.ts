/**
 * The Telegram handler answers the owner's questions in the Ask anything
 * topic, once per update, and ignores everything else. Fake agent, fake
 * sender, real database for history and seen update ids.
 */
import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { migratedSchemaSql } from "./migrated-schema"
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (path: string) => { exec(sql: string): void; close(): void }
}

const config = {
  ownerId: 111,
  groupId: -1001,
  askTopicId: 7,
  insightsTopicId: 8,
}

// The 10pm message the bot posted in Daily insights
const DAILY = { message_id: 500, text: "Oct so far: $1,952 (rent $1,200)" }

function message(
  updateId: number,
  text: string,
  overrides: {
    from?: number
    chat?: number
    thread?: number
    replyTo?: { message_id: number; text?: string }
  } = {}
) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId * 10,
      message_thread_id: overrides.thread ?? config.askTopicId,
      is_topic_message: true,
      from: { id: overrides.from ?? config.ownerId },
      chat: { id: overrides.chat ?? config.groupId },
      text,
      ...(overrides.replyTo ? { reply_to_message: overrides.replyTo } : {}),
    },
  }
}

async function main() {
  const tmpDir = mkdtempSync(path.join(tmpdir(), "finance-telegram-"))
  const dbPath = path.join(tmpDir, "test.db")
  const seed = new DatabaseSync(dbPath)
  seed.exec(migratedSchemaSql())
  seed.close()
  process.env.FINANCE_DB_PATH = dbPath
  delete process.env.DATABASE_URL
  delete process.env.TURSO_DATABASE_URL
  delete process.env.TURSO_AUTH_TOKEN
  delete process.env.DATABASE_AUTH_TOKEN

  try {
    const { handleTelegramUpdate } = await import("../lib/telegram-handler")
    const { loadHistory } = await import("../lib/agent/conversation")

    const sent: { text: string; chatId: number; threadId?: number }[] = []
    const typing: { chatId: number; threadId?: number }[] = []
    const asked: { question: string; history: unknown[] }[] = []
    let now = new Date("2026-10-27T12:00:00Z")
    let failAgent = false
    const deps = {
      config,
      now: () => now,
      runAgent: async (
        question: string,
        options: { history: { question: string; answer: string }[] }
      ) => {
        asked.push({ question, history: options.history })
        if (failAgent) throw new Error("private database details")
        return { text: `Answer to ${question}` }
      },
      send: async (
        text: string,
        target: { chatId: number; threadId?: number }
      ) => {
        sent.push({ text, ...target })
      },
      sendTyping: async (target: { chatId: number; threadId?: number }) => {
        typing.push(target)
      },
    }

    // Owner asks in Ask anything: typing, then the answer in the same topic
    await handleTelegramUpdate(message(1, " Food this month? "), deps)
    assert.deepEqual(typing, [{ chatId: config.groupId, threadId: 7 }])
    assert.deepEqual(sent, [
      {
        text: "Answer to Food this month?",
        chatId: config.groupId,
        threadId: 7,
      },
    ])

    // Telegram re-sends the same update: not answered twice
    await handleTelegramUpdate(message(1, "Food this month?"), deps)
    assert.equal(sent.length, 1)

    // A follow-up sees the earlier exchange
    await handleTelegramUpdate(message(2, "and last month?"), deps)
    assert.deepEqual(asked[1].history, [
      { question: "Food this month?", answer: "Answer to Food this month?" },
    ])

    // Telegram history is kept apart from the web
    assert.equal((await loadHistory("web", "ask", now)).length, 0)
    assert.equal((await loadHistory("telegram", "ask", now)).length, 2)

    // Ignored: someone else, another chat, another topic, no text
    await handleTelegramUpdate(message(3, "hi", { from: 999 }), deps)
    await handleTelegramUpdate(message(4, "hi", { chat: -2002 }), deps)
    await handleTelegramUpdate(message(5, "hi", { thread: 9 }), deps)
    await handleTelegramUpdate({ update_id: 6 }, deps)
    await handleTelegramUpdate(
      { update_id: 7, message: { ...message(7, "").message, text: undefined } },
      deps
    )
    assert.equal(asked.length, 2)
    assert.equal(sent.length, 2)

    // Agent failure: a short error in the topic, no internal details
    failAgent = true
    await handleTelegramUpdate(message(8, "Rent?"), deps)
    const error = sent.at(-1)!
    assert.equal(error.threadId, 7)
    assert.match(error.text, /couldn.t answer/i)
    assert.doesNotMatch(error.text, /private database/)
    assert.equal(
      (await loadHistory("telegram", "ask", now)).length,
      2,
      "failed answers are not saved"
    )

    // After 6 quiet hours the conversation starts fresh
    failAgent = false
    now = new Date("2026-10-27T19:00:00Z")
    await handleTelegramUpdate(message(9, "Groceries?"), deps)
    assert.deepEqual(asked.at(-1)!.history, [])

    // Daily insights: a reply to the 10pm message is answered in that topic,
    // with the replied-to message as context
    const daily = { thread: 8, replyTo: DAILY }
    await handleTelegramUpdate(
      message(20, "Why was rent so high?", daily),
      deps
    )
    const replyQuestion = asked.at(-1)!.question
    assert.match(replyQuestion, /Oct so far: \$1,952/)
    assert.match(replyQuestion, /Why was rent so high\?/)
    assert.deepEqual(sent.at(-1), {
      text: `Answer to ${replyQuestion}`,
      chatId: config.groupId,
      threadId: 8,
    })
    assert.deepEqual(typing.at(-1), { chatId: config.groupId, threadId: 8 })

    // Daily insights keeps its own conversation, saved without the context
    const dailyHistory = await loadHistory("telegram", "daily", now)
    assert.deepEqual(
      dailyHistory.map((e) => e.question),
      ["Why was rent so high?"]
    )
    assert.ok(
      (await loadHistory("telegram", "ask", now)).every(
        (e) => e.question !== "Why was rent so high?"
      ),
      "Ask anything history does not include Daily insights"
    )

    // A plain message in Daily insights is answered as a question. Telegram
    // points topic messages at the topic's first message; that is not a reply
    await handleTelegramUpdate(
      message(21, "Spending this week?", {
        thread: 8,
        replyTo: { message_id: 8 },
      }),
      deps
    )
    assert.equal(asked.at(-1)!.question, "Spending this week?")
    assert.equal(sent.at(-1)!.threadId, 8)
    assert.deepEqual(asked.at(-1)!.history, [
      {
        question: "Why was rent so high?",
        answer: `Answer to ${replyQuestion}`,
      },
    ])

    // A reply to a message with no text (a photo, say) has no context to add
    await handleTelegramUpdate(
      message(22, "What is this?", { thread: 8, replyTo: { message_id: 600 } }),
      deps
    )
    assert.equal(asked.at(-1)!.question, "What is this?")

    // A reply in Ask anything also uses the replied-to message
    await handleTelegramUpdate(
      message(23, "and this?", {
        replyTo: { message_id: 90, text: "Rent $1,200" },
      }),
      deps
    )
    assert.match(asked.at(-1)!.question, /Rent \$1,200/)
    assert.equal(sent.at(-1)!.threadId, 7)

    // Until the Daily insights topic is configured, it is ignored
    const before = asked.length
    await handleTelegramUpdate(message(24, "hi", { thread: 8 }), {
      ...deps,
      config: { ...config, insightsTopicId: undefined },
    })
    assert.equal(asked.length, before)

    // The 10pm message goes to Daily insights once the group is configured,
    // and to the owner's chat until then
    const { dailyMessageTarget } = await import("../lib/telegram")
    assert.deepEqual(
      dailyMessageTarget({
        TELEGRAM_GROUP_ID: "-1001",
        TELEGRAM_INSIGHTS_TOPIC_ID: " 8 ",
      }),
      { chatId: -1001, threadId: 8 }
    )
    assert.equal(dailyMessageTarget({ TELEGRAM_GROUP_ID: "-1001" }), null)
    assert.equal(
      dailyMessageTarget({
        TELEGRAM_GROUP_ID: "x",
        TELEGRAM_INSIGHTS_TOPIC_ID: "8",
      }),
      null
    )

    console.log("telegram-handler: passed")
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
