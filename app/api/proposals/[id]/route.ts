import { NextRequest, NextResponse } from "next/server"
import { decideProposal } from "@/lib/agent/proposals"

/**
 * The owner's Confirm or Reject on a proposal from the web Ask page.
 * Body: { decision: "confirm" | "reject" }. Behind the app password.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  const decision = body?.decision
  if (decision !== "confirm" && decision !== "reject")
    return NextResponse.json(
      { error: "decision must be confirm or reject" },
      { status: 400 }
    )
  try {
    return NextResponse.json(await decideProposal(id, decision, new Date()))
  } catch (error) {
    console.error("Proposal decision failed", error)
    return NextResponse.json(
      {
        error: "Couldn’t do that just now. Nothing changed. Please try again.",
      },
      { status: 500 }
    )
  }
}
