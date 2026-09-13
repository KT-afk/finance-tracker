import { NextRequest, NextResponse } from "next/server"
import { runFinanceAgent } from "@/lib/agent/run-finance-agent"

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const question =
    typeof body?.question === "string" ? body.question.trim() : ""
  if (!question)
    return NextResponse.json({ error: "question is required" }, { status: 400 })
  try {
    return NextResponse.json(await runFinanceAgent(question))
  } catch {
    return NextResponse.json(
      { error: "Unable to complete your question. Please try again." },
      { status: 500 }
    )
  }
}
