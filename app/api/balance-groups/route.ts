import { NextResponse } from "next/server"
import { balanceGroups } from "@/lib/balance-groups"

/** Spending money, savings and investments, for the Accounts page. */
export async function GET() {
  try {
    return NextResponse.json(await balanceGroups())
  } catch (error) {
    console.error("[GET /api/balance-groups]", error)
    return NextResponse.json(
      { error: "Couldn’t load balances" },
      { status: 500 }
    )
  }
}
