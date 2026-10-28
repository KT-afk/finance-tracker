"use client"

import { useCallback, useEffect, useId, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { inputClass } from "@/components/OwedEditor"
import { formatSGD } from "@/lib/display"
import type { BudgetStatus } from "@/lib/budgets"

type Month = { start: string; dayOfMonth: number; daysInMonth: number }
type Data = { month: Month; budgets: BudgetStatus[]; categories: string[] }

const sectionHeading =
  "scroll-mt-4 text-sm font-medium text-zinc-300 [text-wrap:balance]"

function monthLabel(start: string) {
  return new Intl.DateTimeFormat("en-SG", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${start}T00:00:00Z`))
}

/** "500", "$1,200.50 " → number; anything else → null (shown as an error). */
function parseAmount(text: string): number | null {
  const cleaned = text.trim().replace(/[$,\s]/g, "")
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  return Number(cleaned)
}

async function saveBudget(category: string, amount: number | null) {
  const res = await fetch("/api/budgets", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category, amount }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? body.message ?? "Couldn’t save")
  return body.message as string
}

export function BudgetsView() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch("/api/budgets")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.budgets)) {
          setData(d)
          setError(null)
        } else setError(d.error ?? "Couldn’t load budgets")
      })
      .catch(() => setError("Couldn’t load budgets"))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const saved = (message: string) => {
    setNotice(message)
    load()
  }

  const unbudgeted = data
    ? data.categories.filter((c) => !data.budgets.some((b) => b.category === c))
    : []

  return (
    <div className="space-y-6 p-4 max-w-2xl mx-auto">
      <div>
        <h1 className="text-lg font-semibold text-zinc-100">Budgets</h1>
        <p className="mt-1 text-sm text-zinc-400">
          A monthly limit per category, from the 1st to the last day of the
          month. Only your own share of a payment counts. Nothing rolls over.
          Every change is in the change log, and you can undo it by asking in
          Telegram.
        </p>
      </div>

      <p aria-live="polite" className="text-sm text-emerald-300 empty:hidden">
        {notice}
      </p>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-red-700/40 bg-red-900/30 px-3 py-2 text-sm text-red-300"
        >
          {error}{" "}
          <button
            type="button"
            onClick={load}
            className="min-h-6 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            Try again
          </button>
        </div>
      )}

      {!data && !error && (
        <div className="space-y-3" aria-hidden="true">
          <div className="h-5 w-48 rounded bg-zinc-900 animate-pulse" />
          <div className="h-32 rounded-xl bg-zinc-900 border border-zinc-800 animate-pulse" />
          <div className="h-32 rounded-xl bg-zinc-900 border border-zinc-800 animate-pulse" />
        </div>
      )}

      {data && (
        <>
          <section className="space-y-3" aria-labelledby="this-month">
            <h2 id="this-month" className={sectionHeading}>
              {monthLabel(data.month.start)}: day {data.month.dayOfMonth} of{" "}
              {data.month.daysInMonth}
            </h2>
            {data.budgets.length === 0 ? (
              <p className="text-sm text-zinc-400">
                No budgets yet. Add one below, or say “cap food at $500” in
                Telegram.
              </p>
            ) : (
              <ul className="space-y-3">
                {data.budgets.map((b) => (
                  <li key={b.category}>
                    <BudgetCard budget={b} onSaved={saved} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {unbudgeted.length > 0 && (
            <section className="space-y-3" aria-labelledby="add-budget">
              <h2 id="add-budget" className={sectionHeading}>
                Add a budget
              </h2>
              <AddBudget categories={unbudgeted} onSaved={saved} />
            </section>
          )}
        </>
      )}
    </div>
  )
}

const paceStyle: Record<BudgetStatus["pace"], string> = {
  "on track": "text-emerald-300",
  "ahead of pace": "text-amber-300",
  "over budget": "text-red-300",
}
const barStyle: Record<BudgetStatus["pace"], string> = {
  "on track": "bg-emerald-500",
  "ahead of pace": "bg-amber-500",
  "over budget": "bg-red-500",
}

function BudgetCard({
  budget: b,
  onSaved,
}: {
  budget: BudgetStatus
  onSaved: (message: string) => void
}) {
  const id = useId()
  const [amount, setAmount] = useState(String(b.limit))
  const [busy, setBusy] = useState<"save" | "remove" | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(kind: "save" | "remove", value: number | null) {
    setBusy(kind)
    setError(null)
    try {
      onSaved(await saveBudget(b.category, value))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t save")
    } finally {
      setBusy(null)
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const value = parseAmount(amount)
    if (value === null) {
      setError("Enter an amount, like 500")
      document.getElementById(`${id}-amount`)?.focus()
      return
    }
    if (value === b.limit) {
      setError(`The budget is already ${formatSGD(b.limit)}`)
      return
    }
    run("save", value)
  }

  function remove() {
    if (window.confirm(`Remove the ${b.category} budget?`)) run("remove", null)
  }

  return (
    <Card className="border-zinc-800 bg-zinc-900">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="min-w-0 truncate font-medium text-zinc-100">
            {b.category}
          </h3>
          <p className={`shrink-0 text-sm ${paceStyle[b.pace]}`}>{b.pace}</p>
        </div>
        <div
          role="progressbar"
          aria-label={`${b.category} budget used`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(b.usedPct, 100)}
          aria-valuetext={`${b.usedPct}% used`}
          className="relative h-2 overflow-hidden rounded-full bg-zinc-800"
        >
          <div
            className={`h-full origin-left rounded-full ${barStyle[b.pace]}`}
            style={{ transform: `scaleX(${Math.min(b.usedPct, 100) / 100})` }}
          />
          <div
            aria-hidden="true"
            title="Share of the month gone"
            className="absolute inset-y-0 w-0.5 bg-zinc-300"
            style={{ left: `${b.monthPct}%` }}
          />
        </div>
        <p className="text-sm text-zinc-400 tabular-nums">
          {formatSGD(b.spent)} of {formatSGD(b.limit)} ({b.usedPct}%) ·{" "}
          {b.left >= 0
            ? `${formatSGD(b.left)} left`
            : `${formatSGD(-b.left)} over`}{" "}
          · {b.monthPct}% of the month gone
        </p>
        <form
          onSubmit={submit}
          noValidate
          className="flex flex-wrap items-end gap-2"
        >
          <label
            htmlFor={`${id}-amount`}
            className="flex-1 space-y-1 text-xs text-zinc-400"
          >
            <span>Monthly limit (SGD)</span>
            <input
              id={`${id}-amount`}
              name="amount"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              className={`${inputClass} font-mono tabular-nums`}
            />
          </label>
          <Button type="submit" disabled={busy !== null} className="h-10">
            {busy === "save" && <Spinner />}
            Save
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy !== null}
            onClick={remove}
            className="h-10"
          >
            {busy === "remove" && <Spinner />}
            Remove…
          </Button>
        </form>
        {error && (
          <p
            id={`${id}-error`}
            aria-live="polite"
            className="text-sm text-red-300"
          >
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function AddBudget({
  categories,
  onSaved,
}: {
  categories: string[]
  onSaved: (message: string) => void
}) {
  const id = useId()
  const [category, setCategory] = useState(categories[0])
  const [amount, setAmount] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const chosen = categories.includes(category) ? category : categories[0]

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const value = parseAmount(amount)
    if (value === null) {
      setError("Enter an amount, like 500")
      document.getElementById(`${id}-amount`)?.focus()
      return
    }
    setBusy(true)
    setError(null)
    try {
      onSaved(await saveBudget(chosen, value))
      setAmount("")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t save")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label
          htmlFor={`${id}-category`}
          className="min-w-40 flex-1 space-y-1 text-xs text-zinc-400"
        >
          <span>Category</span>
          <select
            id={`${id}-category`}
            name="category"
            value={chosen}
            onChange={(e) => setCategory(e.target.value)}
            className={`${inputClass} bg-zinc-800 text-zinc-100`}
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label
          htmlFor={`${id}-amount`}
          className="min-w-32 flex-1 space-y-1 text-xs text-zinc-400"
        >
          <span>Monthly limit (SGD)</span>
          <input
            id={`${id}-amount`}
            name="amount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="500…"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            className={`${inputClass} font-mono tabular-nums`}
          />
        </label>
        <Button type="submit" disabled={busy} className="h-10">
          {busy && <Spinner />}
          Add
        </Button>
      </div>
      {error && (
        <p
          id={`${id}-error`}
          aria-live="polite"
          className="text-sm text-red-300"
        >
          {error}
        </p>
      )}
    </form>
  )
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="size-3 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin"
    />
  )
}
