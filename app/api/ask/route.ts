import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { aiConversations } from "@/lib/schema"
import { runFinanceAgent } from "@/lib/agent/run-finance-agent"

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const question =
    typeof body?.question === "string" ? body.question.trim() : ""
  if (!question)
    return NextResponse.json({ error: "question is required" }, { status: 400 })
  try {
    const answer = await runFinanceAgent(question)
    await db.insert(aiConversations).values({
      question,
      answer_text: answer.text,
      answer_data: null,
      created_at: new Date().toISOString(),
    })
    return NextResponse.json({ text: answer.text, answer_data: null })
  } catch {
    return NextResponse.json(
      { error: "Unable to complete your question. Please try again." },
      { status: 500 }
    )
  }
}
