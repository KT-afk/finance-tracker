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
    [
      "query_spending",
      "search_transactions",
      "query_cash_flow",
      "get_balances",
      "savings_review",
      "trip_spending",
      "propose_trip",
      "propose_trip_payment",
      "propose_cash_payment",
      "propose_recategorise",
      "propose_memory",
      "propose_note",
      "propose_rule",
      "propose_share",
      "propose_budget",
      "budget_status",
      "list_changes",
      "undo_change",
    ]
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
  assert.equal(
    failedMemory.text,
    "Finished.\n\n(I couldn’t load your saved memories for this answer.)",
    "answers without memories, and says so"
  )
  // Proposing a change: stored through the propose dependency with the
  // question and source, returned to the caller, never applied by the agent
  const proposed: unknown[] = []
  const proposeRequests: Anthropic.MessageCreateParamsNonStreaming[] = []
  const withProposal = await runFinanceAgent("that $80 Shopee was a gift", {
    loadMemories: async () => [],
    source: "telegram",
    now: () => new Date("2026-09-12T17:00:00Z"),
    createMessage: async (params) => {
      proposeRequests.push(structuredClone(params))
      if (proposeRequests.length === 1)
        return response("tool_use", [
          call(
            "p1",
            { transaction_id: "shopee", category: "Personal" },
            "propose_recategorise"
          ),
          call(
            "p2",
            { transaction_id: "shopee", category: "Personal", amount: 5 },
            "propose_recategorise"
          ),
          call(
            "p3",
            { transaction_id: "x", category: "Personal" },
            "propose_recategorise"
          ),
        ])
      return done
    },
    propose: async (input) => {
      proposed.push({ ...input, now: input.now.toISOString() })
      if (input.transactionId === "x")
        throw new Error("private database details")
      return {
        id: "abc123def456",
        summary: "Shopee $80 on 6 Sept 2026: Shopping → Personal",
      }
    },
  })
  assert.deepEqual(proposed, [
    {
      transactionId: "shopee",
      category: "Personal",
      source: "telegram",
      request: "that $80 Shopee was a gift",
      now: "2026-09-12T17:00:00.000Z",
    },
    {
      transactionId: "x",
      category: "Personal",
      source: "telegram",
      request: "that $80 Shopee was a gift",
      now: "2026-09-12T17:00:00.000Z",
    },
  ])
  assert.deepEqual(withProposal.proposals, [
    {
      id: "abc123def456",
      summary: "Shopee $80 on 6 Sept 2026: Shopping → Personal",
    },
  ])
  const proposeResults = proposeRequests[1].messages.at(-1)!
    .content as Anthropic.ToolResultBlockParam[]
  assert.match(
    String(proposeResults[0].content),
    /waiting for the owner to confirm/
  )
  assert.equal(proposeResults[1].is_error, true, "unknown field refused")
  assert.equal(proposeResults[2].is_error, true)
  assert.doesNotMatch(JSON.stringify(proposeResults), /private database/)
  assert.ok(
    proposeRequests[0].tools?.some(
      (t) => (t as Anthropic.Tool).name === "propose_recategorise"
    )
  )
  const instructions = JSON.stringify(proposeRequests[0].system)
  assert.doesNotMatch(instructions, /read-only/)
  assert.match(instructions, /never say it was changed/)
  assert.match(
    instructions,
    /cannot delete transactions, change amounts or dates/
  )

  // Without a source the proposal is recorded as from the web
  await runFinanceAgent("grab was travel", {
    loadMemories: async () => [],
    createMessage: async (params) =>
      params.messages.length === 1
        ? response("tool_use", [
            call(
              "w",
              { transaction_id: "grab", category: "Travel" },
              "propose_recategorise"
            ),
          ])
        : done,
    propose: async (input) => {
      assert.equal(input.source, "web")
      return { id: "w1", summary: "x" }
    },
  })
  // Remembering: stored through proposeMemory as a proposal, never saved by
  // the agent; owner_asked decides user or inferred
  const remembered: unknown[] = []
  const memoryReqs: Anthropic.MessageCreateParamsNonStreaming[] = []
  const withMemory = await runFinanceAgent("Oh that is for my wedding ring", {
    loadMemories: async () => [],
    source: "telegram",
    now: () => new Date("2026-09-12T17:00:00Z"),
    createMessage: async (params) => {
      memoryReqs.push(structuredClone(params))
      if (memoryReqs.length === 1)
        return response("tool_use", [
          call(
            "m1",
            {
              name: "wedding ring",
              fact: "The $1,277 transfer to Yoon Thiri was my wedding ring",
              owner_asked: false,
            },
            "propose_memory"
          ),
          call(
            "m2",
            { name: "x", fact: "y", owner_asked: "yes" },
            "propose_memory"
          ),
          call("m3", { name: "x", fact: "y" }, "propose_memory"),
        ])
      return done
    },
    proposeMemory: async (input) => {
      remembered.push({ ...input, now: undefined })
      return { id: "mem123", summary: `Remember: ${input.value}` }
    },
  })
  assert.deepEqual(remembered, [
    {
      key: "wedding ring",
      value: "The $1,277 transfer to Yoon Thiri was my wedding ring",
      ownerAsked: false,
      source: "telegram",
      request: "Oh that is for my wedding ring",
      now: undefined,
    },
  ])
  assert.deepEqual(withMemory.proposals, [
    {
      id: "mem123",
      summary:
        "Remember: The $1,277 transfer to Yoon Thiri was my wedding ring",
    },
  ])
  const memoryResults = memoryReqs[1].messages.at(-1)!
    .content as Anthropic.ToolResultBlockParam[]
  assert.deepEqual(
    memoryResults.map((r) => r.is_error),
    [undefined, true, true],
    "owner_asked must be a boolean and is required"
  )
  const memoryInstructions = JSON.stringify(memoryReqs[0].system)
  assert.match(memoryInstructions, /propose_memory/)
  assert.match(memoryInstructions, /never say they were saved/)
  assert.doesNotMatch(memoryInstructions, /or save memories/)
  // A fact about one payment becomes a proposed note on that payment
  const noted: unknown[] = []
  const noteReqs: Anthropic.MessageCreateParamsNonStreaming[] = []
  const withNote = await runFinanceAgent("that was my wedding ring", {
    loadMemories: async () => [],
    source: "telegram",
    createMessage: async (params) => {
      noteReqs.push(structuredClone(params))
      if (noteReqs.length === 1)
        return response("tool_use", [
          call(
            "n1",
            { transaction_id: "yoon", note: "Wedding ring" },
            "propose_note"
          ),
          call("n2", { transaction_id: "yoon" }, "propose_note"),
        ])
      return done
    },
    proposeNote: async (input) => {
      noted.push({
        id: input.transactionId,
        note: input.note,
        source: input.source,
      })
      return {
        id: "note1",
        summary: "Note on YOXX THIXX $1,277: “Wedding ring”",
      }
    },
  })
  assert.deepEqual(noted, [
    { id: "yoon", note: "Wedding ring", source: "telegram" },
  ])
  assert.equal(withNote.proposals[0].id, "note1")
  const noteResults = noteReqs[1].messages.at(-1)!
    .content as Anthropic.ToolResultBlockParam[]
  assert.deepEqual(
    noteResults.map((r) => r.is_error),
    [undefined, true]
  )
  assert.match(JSON.stringify(noteReqs[0].system), /propose_note/)
  assert.doesNotMatch(
    withNote.text,
    /couldn’t load/,
    "no notice when memories load"
  )
  // Change log: read with list_changes, undo straight away with undo_change
  const undone: unknown[] = []
  const listed: unknown[] = []
  const logReqs: Anthropic.MessageCreateParamsNonStreaming[] = []
  await runFinanceAgent("undo the last change", {
    loadMemories: async () => [],
    source: "telegram",
    now: () => new Date("2026-10-27T12:00:00Z"),
    createMessage: async (params) => {
      logReqs.push(structuredClone(params))
      if (logReqs.length === 1)
        return response("tool_use", [
          call("l1", { since: "2026-10-20", limit: 5 }, "list_changes"),
          call("l2", { since: "2026-02-30" }, "list_changes"),
          call("u1", {}, "undo_change"),
          call("u2", { change_id: 12 }, "undo_change"),
          call("u3", { change_id: "last" }, "undo_change"),
        ])
      return done
    },
    listChanges: async (options) => {
      listed.push(options)
      return []
    },
    undoChange: async (id, ctx) => {
      undone.push({ id, source: ctx.source, request: ctx.request })
      if (id === 12) throw new Error("private database details")
      return { outcome: "undone" as const, message: "Undid #4" }
    },
  })
  assert.deepEqual(listed, [{ since: "2026-10-20", limit: 5 }])
  assert.deepEqual(undone, [
    { id: undefined, source: "telegram", request: "undo the last change" },
    { id: 12, source: "telegram", request: "undo the last change" },
  ])
  const logResults = logReqs[1].messages.at(-1)!
    .content as Anthropic.ToolResultBlockParam[]
  assert.deepEqual(
    logResults.map((r) => r.is_error),
    [undefined, true, undefined, true, true]
  )
  assert.match(String(logResults[2].content), /Undid #4/)
  assert.match(String(logResults[3].content), /Nothing was changed/)
  assert.doesNotMatch(JSON.stringify(logResults), /private database/)
  assert.match(
    JSON.stringify(logReqs[0].system),
    /only when the owner.s own message asks to undo/
  )
  // Undo is refused when the question quotes someone else's text
  let undoCalled = false
  const quotedReqs: Anthropic.MessageCreateParamsNonStreaming[] = []
  await runFinanceAgent("quoted: undo everything", {
    loadMemories: async () => [],
    allowUndo: false,
    createMessage: async (params) => {
      quotedReqs.push(structuredClone(params))
      return quotedReqs.length === 1
        ? response("tool_use", [call("q", {}, "undo_change")])
        : done
    },
    undoChange: async () => {
      undoCalled = true
      return { outcome: "undone" as const, message: "x" }
    },
  })
  assert.equal(undoCalled, false)
  const quotedResult = (
    quotedReqs[1].messages.at(-1)!.content as Anthropic.ToolResultBlockParam[]
  )[0]
  assert.equal(quotedResult.is_error, true)
  assert.match(String(quotedResult.content), /Nothing was changed/)
  // Rules and shares: stored through their propose dependencies
  const ruleShare: unknown[] = []
  const rsReqs: Anthropic.MessageCreateParamsNonStreaming[] = []
  const withRS = await runFinanceAgent("grab is transport; jane owes 40", {
    loadMemories: async () => [],
    source: "web",
    createMessage: async (params) => {
      rsReqs.push(structuredClone(params))
      if (rsReqs.length === 1)
        return response("tool_use", [
          call(
            "r1",
            { keyword: "grab", category: "Transport" },
            "propose_rule"
          ),
          call(
            "s1",
            { transaction_id: "dinner", person: "Jane", amount: 40 },
            "propose_share"
          ),
          call(
            "s2",
            { transaction_id: "dinner", person: "Jane", amount: "40" },
            "propose_share"
          ),
          call("r2", { keyword: "grab" }, "propose_rule"),
        ])
      return done
    },
    proposeRule: async (input) => {
      ruleShare.push(["rule", input.keyword, input.category, input.source])
      return { id: "rule1", summary: "Rule: grab → Transport" }
    },
    proposeShare: async (input) => {
      ruleShare.push(["share", input.transactionId, input.person, input.amount])
      return { id: "share1", summary: "Share: Jane owes $40" }
    },
  })
  assert.deepEqual(ruleShare, [
    ["rule", "grab", "Transport", "web"],
    ["share", "dinner", "Jane", 40],
  ])
  assert.deepEqual(
    withRS.proposals.map((p) => p.id),
    ["rule1", "share1"]
  )
  const rsResults = rsReqs[1].messages.at(-1)!
    .content as Anthropic.ToolResultBlockParam[]
  assert.deepEqual(
    rsResults.map((r) => r.is_error),
    [undefined, undefined, true, true]
  )
  const rsInstructions = JSON.stringify(rsReqs[0].system)
  assert.match(rsInstructions, /propose_rule/)
  assert.match(rsInstructions, /propose_share/)

  // An answer that claims a proposal nobody stored gets a notice, with the
  // reason when a propose_ tool refused (seen live on 29 Oct 2026)
  const claim =
    "I've proposed that your wife owes $1,500 of the $3,000 payment. Just tap to confirm or reject."
  const claimed = await runFinanceAgent("split the rent with my wife", {
    loadMemories: async () => [],
    createMessage: async () =>
      response("end_turn", [{ type: "text", text: claim, citations: null }]),
  })
  assert.match(
    claimed.text,
    /\(Nothing was actually proposed, so there are no buttons and nothing changed\. Please ask again\.\)$/
  )
  let refusedRound = 0
  const refused = await runFinanceAgent("split the rent with my wife", {
    loadMemories: async () => [],
    createMessage: async () =>
      ++refusedRound === 1
        ? response("tool_use", [
            call(
              "x1",
              { transaction_id: "made-up", person: "Wife", amount: 1500 },
              "propose_share"
            ),
          ])
        : response("end_turn", [
            { type: "text", text: claim, citations: null },
          ]),
    proposeShare: async () => {
      const { ProposalError } = await import("../lib/agent/proposals")
      throw new ProposalError("Transaction not found; search for it first")
    },
  })
  assert.match(
    refused.text,
    /The proposal was refused: Transaction not found; search for it first\. Please ask again\.\)$/
  )
  let realRound = 0
  const real = await runFinanceAgent("split the rent with my wife", {
    loadMemories: async () => [],
    createMessage: async () =>
      ++realRound === 1
        ? response("tool_use", [
            call(
              "x2",
              { transaction_id: "rent", person: "Wife", amount: 1500 },
              "propose_share"
            ),
          ])
        : response("end_turn", [
            { type: "text", text: claim, citations: null },
          ]),
    proposeShare: async () => ({ id: "s1", summary: "Share" }),
  })
  assert.equal(real.text, claim)
  assert.match(JSON.stringify(real), /"s1"/)

  // Each question says what became of recent proposals, since button taps
  // never reach the conversation (seen live on 29 Oct 2026)
  const statusReqs: Anthropic.MessageCreateParamsNonStreaming[] = []
  await runFinanceAgent("Confirm", {
    loadMemories: async () => [],
    recentProposals: async () => [
      {
        summary:
          "Share: Yoon Thiri owes $1,500 of CHEW NGENG HIANG $3,000 on 1 May 2026",
        status: "confirmed",
        created_at: "x",
      },
      {
        summary: "Budget: Food & Drink $500 a month",
        status: "pending",
        created_at: "x",
      },
    ],
    createMessage: async (params) => {
      statusReqs.push(structuredClone(params))
      return done
    },
  })
  const statusText = JSON.stringify(statusReqs[0].system)
  assert.match(
    statusText,
    /“Share: Yoon Thiri owes \$1,500 of CHEW NGENG HIANG \$3,000 on 1 May 2026”: confirmed/
  )
  assert.match(
    statusText,
    /“Budget: Food & Drink \$500 a month”: waiting for the owner's tap/
  )
  assert.match(
    statusText,
    /call the tools again for any number asked for again/
  )
  const failedReqs: Anthropic.MessageCreateParamsNonStreaming[] = []
  await runFinanceAgent("hi", {
    loadMemories: async () => [],
    recentProposals: async () => {
      throw new Error("db down")
    },
    createMessage: async (params) => {
      failedReqs.push(structuredClone(params))
      return done
    },
  })
  assert.match(
    JSON.stringify(failedReqs[0].system),
    /Whether recent proposals were confirmed is unknown/
  )

  // Trip spending: strict input, failures not zero, and the instructions
  // say to use the country code rather than search for the country's name
  const tripReqs: Anthropic.MessageCreateParamsNonStreaming[] = []
  const tripCalls: unknown[] = []
  await runFinanceAgent("how much did I spend in Korea?", {
    loadMemories: async () => [],
    createMessage: async (params) => {
      tripReqs.push(structuredClone(params))
      if (tripReqs.length === 1)
        return response("tool_use", [
          call(
            "k1",
            { date_from: "2026-04-26", date_to: "2026-05-13", country: "KR" },
            "trip_spending"
          ),
          call(
            "k2",
            {
              date_from: "2026-04-26",
              date_to: "2026-05-13",
              country: "Korea",
            },
            "trip_spending"
          ),
          call(
            "k3",
            { date_from: "2026-06-01", date_to: "2026-06-10", country: null },
            "trip_spending"
          ),
        ])
      return done
    },
    tripSpending: async (filters) => {
      tripCalls.push(filters)
      if ("date_from" in filters && filters.date_from === "2026-06-01")
        throw new Error("private database details")
      return {
        trip: null,
        date_from: "2026-04-26",
        date_to: "2026-05-13",
        country: null,
        added: [],
        added_not_counted: [],
        total_abroad: 0,
        total_added: 0,
        per_day_abroad: 0,
        left_out: 0,
        days: 18,
        count: 0,
        total: 0,
        gross_total: 0,
        per_day: 0,
        by_category: [],
        by_country: [],
        first_payment: null,
        last_payment: null,
        biggest: [],
      }
    },
  })
  assert.deepEqual(tripCalls, [
    { date_from: "2026-04-26", date_to: "2026-05-13", country: "KR" },
    { date_from: "2026-06-01", date_to: "2026-06-10" },
  ])
  const tripResults = tripReqs[1].messages.at(-1)!
    .content as Anthropic.ToolResultBlockParam[]
  assert.deepEqual(
    tripResults.map((r) => r.is_error),
    [undefined, true, true]
  )
  assert.doesNotMatch(JSON.stringify(tripResults), /private database/)
  assert.match(
    JSON.stringify(tripReqs[0].system),
    /never a text search for the country name/
  )

  // Trips: saving one and adding a payment are proposals on strict input,
  // and saved trips are listed with every question
  const tripPropReqs: Anthropic.MessageCreateParamsNonStreaming[] = []
  const tripProps: unknown[] = []
  const withTrip = await runFinanceAgent(
    "save my korea trip and add the flight",
    {
      loadMemories: async () => [],
      listTrips: async () => [
        {
          key: "japan",
          name: "Japan",
          date_from: "2025-12-01",
          date_to: "2025-12-08",
          country: "JP",
          updated_at: "x",
        },
      ],
      createMessage: async (params) => {
        tripPropReqs.push(structuredClone(params))
        if (tripPropReqs.length === 1)
          return response("tool_use", [
            call(
              "t1",
              {
                name: "Korea",
                date_from: "2026-04-26",
                date_to: "2026-05-13",
                country: "kr",
              },
              "propose_trip"
            ),
            call(
              "t2",
              {
                name: "Korea",
                date_from: "2026-05-13",
                date_to: "2026-04-26",
                country: "KR",
              },
              "propose_trip"
            ),
            call(
              "t3",
              { trip: "Korea", transaction_id: "flight", include: true },
              "propose_trip_payment"
            ),
            call(
              "t4",
              { trip: "Korea", transaction_id: "flight", include: "yes" },
              "propose_trip_payment"
            ),
          ])
        return done
      },
      proposeTrip: async (input) => {
        tripProps.push([
          "trip",
          input.name,
          input.date_from,
          input.date_to,
          input.country,
        ])
        return { id: "trip1", summary: "Trip" }
      },
      proposeTripPayment: async (input) => {
        tripProps.push(["mark", input.trip, input.transactionId, input.include])
        return { id: "mark1", summary: "Add" }
      },
    }
  )
  assert.deepEqual(tripProps, [
    ["trip", "Korea", "2026-04-26", "2026-05-13", "KR"],
    ["mark", "Korea", "flight", true],
  ])
  assert.deepEqual(
    withTrip.proposals.map((p) => p.id),
    ["trip1", "mark1"]
  )
  const tripPropResults = tripPropReqs[1].messages.at(-1)!
    .content as Anthropic.ToolResultBlockParam[]
  assert.deepEqual(
    tripPropResults.map((r) => r.is_error),
    [undefined, true, undefined, true]
  )
  assert.match(
    JSON.stringify(tripPropReqs[0].system),
    /Saved trips \(use trip_spending with the name\): Japan, 2025-12-01 to 2025-12-08 \(JP\)\./
  )

  // Cash payments: a proposal on strict input; the instructions say an
  // ATM withdrawal isn't spending
  const cashReqs: Anthropic.MessageCreateParamsNonStreaming[] = []
  const cashCalls: unknown[] = []
  const withCash = await runFinanceAgent("I spent 1k cash in Korea", {
    loadMemories: async () => [],
    createMessage: async (params) => {
      cashReqs.push(structuredClone(params))
      if (cashReqs.length === 1)
        return response("tool_use", [
          call(
            "c1",
            {
              date: "2026-04-26",
              amount: 1000,
              category: "Travel",
              description: "Korea trip cash",
              trip: "Korea",
            },
            "propose_cash_payment"
          ),
          call(
            "c2",
            {
              date: "26 Apr",
              amount: 1000,
              category: "Travel",
              description: "x",
              trip: null,
            },
            "propose_cash_payment"
          ),
          call(
            "c3",
            {
              date: "2026-04-26",
              amount: "1000",
              category: "Travel",
              description: "x",
              trip: null,
            },
            "propose_cash_payment"
          ),
        ])
      return done
    },
    proposeCashPayment: async (input) => {
      cashCalls.push([
        input.date,
        input.amount,
        input.category,
        input.description,
        input.trip,
      ])
      return { id: "cash1", summary: "New cash payment" }
    },
  })
  assert.deepEqual(cashCalls, [
    ["2026-04-26", 1000, "Travel", "Korea trip cash", "Korea"],
  ])
  assert.deepEqual(
    withCash.proposals.map((p) => p.id),
    ["cash1"]
  )
  const cashPayResults = cashReqs[1].messages.at(-1)!
    .content as Anthropic.ToolResultBlockParam[]
  assert.deepEqual(
    cashPayResults.map((r) => r.is_error),
    [undefined, true, true]
  )
  assert.match(
    JSON.stringify(cashReqs[0].system),
    /Taking cash out of an ATM isn't spending/
  )

  // Savings review: strict input, the clock passed through, failures not zero
  const savingsReqs: Anthropic.MessageCreateParamsNonStreaming[] = []
  const savingsCalls: unknown[] = []
  await runFinanceAgent("how much can I save and what should I cut?", {
    loadMemories: async () => [],
    now: () => new Date("2026-10-15T12:00:00Z"),
    createMessage: async (params) => {
      savingsReqs.push(structuredClone(params))
      if (savingsReqs.length === 1)
        return response("tool_use", [
          call("v1", { months: 3 }, "savings_review"),
          call("v2", { months: 12 }, "savings_review"),
          call("v3", { months: 6 }, "savings_review"),
        ])
      return done
    },
    savingsReview: async (at, months) => {
      savingsCalls.push([at.toISOString(), months])
      if (months === 6) throw new Error("private database details")
      return {
        months_counted: 0,
        months: [],
        average: { income: 1, spending: 1, savings: 0, savings_rate: 0 },
        this_month: { from: "", to: "", day: 15, days_in_month: 31 },
        categories: [],
      }
    },
  })
  assert.deepEqual(savingsCalls, [
    ["2026-10-15T12:00:00.000Z", 3],
    ["2026-10-15T12:00:00.000Z", 6],
  ])
  const savingsResults = savingsReqs[1].messages.at(-1)!
    .content as Anthropic.ToolResultBlockParam[]
  assert.deepEqual(
    savingsResults.map((r) => r.is_error),
    [undefined, true, true]
  )
  assert.doesNotMatch(JSON.stringify(savingsResults), /private database/)
  const savingsInstructions = JSON.stringify(savingsReqs[0].system)
  assert.match(savingsInstructions, /savings_review/)
  assert.match(savingsInstructions, /the choice is theirs/)

  // Budgets: a proposal on a strict input, and the month's status
  const budgetReqs: Anthropic.MessageCreateParamsNonStreaming[] = []
  const budgetCalls: unknown[] = []
  const withBudget = await runFinanceAgent("cap food at 500, how am I doing?", {
    loadMemories: async () => [],
    now: () => new Date("2026-09-15T12:00:00Z"),
    createMessage: async (params) => {
      budgetReqs.push(structuredClone(params))
      if (budgetReqs.length === 1)
        return response("tool_use", [
          call(
            "b1",
            { category: "Food & Drink", amount: 500 },
            "propose_budget"
          ),
          call(
            "b2",
            { category: "Food & Drink", amount: "500" },
            "propose_budget"
          ),
          call("b3", {}, "budget_status"),
          call("b4", { category: "Transport", amount: null }, "propose_budget"),
        ])
      return done
    },
    proposeBudget: async (input) => {
      budgetCalls.push(["budget", input.category, input.amount, input.source])
      return { id: `budget-${input.category}`, summary: "Budget" }
    },
    budgetStatus: async (at) => {
      budgetCalls.push(["status", at.toISOString()])
      return []
    },
  })
  assert.deepEqual(budgetCalls, [
    ["budget", "Food & Drink", 500, "web"],
    ["status", "2026-09-15T12:00:00.000Z"],
    ["budget", "Transport", null, "web"],
  ])
  assert.deepEqual(
    withBudget.proposals.map((p) => p.id),
    // Several budgets in one message: one proposal (one button) each
    ["budget-Food & Drink", "budget-Transport"]
  )
  const budgetResults = budgetReqs[1].messages.at(-1)!
    .content as Anthropic.ToolResultBlockParam[]
  assert.deepEqual(
    budgetResults.map((r) => r.is_error),
    [undefined, true, undefined, undefined]
  )
  assert.match(JSON.stringify(budgetReqs[0].system), /calendar month/)
  console.log("finance-agent: passed")
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
