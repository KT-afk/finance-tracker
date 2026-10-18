"use client"

import { useId, useState } from "react"
import { Button } from "@/components/ui/button"
import { describeTransaction } from "@/lib/describe-transaction"

export interface OwedInfo {
  kind: "share" | "repayment"
  person: string
  amount: number
}

interface OwedEditorProps {
  transaction: {
    id: string
    date: string
    description: string
    amount: number
    owed: OwedInfo | null
  }
  knownPeople: string[]
  onSaved: () => void
  onCancel: () => void
}

const inputClass =
  "h-10 w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 text-base sm:text-sm text-zinc-100 placeholder-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"

/**
 * Outgoing payment: say how much of it someone owes you ("split").
 * Incoming transfer: say who it's from, so it pays down what they owe.
 */
export function OwedEditor({
  transaction,
  knownPeople,
  onSaved,
  onCancel,
}: OwedEditorProps) {
  const id = useId()
  const isShare = transaction.amount < 0
  const existing = transaction.owed
  const [person, setPerson] = useState(existing?.person ?? knownPeople[0] ?? "")
  const [amount, setAmount] = useState(
    existing
      ? String(existing.amount)
      : isShare
        ? ""
        : String(transaction.amount)
  )
  const [repeat, setRepeat] = useState(false)
  const [keyword, setKeyword] = useState(() =>
    describeTransaction(transaction.description).title.toLowerCase()
  )
  const [startsOn, setStartsOn] = useState(transaction.date)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function readError(res: Response, fallback: string) {
    const json = await res.json().catch(() => ({}))
    return typeof json.error === "string" ? json.error : fallback
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const trimmedPerson = person.trim()
      const res = await fetch(`/api/transactions/${transaction.id}/owed`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: isShare ? "share" : "repayment",
          person: trimmedPerson,
          amount: Number(amount.trim()),
        }),
      })
      if (!res.ok) {
        setError(await readError(res, "Couldn’t save"))
        return
      }
      if (isShare && repeat) {
        const ruleRes = await fetch("/api/owed/rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            keyword: keyword.trim(),
            person: trimmedPerson,
            amount: Number(amount.trim()),
            startsOn,
          }),
        })
        if (!ruleRes.ok) {
          setError(
            `Split saved, but the repeat rule wasn’t: ${await readError(ruleRes, "unknown error")}`
          )
          return
        }
      }
      onSaved()
    } catch {
      setError("Couldn’t save")
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove() {
    setRemoving(true)
    setError(null)
    try {
      const res = await fetch(`/api/transactions/${transaction.id}/owed`, {
        method: "DELETE",
      })
      if (!res.ok) {
        setError(await readError(res, "Couldn’t remove"))
        return
      }
      onSaved()
    } catch {
      setError("Couldn’t remove")
    } finally {
      setRemoving(false)
    }
  }

  const busy = saving || removing

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-md border border-zinc-800 bg-zinc-950/60 p-3"
    >
      <p className="text-sm text-zinc-300">
        {isShare
          ? "How much of this payment does someone owe you? Only your part counts as spending."
          : "Who is this paying you back? It lowers what they owe and doesn’t count as income."}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="space-y-1 text-xs text-zinc-400">
          <span>Who</span>
          <input
            name="person"
            autoComplete="off"
            list={`${id}-people`}
            value={person}
            onChange={(e) => setPerson(e.target.value)}
            placeholder="Partner…"
            className={inputClass}
          />
          <datalist id={`${id}-people`}>
            {knownPeople.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>
        <label className="space-y-1 text-xs text-zinc-400">
          <span>{isShare ? "Amount they owe" : "Amount repaid"}</span>
          <input
            name="amount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="1000…"
            className={`${inputClass} font-mono tabular-nums`}
          />
        </label>
      </div>

      {isShare && (
        <div className="space-y-2">
          <label className="flex min-h-6 cursor-pointer items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={repeat}
              onChange={(e) => setRepeat(e.target.checked)}
              className="size-4 accent-blue-600"
            />
            Split every payment like this the same way
          </label>
          {repeat && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="space-y-1 text-xs text-zinc-400">
                <span>Bank text contains</span>
                <input
                  name="keyword"
                  autoComplete="off"
                  spellCheck={false}
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="space-y-1 text-xs text-zinc-400">
                <span>From</span>
                <input
                  name="startsOn"
                  type="date"
                  value={startsOn}
                  onChange={(e) => setStartsOn(e.target.value)}
                  className={inputClass}
                />
              </label>
              <p className="sm:col-span-2 text-xs text-zinc-500">
                Payments already imported from this date are split too.
              </p>
            </div>
          )}
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-700/40 bg-red-900/30 px-3 py-2 text-sm text-red-300"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        {existing && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mr-auto border-zinc-700 text-red-300 hover:text-red-200"
            disabled={busy}
            onClick={handleRemove}
          >
            {removing
              ? "Removing…"
              : isShare
                ? "Remove split"
                : "Not a repayment"}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-zinc-700"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          className="bg-blue-600 text-white hover:bg-blue-500"
          disabled={busy}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  )
}
