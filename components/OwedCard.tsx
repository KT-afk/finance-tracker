"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { formatSGD } from "@/lib/display"
import { owedBalanceLabel } from "@/lib/owed-format"
import type { OwedSummaryResponse } from "@/lib/owed-ledger"

/** Dashboard summary of what people owe; the details live on /owed. */
export default function OwedCard() {
  const [summary, setSummary] = useState<OwedSummaryResponse | null>(null)

  useEffect(() => {
    fetch("/api/owed")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.balances)) setSummary(d)
      })
      .catch(() => {})
  }, [])

  if (!summary) return null
  const owing = summary.balances.filter((b) => b.balance !== 0)
  const toSort = summary.toSort.incoming.length + summary.toSort.outgoing.length
  if (owing.length === 0 && summary.ledger.length === 0) return null

  return (
    <Card className="bg-zinc-900 border-zinc-800 py-0">
      <CardContent className="p-0">
        <Link
          href="/owed"
          className="flex items-center justify-between gap-3 rounded-xl px-4 py-3 hover:bg-zinc-800/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <div className="min-w-0 space-y-0.5">
            {owing.length === 0 ? (
              <p className="text-sm text-zinc-300">Nobody owes you anything</p>
            ) : (
              owing.map((b) => (
                <p key={b.person} className="truncate text-sm text-zinc-300">
                  {owedBalanceLabel(b)}{" "}
                  <span
                    className={`font-mono font-semibold tabular-nums ${b.balance > 0 ? "text-teal-300" : "text-zinc-100"}`}
                  >
                    {formatSGD(Math.abs(b.balance))}
                  </span>
                </p>
              ))
            )}
            {toSort > 0 && (
              <p className="text-xs text-amber-300">{toSort} to sort</p>
            )}
          </div>
          <span className="shrink-0 text-xs text-blue-400">Owed →</span>
        </Link>
      </CardContent>
    </Card>
  )
}
