import type { Metadata } from "next"
import { BudgetsView } from "./BudgetsView"

export const metadata: Metadata = {
  title: "Budgets · Finance Tracker",
}

export default function BudgetsPage() {
  return <BudgetsView />
}
