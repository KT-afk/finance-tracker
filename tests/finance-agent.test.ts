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
    loadMemories: async () => [],
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
  assert.match(JSON.stringify(requests[0].system), /2026-09-13/)
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
        loadMemories: async () => [],
        createMessage: async () => response(reason, []),
      }),
      /did not finish/
    )
  }
  // A long answer that hits the output limit is sent, marked as cut short,
  // instead of failing the whole question
  const longRequests: Anthropic.MessageCreateParamsNonStreaming[] = []
  const cut = await runFinanceAgent("What did I buy in May?", {
    loadMemories: async () => [],
    createMessage: async (params) => {
      longRequests.push(params)
      return response("max_tokens", [
        { type: "text", text: "May: rent $1,200, Shopee", citations: null },
      ])
    },
  })
  assert.match(cut.text, /^May: rent \$1,200, Shopee/)
  assert.match(cut.text, /cut short/)
  assert.ok(longRequests[0].max_tokens >= 4000, "room for long answers")
  assert.match(
    JSON.stringify(longRequests[0].system),
    /no Markdown/,
    "Telegram shows ** and # as typed"
  )
  await assert.rejects(
    runFinanceAgent("test", {
      loadMemories: async () => [],
      createMessage: async () => response("end_turn", []),
    }),
    /empty answer/
  )
  let rounds = 0
  await runFinanceAgent("test", {
    loadMemories: async () => [],
    createMessage: async (params) => {
      rounds++
      if (rounds === 9) {
        assert.deepEqual(params.tool_choice, { type: "none" })
        return done
      }
      return response("tool_use", [call(String(rounds), {})])
    },
    query: async () => ({ rows: [], total: 0, count: 0 }),
  })
  assert.equal(rounds, 9, "eight lookup rounds, then one to answer")
  const measures: unknown[] = []
  const measureRequests: Anthropic.MessageCreateParamsNonStreaming[] = []
  await runFinanceAgent("Gross vs mine", {
    loadMemories: async () => [],
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
  assert.match(JSON.stringify(measureRequests[0].system), /owner's spending/)
  const searches: unknown[] = []
  const searchRequests: Anthropic.MessageCreateParamsNonStreaming[] = []
  await runFinanceAgent("Which Grab rides?", {
    loadMemories: async () => [],
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
    ["query_spending", "search_transactions", "query_cash_flow", "get_balances"]
  )
  const searchResults = searchRequests[1].messages[2]
    .content as Anthropic.ToolResultBlockParam[]
  assert.deepEqual(
    searchResults.map((r) => r.is_error),
    [undefined, true, true]
  )
  assert.doesNotMatch(JSON.stringify(searchResults), /private database/)
  // Income, savings and dated balances; failures don't leak or read as zero
  const cashFlowCalls: string[][] = []
  const cashRequests: Anthropic.MessageCreateParamsNonStreaming[] = []
  await runFinanceAgent("Can I afford a $2,000 trip?", {
    loadMemories: async () => [],
    createMessage: async (params) => {
      cashRequests.push(structuredClone(params))
      if (cashRequests.length === 1)
        return response("tool_use", [
          call(
            "c1",
            { date_from: "2026-09-01", date_to: "2026-09-30" },
            "query_cash_flow"
          ),
          call("c2", { date_from: "2026-09-01" }, "query_cash_flow"),
          call(
            "c3",
            { date_from: "2026-09-30", date_to: "2026-09-01" },
            "query_cash_flow"
          ),
          call("c4", {}, "get_balances"),
          call("c5", { bank: "dbs" }, "get_balances"),
          call(
            "c6",
            { date_from: "2026-08-01", date_to: "2026-08-31" },
            "query_cash_flow"
          ),
        ])
      return done
    },
    cashFlow: async (from, to) => {
      cashFlowCalls.push([from, to])
      if (from === "2026-08-01") throw new Error("private database details")
      return {
        date_from: from,
        date_to: to,
        income: 5000,
        spending: 60,
        savings: 4940,
      }
    },
    balances: async () => ({
      balances: [
        {
          bank: "dbs",
          account_type: "savings",
          balance: 9500,
          as_of: "2026-09-30",
          exact: true,
        },
      ],
    }),
  })
  assert.deepEqual(cashFlowCalls, [
    ["2026-09-01", "2026-09-30"],
    ["2026-08-01", "2026-08-31"],
  ])
  const cashResults = cashRequests[1].messages[2]
    .content as Anthropic.ToolResultBlockParam[]
  assert.deepEqual(
    cashResults.map((r) => r.is_error),
    [undefined, true, true, undefined, true, true]
  )
  assert.match(String(cashResults[0].content), /"savings":4940/)
  assert.match(String(cashResults[3].content), /"as_of":"2026-09-30"/)
  assert.doesNotMatch(JSON.stringify(cashResults), /private database/)
  assert.match(String(cashResults[5].content), /not treat this as zero/)
  const cashInstructions = JSON.stringify(cashRequests[0].system)
  assert.match(cashInstructions, /as_of/, "balances are given with their date")
  assert.match(cashInstructions, /afford/)
  assert.match(cashInstructions, /never answer yes or no/)
  const historyRequests: Anthropic.MessageCreateParamsNonStreaming[] = []
  await runFinanceAgent("and last month?", {
    loadMemories: async () => [],
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
  assert.match(
    JSON.stringify(historyRequests[0].system),
    /ask what the owner means/
  )
  // Every request carries all saved memories as data, cached with the
  // fixed instructions and tools; the date and conversation are not cached
  const memoryRequests: Anthropic.MessageCreateParamsNonStreaming[] = []
  await runFinanceAgent("Anything unusual?", {
    now: () => new Date("2026-09-12T17:00:00Z"),
    loadMemories: async () => [
      { key: "gym", value: "The $150 gym payment each month is expected" },
      { key: "rent", value: "Rent is split with Jane" },
    ],
    history: [{ question: "Hi", answer: "Hello." }],
    createMessage: async (params) => {
      memoryRequests.push(structuredClone(params))
      return done
    },
  })
  const system = memoryRequests[0].system as Anthropic.TextBlockParam[]
  const cached = system.findIndex((block) => block.cache_control)
  assert.equal(system.filter((block) => block.cache_control).length, 1)
  assert.deepEqual(system[cached].cache_control, { type: "ephemeral" })
  const cachedText = system
    .slice(0, cached + 1)
    .map((block) => block.text)
    .join("\n")
  assert.match(cachedText, /gym payment each month is expected/)
  assert.match(cachedText, /Rent is split with Jane/)
  assert.match(cachedText, /search_transactions/, "fixed instructions cached")
  assert.doesNotMatch(cachedText, /2026-09-13/, "date is after the cache mark")
  assert.match(JSON.stringify(system.slice(cached + 1)), /2026-09-13/)
  assert.doesNotMatch(
    JSON.stringify(memoryRequests[0].messages),
    /cache_control/
  )

  // With no memories saved the agent still answers, and says there are none
  const emptyRequests: Anthropic.MessageCreateParamsNonStreaming[] = []
  const plain = await runFinanceAgent("Hi", {
    loadMemories: async () => [],
    createMessage: async (params) => {
      emptyRequests.push(structuredClone(params))
      return done
    },
  })
  assert.equal(plain.text, "Finished.")
  assert.match(JSON.stringify(emptyRequests[0].system), /No saved memories/)
  const failedMemory = await runFinanceAgent("Hi", {
    loadMemories: async () => {
      throw new Error("no such table: ai_memory")
    },
    createMessage: async () => done,
  })
  assert.equal(failedMemory.text, "Finished.", "answers without memories")
  console.log("finance-agent: passed")
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
