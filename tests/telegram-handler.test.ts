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
}

function message(
  updateId: number,
  text: string,
  overrides: { from?: number; chat?: number; thread?: number } = {}
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

    console.log("telegram-handler: passed")
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
