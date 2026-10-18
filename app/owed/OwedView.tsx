"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { OwedAdjustmentForm } from "@/components/OwedAdjustmentForm"
import { OwedEditor } from "@/components/OwedEditor"
import { formatSGD } from "@/lib/display"
import {
  formatOwedDate,
  formatOwedMonth,
  owedBalanceLabel,
  owedEntryLabel,
  transactionTitle,
} from "@/lib/owed-format"
import type {
  OwedLedgerEntry,
  OwedRuleView,
  OwedSummaryResponse,
  ToSortItem,
} from "@/lib/owed-ledger"

const sectionHeading =
  "scroll-mt-4 text-sm font-medium text-zinc-300 [text-wrap:balance]"
const linkButton =
  "min-h-6 rounded px-2 text-xs focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50"

export function OwedView() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const personFilter = searchParams.get("person")

  const [data, setData] = useState<OwedSummaryResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch("/api/owed")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.balances)) {
          setData(d)
          setError(null)
        } else setError(d.error ?? "Couldn’t load")
      })
      .catch(() => setError("Couldn’t load"))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function setPersonFilter(person: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (person) params.set("person", person)
    else params.delete("person")
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  const people = data?.balances.map((b) => b.person) ?? []

  return (
    <div className="space-y-6 p-4 max-w-2xl mx-auto">
      <div>
        <h1 className="text-lg font-semibold text-zinc-100">Owed</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Money people owe you, and what pays it down. Only your own part of a
          shared payment counts as your spending.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg bg-red-900/30 border border-red-700/30 p-3 text-sm text-red-300"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={load}
            className={`${linkButton} text-red-200 hover:bg-red-900/40 focus-visible:ring-red-500`}
          >
            Try again
          </button>
        </div>
      )}

      {!data && !error && <OwedSkeleton />}

      {data && (
        <>
          <Totals data={data} onChanged={load} />
          <ToSort data={data} people={people} onChanged={load} />
          <History
            data={data}
            people={people}
            personFilter={personFilter}
            onPersonFilter={setPersonFilter}
            onChanged={load}
          />
          {data.rules.length > 0 && (
            <Rules rules={data.rules} onChanged={load} />
          )}
        </>
      )}
    </div>
  )
}

function OwedSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="h-28 rounded-xl bg-zinc-900 border border-zinc-800 animate-pulse" />
      <div className="h-40 rounded-xl bg-zinc-900 border border-zinc-800 animate-pulse" />
      <div className="h-64 rounded-xl bg-zinc-900 border border-zinc-800 animate-pulse" />
    </div>
  )
}

function Totals({
  data,
  onChanged,
}: {
  data: OwedSummaryResponse
  onChanged: () => void
}) {
  const [adjusting, setAdjusting] = useState<{
    person: string
    kind: "covered" | "forgiven"
  } | null>(null)

  if (data.balances.length === 0) {
    return (
      <Card className="bg-zinc-900 border-zinc-800 py-0 gap-0">
        <CardContent className="py-8 text-center space-y-2">
          <p className="text-zinc-300 font-medium">Nobody owes you anything</p>
          <p className="text-sm text-zinc-500">
            Split a payment below, or use Split… on any payment in{" "}
            <Link
              href="/transactions"
              className="text-blue-400 hover:text-blue-300"
            >
              Transactions
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    )
  }

  // Letting go of rent should count as Housing, not "Paid by Others"
  const lastShareCategory = (person: string) =>
    data.ledger.find((e) => e.person === person && e.kind === "share")?.category

  return (
    <section aria-labelledby="owed-totals" className="space-y-3">
      <h2 id="owed-totals" className="sr-only">
        Totals
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {data.balances.map((b) => (
          <Card key={b.person} className="bg-zinc-900 border-zinc-800 py-0 gap-0">
            <CardContent className="p-4">
              <p className="text-xs text-zinc-400 truncate">
                {owedBalanceLabel(b)}
              </p>
              <p
                className={`mt-1 text-3xl font-mono font-semibold tabular-nums ${b.balance > 0 ? "text-teal-300" : "text-zinc-100"}`}
              >
                {formatSGD(Math.abs(b.balance))}
              </p>
              <div className="mt-3 flex flex-wrap gap-1 -mx-2">
                <button
                  type="button"
                  onClick={() =>
                    setAdjusting({ person: b.person, kind: "covered" })
                  }
                  className={`${linkButton} text-blue-400 hover:bg-zinc-800 hover:text-blue-300 focus-visible:ring-blue-500`}
                >
                  {b.person} paid for something…
                </button>
                {b.balance > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setAdjusting({ person: b.person, kind: "forgiven" })
                    }
                    className={`${linkButton} text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 focus-visible:ring-blue-500`}
                  >
                    Let it go…
                  </button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {adjusting && (
        <OwedAdjustmentForm
          key={`${adjusting.person}-${adjusting.kind}`}
          kind={adjusting.kind}
          person={adjusting.person}
          defaultAmount={
            adjusting.kind === "forgiven"
              ? data.balances.find((b) => b.person === adjusting.person)
                  ?.balance
              : undefined
          }
          defaultCategory={
            adjusting.kind === "forgiven"
              ? lastShareCategory(adjusting.person)
              : undefined
          }
          onCancel={() => setAdjusting(null)}
          onSaved={() => {
            setAdjusting(null)
            onChanged()
          }}
        />
      )}
    </section>
  )
}

function ToSort({
  data,
  people,
  onChanged,
}: {
  data: OwedSummaryResponse
  people: string[]
  onChanged: () => void
}) {
  const { incoming, outgoing } = data.toSort
  const total = incoming.length + outgoing.length

  return (
    <section aria-labelledby="owed-to-sort" className="space-y-3">
      <div>
        <h2 id="owed-to-sort" className={sectionHeading}>
          To sort{total > 0 && ` (${total})`}
        </h2>
        <p className="text-xs text-zinc-500">
          Recent bank transactions that might be owed money, from the last 4
          months.
        </p>
      </div>
      {total === 0 ? (
        <p className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-4 text-sm text-zinc-500">
          Nothing to sort. New transfers and rent will show up here after you
          upload a statement.
        </p>
      ) : (
        <>
          {incoming.length > 0 && (
            <ToSortGroup
              title="Money in: is it a repayment?"
              items={incoming}
              people={people}
              onChanged={onChanged}
            />
          )}
          {outgoing.length > 0 && (
            <ToSortGroup
              title="Money out: is part of it owed back?"
              items={outgoing}
              people={people}
              onChanged={onChanged}
            />
          )}
        </>
      )}
    </section>
  )
}

function ToSortGroup({
  title,
  items,
  people,
  onChanged,
}: {
  title: string
  items: ToSortItem[]
  people: string[]
  onChanged: () => void
}) {
  return (
    <Card className="bg-zinc-900 border-zinc-800 py-0 gap-0">
      <CardContent className="p-3 space-y-2">
        <p className="text-xs text-zinc-400">{title}</p>
        <ul className="divide-y divide-zinc-800">
          {items.map((item) => (
            <ToSortRow
              key={item.id}
              item={item}
              people={people}
              onChanged={onChanged}
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function ToSortRow({
  item,
  people,
  onChanged,
}: {
  item: ToSortItem
  people: string[]
  onChanged: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState<"quick" | "dismiss" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const isIncoming = item.amount > 0

  async function post(
    url: string,
    init: RequestInit,
    kind: "quick" | "dismiss"
  ) {
    setBusy(kind)
    setError(null)
    try {
      const res = await fetch(url, init)
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setError(typeof json.error === "string" ? json.error : "Couldn’t save")
        return
      }
      onChanged()
    } catch {
      setError("Couldn’t save")
    } finally {
      setBusy(null)
    }
  }

  function quickRepayment(person: string) {
    post(
      `/api/transactions/${item.id}/owed`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "repayment", person }),
      },
      "quick"
    )
  }

  function dismiss() {
    post(
      "/api/owed/dismiss",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: item.id }),
      },
      "dismiss"
    )
  }

  return (
    <li className="py-2.5 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-zinc-200">
            {transactionTitle(item.description)}
          </p>
          <p className="text-xs text-zinc-500">
            {formatOwedDate(item.date)} · {item.category}
          </p>
        </div>
        <span
          className={`shrink-0 font-mono text-sm tabular-nums ${isIncoming ? "text-green-400" : "text-zinc-100"}`}
        >
          {isIncoming ? "+" : "−"}
          {formatSGD(Math.abs(item.amount))}
        </span>
      </div>
      {!editing && (
        <div className="flex flex-wrap gap-1 -mx-2">
          {isIncoming && item.suggestedPerson && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => quickRepayment(item.suggestedPerson!)}
              className={`${linkButton} bg-teal-900/40 text-teal-200 hover:bg-teal-900/70 focus-visible:ring-teal-500`}
            >
              {busy === "quick"
                ? "Saving…"
                : `Repayment from ${item.suggestedPerson}`}
            </button>
          )}
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => setEditing(true)}
            className={`${linkButton} text-blue-400 hover:bg-zinc-800 hover:text-blue-300 focus-visible:ring-blue-500`}
          >
            {isIncoming
              ? item.suggestedPerson
                ? "Someone else…"
                : "Repayment…"
              : "Split…"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={dismiss}
            className={`${linkButton} text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 focus-visible:ring-blue-500`}
          >
            {busy === "dismiss" ? "Hiding…" : "Not owed money"}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-300">
          {error}
        </p>
      )}
      {editing && (
        <OwedEditor
          transaction={{ ...item, owed: null }}
          knownPeople={people}
          defaultPerson={item.suggestedPerson}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            onChanged()
          }}
        />
      )}
    </li>
  )
}

function History({
  data,
  people,
  personFilter,
  onPersonFilter,
  onChanged,
}: {
  data: OwedSummaryResponse
  people: string[]
  personFilter: string | null
  onPersonFilter: (person: string | null) => void
  onChanged: () => void
}) {
  const entries = useMemo(
    () =>
      personFilter
        ? data.ledger.filter((e) => e.person === personFilter)
        : data.ledger,
    [data.ledger, personFilter]
  )
  const byMonth = useMemo(() => {
    const groups: { month: string; entries: OwedLedgerEntry[] }[] = []
    for (const e of entries) {
      const month = e.date.slice(0, 7)
      const last = groups[groups.length - 1]
      if (last?.month === month) last.entries.push(e)
      else groups.push({ month, entries: [e] })
    }
    return groups
  }, [entries])

  if (data.ledger.length === 0) return null

  return (
    <section aria-labelledby="owed-history" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="owed-history" className={sectionHeading}>
            History
          </h2>
          <p className="text-xs text-zinc-500">
            Newest first. “Owed after” is that person’s total right after each
            entry.
          </p>
        </div>
        {people.length > 1 && (
          <label className="text-xs text-zinc-400 flex items-center gap-2">
            <span>Person</span>
            <select
              value={personFilter ?? ""}
              onChange={(e) => onPersonFilter(e.target.value || null)}
              className="h-8 rounded-md border border-zinc-700 bg-zinc-800 px-2 text-base sm:text-sm text-zinc-100"
            >
              <option value="">Everyone</option>
              {people.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {byMonth.length === 0 && (
        <p className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-4 text-sm text-zinc-500">
          Nothing for {personFilter} yet.{" "}
          <button
            type="button"
            onClick={() => onPersonFilter(null)}
            className="text-blue-400 hover:text-blue-300"
          >
            Show everyone
          </button>
        </p>
      )}

      {byMonth.map((group) => (
        <Card key={group.month} className="bg-zinc-900 border-zinc-800 py-0 gap-0">
          <CardContent className="p-3">
            <h3 className="px-1 pb-1 text-xs font-medium text-zinc-400">
              {formatOwedMonth(group.month)}
            </h3>
            <div
              className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 px-1 pb-1 text-[10px] uppercase tracking-wider text-zinc-500"
              aria-hidden="true"
            >
              <span>Entry</span>
              <span className="text-right">Change</span>
              <span className="text-right">Owed after</span>
            </div>
            <ul className="divide-y divide-zinc-800">
              {group.entries.map((e) => (
                <HistoryRow
                  key={e.transaction_id}
                  entry={e}
                  people={people}
                  onChanged={onChanged}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </section>
  )
}

function HistoryRow({
  entry: e,
  people,
  onChanged,
}: {
  entry: OwedLedgerEntry
  people: string[]
  onChanged: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [removing, setRemoving] = useState(false)
  const isShare = e.kind === "share"
  const offBank = e.kind === "covered" || e.kind === "forgiven"

  async function remove() {
    const ok = window.confirm(
      `Remove “${owedEntryLabel(e)}” (${formatSGD(e.amount)})? ${e.person} will owe that amount again.`
    )
    if (!ok) return
    setRemoving(true)
    try {
      await fetch(`/api/transactions/${e.transaction_id}/owed`, {
        method: "DELETE",
      })
      onChanged()
    } finally {
      setRemoving(false)
    }
  }

  return (
    <li className="py-2 px-1 space-y-2">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-zinc-200">{owedEntryLabel(e)}</p>
          <p className="text-xs text-zinc-500">
            {formatOwedDate(e.date)}
            {offBank && ` · ${e.category}`}
            {offBank ? (
              <button
                type="button"
                onClick={remove}
                disabled={removing}
                className={`${linkButton} ml-1 text-red-300 hover:bg-red-900/30 hover:text-red-200 focus-visible:ring-red-500`}
              >
                {removing ? "Removing…" : "Remove"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setEditing((v) => !v)}
                aria-expanded={editing}
                className={`${linkButton} ml-1 text-blue-400 hover:bg-zinc-800 hover:text-blue-300 focus-visible:ring-blue-500`}
              >
                Edit…
              </button>
            )}
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
      </div>
      {editing && (
        <OwedEditor
          transaction={{
            id: e.transaction_id,
            date: e.date,
            description: e.description,
            amount: e.transaction_amount,
            owed: { kind: e.kind, person: e.person, amount: e.amount },
          }}
          knownPeople={people}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            onChanged()
          }}
        />
      )}
    </li>
  )
}

function Rules({
  rules,
  onChanged,
}: {
  rules: OwedRuleView[]
  onChanged: () => void
}) {
  const [removingId, setRemovingId] = useState<string | null>(null)

  async function remove(rule: OwedRuleView) {
    const ok = window.confirm(
      `Stop auto-splitting payments matching “${rule.keyword}”? Splits already made stay.`
    )
    if (!ok) return
    setRemovingId(rule.id)
    try {
      await fetch(`/api/owed/rules/${rule.id}`, { method: "DELETE" })
      onChanged()
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <section aria-labelledby="owed-rules" className="space-y-3">
      <div>
        <h2 id="owed-rules" className={sectionHeading}>
          Auto-split
        </h2>
        <p className="text-xs text-zinc-500">
          Add one by ticking “Split every payment like this” when you split a
          payment.
        </p>
      </div>
      <div className="space-y-1.5">
        {rules.map((rule) => (
          <div
            key={rule.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2"
          >
            <p className="min-w-0 text-sm text-zinc-300">
              <span className="break-words">
                Payments matching “{rule.keyword}”
              </span>{" "}
              → {formatSGD(rule.amount)} owed by {rule.person}, from{" "}
              {formatOwedDate(rule.starts_on)}
            </p>
            <button
              type="button"
              onClick={() => remove(rule)}
              disabled={removingId === rule.id}
              className={`${linkButton} shrink-0 text-red-300 hover:bg-red-900/30 hover:text-red-200 focus-visible:ring-red-500`}
            >
              {removingId === rule.id ? "Removing…" : "Remove"}
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
