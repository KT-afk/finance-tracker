"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { formatSGD } from "@/lib/display"
import type { BalanceGroups } from "@/lib/balance-groups"

const BANK_LABELS: Record<string, string> = {
  ocbc: "OCBC",
  dbs: "DBS/POSB",
  uob: "UOB",
  trust: "Trust",
  wise: "Wise",
  chocolate: "Chocolate",
}

function dayLabel(date: string) {
  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`))
}

function AccountLines({
  accounts,
}: {
  accounts: BalanceGroups["savings"]["accounts"]
}) {
  return (
    <ul className="mt-2 space-y-1">
      {accounts.map((a) => (
        <li
          key={`${a.bank}-${a.account_type}`}
          className="flex items-baseline justify-between gap-3 text-sm"
        >
          <span className="min-w-0 truncate text-zinc-300">
            {BANK_LABELS[a.bank] ?? a.bank}
            {a.account_type === "credit_card" ? " card (owed)" : ""}
          </span>
          <span className="shrink-0 tabular-nums text-zinc-400">
            {formatSGD(a.counts_as)}{" "}
            <span className="text-xs text-zinc-500">
              {a.exact ? "" : "saved "}
              {dayLabel(a.as_of)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}

/** The owner's money in three groups, each balance with its own date. */
export function MoneyGroups() {
  const [data, setData] = useState<BalanceGroups | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch("/api/balance-groups")
      .then((r) => r.json())
      .then((d) => (d && d.spending ? setData(d) : setError(true)))
      .catch(() => setError(true))
  }, [])

  if (error)
    return (
      <p role="alert" className="text-sm text-red-300">
        Couldn’t load the three groups. Reload to try again.
      </p>
    )
  if (!data)
    return (
      <div className="grid gap-3 sm:grid-cols-3" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-28 rounded-xl border border-zinc-800 bg-zinc-900 animate-pulse"
          />
        ))}
      </div>
    )

  const inv = data.investments
  return (
    <section aria-labelledby="money-groups" className="space-y-2">
      <h2
        id="money-groups"
        className="scroll-mt-4 text-sm font-medium text-zinc-300"
      >
        Your money
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="border-zinc-800 bg-zinc-900">
          <CardContent className="p-4">
            <p className="text-xs text-zinc-400">Spending money</p>
            <p className="text-xl font-semibold tabular-nums">
              {formatSGD(data.spending.total)}
            </p>
            <AccountLines accounts={data.spending.accounts} />
          </CardContent>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900">
          <CardContent className="p-4">
            <p className="text-xs text-zinc-400">Savings</p>
            <p className="text-xl font-semibold tabular-nums">
              {formatSGD(data.savings.total)}
            </p>
            <AccountLines accounts={data.savings.accounts} />
          </CardContent>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900">
          <CardContent className="p-4">
            <p className="text-xs text-zinc-400">Investments (IBKR)</p>
            <p className="text-xl font-semibold tabular-nums">
              {formatSGD(inv.value ?? inv.put_in)}
            </p>
            <p className="mt-2 text-sm text-zinc-400">
              {inv.value !== null
                ? `Worth ${formatSGD(inv.value)}${inv.value_as_of ? ` on ${dayLabel(inv.value_as_of)}` : ""}; put in ${formatSGD(inv.put_in)}`
                : `Put in ${formatSGD(inv.put_in)} (value not given)`}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {inv.debits} monthly transfers
              {inv.first_debit ? ` since ${dayLabel(inv.first_debit)}` : ""}
              {inv.put_in_before !== null
                ? `, plus ${formatSGD(inv.put_in_before)} before`
                : ""}
            </p>
          </CardContent>
        </Card>
      </div>
      {data.missing.length > 0 && (
        <p className="text-xs text-zinc-500">
          No balance yet for{" "}
          {data.missing.map((b) => BANK_LABELS[b] ?? b).join(", ")}. Upload a
          statement, or tell the bot (“Trust is at $430”).
        </p>
      )}
    </section>
  )
}
