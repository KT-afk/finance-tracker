import { NextRequest, NextResponse } from "next/server"
import {
  decideProposal,
  ProposalError,
  proposeBudget,
} from "@/lib/agent/proposals"
import { BUDGET_CATEGORIES, budgetMonth, budgetStatus } from "@/lib/budgets"

/** This month's budgets, for the Budgets page. Behind the app password. */
export async function GET() {
  try {
    const now = new Date()
    return NextResponse.json({
      month: budgetMonth(now),
      budgets: await budgetStatus(now),
      categories: BUDGET_CATEGORIES,
    })
  } catch (error) {
    console.error("[GET /api/budgets]", error)
    return NextResponse.json(
      { error: "Couldn’t load budgets" },
      { status: 500 }
    )
  }
}

/**
 * Set, change or remove (amount null) one budget from the Budgets page.
 * The same proposal as chat uses, confirmed at once since the owner is the
 * one asking, so it's checked, logged and undoable the same way.
 */
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const category = body?.category
  const amount = body?.amount
  if (
    typeof category !== "string" ||
    (amount !== null &&
      (typeof amount !== "number" || !Number.isFinite(amount)))
  )
    return NextResponse.json(
      { error: "Send a category and an amount (or null to remove)" },
      { status: 400 }
    )
  const now = new Date()
  let proposalId: string | null = null
  try {
    const proposal = await proposeBudget({
      category,
      amount,
      source: "web",
      request: `Budgets page: ${amount === null ? `remove ${category}` : `${category} ${amount}`}`,
      now,
    })
    proposalId = proposal.id
    const result = await decideProposal(proposal.id, "confirm", now)
    return NextResponse.json(result, {
      status: result.outcome === "applied" ? 200 : 409,
    })
  } catch (error) {
    if (error instanceof ProposalError)
      return NextResponse.json({ error: error.message }, { status: 400 })
    console.error("[PUT /api/budgets]", error)
    // Don't leave it pending, where a later tap in chat could apply it
    if (proposalId)
      await decideProposal(proposalId, "reject", now).catch(() => {})
    return NextResponse.json(
      { error: "Couldn’t save just now. Nothing changed. Please try again." },
      { status: 500 }
    )
  }
}
