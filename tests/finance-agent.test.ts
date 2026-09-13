import assert from "node:assert/strict"
import type Anthropic from "@anthropic-ai/sdk"

async function main() {
  process.env.DATABASE_URL = "file::memory:"
  delete process.env.TURSO_DATABASE_URL
  const { runFinanceAgent } = await import("../lib/agent/run-finance-agent")
  const response = (
    stop_reason: Anthropic.Message["stop_reason"],
    content: Anthropic.ContentBlock[]
  ) => ({ stop_reason, content }) as Anthropic.Message
  const call = (id: string, input: unknown, name = "query_spending") =>
    ({ type: "tool_use", id, name, input }) as Anthropic.ToolUseBlock
  const done = response("end_turn", [
    { type: "text", text: "Finished.", citations: null },
  ])
  const requests: Anthropic.MessageCreateParamsNonStreaming[] = []
  let queries = 0
  const result = await runFinanceAgent("Compare spending", {
    now: () => new Date("2026-09-12T17:00:00Z"),
    createMessage: async (params) => {
      requests.push(structuredClone(params))
      if (requests.length === 1)
        return response("tool_use", [
          call("a", { category: "Groceries" }),
          call("b", { category: "Transport" }),
          call("c", { date_from: "2026-02-30" }),
          call("d", {}, "unknown"),
        ])
      if (requests.length === 2)
        return response("tool_use", [call("retry", {})])
      return done
    },
    query: async (category) => {
      queries++
      if (category === "Transport") throw new Error("private database details")
      return {
        rows: [{ group: "all", total: 12, count: 1 }],
        total: 12,
        count: 1,
      }
    },
  })
  assert.equal(result.text, "Finished.")
  assert.equal(result.answer_data, null)
  assert.match(String(requests[0].system), /2026-09-13/)
  assert.equal(queries, 3)
  assert.equal(requests[1].messages.length, 3)
  const results = requests[1].messages[2]
    .content as Anthropic.ToolResultBlockParam[]
  assert.deepEqual(
    results.map((r) => r.tool_use_id),
    ["a", "b", "c", "d"]
  )
  assert.equal(results[0].is_error, undefined)
  assert.ok(results.slice(1).every((r) => r.is_error))
  assert.doesNotMatch(JSON.stringify(results), /private database details/)
  assert.equal(requests[2].messages.length, 5)
  for (const reason of ["max_tokens", "refusal"] as const) {
    await assert.rejects(
      runFinanceAgent("test", {
        createMessage: async () => response(reason, []),
      }),
      /did not finish/
    )
  }
  await assert.rejects(
    runFinanceAgent("test", {
      createMessage: async () => response("end_turn", []),
    }),
    /empty answer/
  )
  let rounds = 0
  await runFinanceAgent("test", {
    createMessage: async (params) => {
      rounds++
      if (rounds === 5) {
        assert.deepEqual(params.tool_choice, { type: "none" })
        return done
      }
      return response("tool_use", [call(String(rounds), {})])
    },
    query: async () => ({ rows: [], total: 0, count: 0 }),
  })
  assert.equal(rounds, 5)
  console.log("finance-agent: passed")
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
