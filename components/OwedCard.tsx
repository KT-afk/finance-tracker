"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { describeTransaction } from "@/lib/describe-transaction"
import { formatSGD } from "@/lib/display"
import type { OwedBalance, OwedLedgerEntry } from "@/lib/owed-ledger"

interface OwedRule {
  id: string
  keyword: string
  person: string
  amount: number
  starts_on: string
}

interface OwedSummary {
  balances: OwedBalance[]
  ledger: OwedLedgerEntry[]
  rules: OwedRule[]
}

const COLLAPSED_ROWS = 5

const dateFormat = new Intl.DateTimeFormat("en-SG", {
  day: "numeric",
  month: "short",
  year: "2-digit",
})

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number)
  return dateFormat.format(new Date(y, m - 1, d))
}

function balanceLabel({ person, balance }: OwedBalance): string {
  if (balance > 0) return `${person} owes you`
  if (balance < 0) return `You owe ${person}`
  return `You and ${person} are square`
}

/** Running total of what people owe the owner, with the entries behind it. */
export default function OwedCard() {
  const [summary, setSummary] = useState<OwedSummary | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [removingRuleId, setRemovingRuleId] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch("/api/owed")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.balances)) setSummary(d)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function removeRule(rule: OwedRule) {
    const ok = window.confirm(
      `Stop auto-splitting payments matching “${rule.keyword}”? Splits already made stay.`
    )
    if (!ok) return
    setRemovingRuleId(rule.id)
    try {
      await fetch(`/api/owed/rules/${rule.id}`, { method: "DELETE" })
      load()
    } finally {
      setRemovingRuleId(null)
    }
  }

  if (!summary) return null
  if (summary.ledger.length === 0 && summary.rules.length === 0) return null

  const rows = showAll
    ? summary.ledger
    : summary.ledger.slice(0, COLLAPSED_ROWS)

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm text-zinc-400 font-normal">
          Owed to you
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {summary.balances.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {summary.balances.map((b) => (
              <div key={b.person} className="rounded-lg bg-zinc-800/50 p-3">
                <p className="text-xs text-zinc-400 truncate">
                  {balanceLabel(b)}
                </p>
                <p
                  className={`mt-1 text-2xl font-mono font-semibold tabular-nums ${b.balance > 0 ? "text-teal-300" : "text-zinc-100"}`}
                >
                  {formatSGD(Math.abs(b.balance))}
                </p>
              </div>
            ))}
          </div>
        )}

        {rows.length > 0 && (
          <div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 px-1 pb-1 text-[10px] uppercase tracking-wider text-zinc-500">
              <span>Entry</span>
              <span className="text-right">Change</span>
              <span className="text-right">Owed after</span>
            </div>
            <ul className="divide-y divide-zinc-800">
              {rows.map((e) => {
                const title =
                  describeTransaction(e.description).title || e.description
                const isShare = e.kind === "share"
                return (
                  <li
                    key={e.transaction_id}
                    className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 px-1 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-zinc-200">
                        {isShare
                          ? `${e.person}’s share of ${title}`
                          : `${e.person} paid you back`}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {formatDate(e.date)}
                      </p>
                    </div>
                    <span
                      className={`font-mono text-sm tabular-nums text-right ${isShare ? "text-zinc-100" : "text-green-400"}`}
                    >
                      {isShare ? "+" : "−"}
                      {formatSGD(e.amount)}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-right text-zinc-400">
                      {formatSGD(e.balance)}
                    </span>
                  </li>
                )
              })}
            </ul>
            {summary.ledger.length > COLLAPSED_ROWS && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="mt-1 min-h-6 rounded px-1 text-xs text-blue-400 hover:text-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {showAll
                  ? "Show fewer"
                  : `Show all ${summary.ledger.length} entries`}
              </button>
            )}
          </div>
        )}

        {summary.rules.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-zinc-500">Auto-split</p>
            {summary.rules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center justify-between gap-3 rounded-md bg-zinc-800/40 px-2.5 py-1.5"
              >
                <p className="min-w-0 text-xs text-zinc-300">
                  <span className="break-words">
                    Payments matching “{rule.keyword}”
                  </span>{" "}
                  → {formatSGD(rule.amount)} owed by {rule.person}, from{" "}
                  {formatDate(rule.starts_on)}
                </p>
                <button
                  type="button"
                  onClick={() => removeRule(rule)}
                  disabled={removingRuleId === rule.id}
                  className="min-h-6 shrink-0 rounded px-2 text-xs text-red-300 hover:bg-red-900/30 hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50"
                >
                  {removingRuleId === rule.id ? "Removing…" : "Remove"}
                </button>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-zinc-500">
          Repayments lower the total and don’t count as income. Use{" "}
          <Link
            href="/transactions"
            className="text-blue-400 hover:text-blue-300"
          >
            Split… or Repayment…
          </Link>{" "}
          on a transaction.
        </p>
      </CardContent>
    </Card>
  )
}
