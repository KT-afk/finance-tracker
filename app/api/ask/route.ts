import { NextRequest, NextResponse } from "next/server"
import { runFinanceAgent } from "@/lib/agent/run-finance-agent"
import { loadHistory, saveExchange } from "@/lib/agent/conversation"

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const question =
    typeof body?.question === "string" ? body.question.trim() : ""
  if (!question)
    return NextResponse.json({ error: "question is required" }, { status: 400 })
  try {
    const history = await loadHistory("web", "ask", new Date())
    const answer = await runFinanceAgent(question, { history })
    await saveExchange({
      question,
      answer: answer.text,
      source: "web",
      topic: "ask",
      at: new Date(),
    })
    return NextResponse.json({ text: answer.text, answer_data: null })
  } catch {
    return NextResponse.json(
      { error: "Unable to complete your question. Please try again." },
      { status: 500 }
    )
  }
}
