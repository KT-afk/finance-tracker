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
  const measures: unknown[] = []
  const measureRequests: Anthropic.MessageCreateParamsNonStreaming[] = []
  await runFinanceAgent("Gross vs mine", {
    createMessage: async (params) => {
      measureRequests.push(structuredClone(params))
      if (measureRequests.length === 1)
        return response("tool_use", [
          call("m1", {}),
          call("m2", { measure: "gross" }),
          call("m3", { measure: "net" }),
        ])
      return done
    },
    query: async (_c, _f, _t, _g, measure) => {
      measures.push(measure)
      return { rows: [], total: 0, count: 0 }
    },
  })
  assert.deepEqual(measures, ["spending", "gross"])
  const measureResults = measureRequests[1].messages[2]
    .content as Anthropic.ToolResultBlockParam[]
  assert.equal(measureResults[2].is_error, true)
  assert.match(String(measureRequests[0].system), /owner's spending/)
  const searches: unknown[] = []
  const searchRequests: Anthropic.MessageCreateParamsNonStreaming[] = []
  await runFinanceAgent("Which Grab rides?", {
    createMessage: async (params) => {
      searchRequests.push(structuredClone(params))
      if (searchRequests.length === 1)
        return response("tool_use", [
          call("s1", { text: " Grab " }, "search_transactions"),
          call("s2", { min_amount: -5 }, "search_transactions"),
          call("s3", { text: "x" }, "search_transactions"),
        ])
      return done
    },
    search: async (filters) => {
      searches.push(filters)
      if (filters.text === "x") throw new Error("private database details")
      return {
        transactions: [],
        total: 0,
        gross_total: 0,
        count: 0,
        more: 0,
      }
    },
  })
  assert.deepEqual(searches, [{ text: "Grab" }, { text: "x" }])
  assert.deepEqual(
    searchRequests[0].tools?.map((t) => (t as Anthropic.Tool).name),
    ["query_spending", "search_transactions"]
  )
  const searchResults = searchRequests[1].messages[2]
    .content as Anthropic.ToolResultBlockParam[]
  assert.deepEqual(
    searchResults.map((r) => r.is_error),
    [undefined, true, true]
  )
  assert.doesNotMatch(JSON.stringify(searchResults), /private database/)
  const historyRequests: Anthropic.MessageCreateParamsNonStreaming[] = []
  await runFinanceAgent("and last month?", {
    history: [{ question: "Food this month?", answer: "$300." }],
    createMessage: async (params) => {
      historyRequests.push(structuredClone(params))
      return done
    },
  })
  assert.deepEqual(historyRequests[0].messages, [
    { role: "user", content: "Food this month?" },
    { role: "assistant", content: "$300." },
    { role: "user", content: "and last month?" },
  ])
  assert.match(String(historyRequests[0].system), /ask what the owner means/)
  console.log("finance-agent: passed")
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
