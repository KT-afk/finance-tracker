/**
 * Follow-up questions: the agent gets the last 10 exchanges from the same
 * source and topic, only while the latest is under 6 hours old.
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

const HOUR = 60 * 60 * 1000

function seed(dbPath: string) {
  const db = new DatabaseSync(dbPath)
  // A row saved before source and topic existed
  db.exec(`
    ${migratedSchemaSql()};
    INSERT INTO ai_conversations (question, answer_text, answer_data, created_at)
      VALUES ('old question', 'old answer', NULL, '2026-09-01T00:00:00.000Z');
  `)
  db.close()
}

async function main() {
  const tmpDir = mkdtempSync(path.join(tmpdir(), "finance-history-"))
  const dbPath = path.join(tmpDir, "test.db")
  seed(dbPath)
  process.env.FINANCE_DB_PATH = dbPath
  delete process.env.DATABASE_URL
  delete process.env.TURSO_DATABASE_URL
  delete process.env.TURSO_AUTH_TOKEN
  delete process.env.DATABASE_AUTH_TOKEN

  try {
    const { loadHistory, saveExchange } =
      await import("../lib/agent/conversation")
    const { db } = await import("../lib/db")
    const { aiConversations } = await import("../lib/schema")

    // Existing rows remain readable, as web questions in the Ask topic
    const [old] = await db.select().from(aiConversations)
    assert.equal(old.source, "web")
    assert.equal(old.topic, "ask")

    // 12 web exchanges an hour apart, plus one in another source and topic
    const start = new Date("2026-09-10T00:00:00Z").getTime()
    for (let i = 1; i <= 12; i++) {
      await saveExchange({
        question: `q${i}`,
        answer: `a${i}`,
        source: "web",
        topic: "ask",
        at: new Date(start + i * HOUR),
      })
    }
    await saveExchange({
      question: "telegram q",
      answer: "telegram a",
      source: "telegram",
      topic: "ask",
      at: new Date(start + 12 * HOUR),
    })
    await saveExchange({
      question: "other topic q",
      answer: "other topic a",
      source: "web",
      topic: "daily",
      at: new Date(start + 12 * HOUR),
    })
    const latest = start + 12 * HOUR

    // Within 6 hours: the last 10, oldest first, from this source and topic
    const recent = await loadHistory("web", "ask", new Date(latest + HOUR))
    assert.deepEqual(
      recent.map((e) => e.question),
      ["q3", "q4", "q5", "q6", "q7", "q8", "q9", "q10", "q11", "q12"]
    )
    assert.equal(recent[9].answer, "a12")

    // Just under 6 hours still counts; 6 hours or more starts fresh
    assert.equal(
      (await loadHistory("web", "ask", new Date(latest + 6 * HOUR - 1))).length,
      10
    )
    assert.deepEqual(
      await loadHistory("web", "ask", new Date(latest + 6 * HOUR)),
      []
    )

    // Separate source and topic each keep their own history
    assert.deepEqual(
      (await loadHistory("telegram", "ask", new Date(latest))).map(
        (e) => e.question
      ),
      ["telegram q"]
    )
    assert.deepEqual(
      await loadHistory("telegram", "daily", new Date(latest)),
      []
    )
    console.log("conversation-history: passed")
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
