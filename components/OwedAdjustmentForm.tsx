"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { CategorySelect, inputClass } from "@/components/OwedEditor"

function getToday(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

interface OwedAdjustmentFormProps {
  kind: "covered" | "forgiven"
  person: string
  defaultAmount?: number
  defaultCategory?: string
  onSaved: () => void
  onCancel: () => void
}

/**
 * Lowers what someone owes without a bank transfer, and counts it as the
 * owner's spending:
 * - covered: they paid for something of yours
 * - forgiven: you let the amount go
 */
export function OwedAdjustmentForm({
  kind,
  person,
  defaultAmount,
  defaultCategory = "Paid by Others",
  onSaved,
  onCancel,
}: OwedAdjustmentFormProps) {
  const [amount, setAmount] = useState(
    defaultAmount ? String(defaultAmount) : ""
  )
  const [note, setNote] = useState("")
  const [category, setCategory] = useState(defaultCategory)
  const [date, setDate] = useState(getToday)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/owed/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          person,
          amount: Number(amount.trim()),
          note: note.trim(),
          category,
          date,
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setError(typeof json.error === "string" ? json.error : "Couldn’t save")
        return
      }
      onSaved()
    } catch {
      setError("Couldn’t save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-md border border-zinc-800 bg-zinc-950/60 p-3"
    >
      <p className="text-sm text-zinc-300">
        {kind === "covered"
          ? `What did ${person} pay for you? It lowers what ${person} owes and counts as your spending.`
          : `How much are you letting ${person} off? It lowers what ${person} owes and counts as your spending.`}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="space-y-1 text-xs text-zinc-400">
          <span>{kind === "covered" ? "What" : "Note (optional)"}</span>
          <input
            name="note"
            autoComplete="off"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={kind === "covered" ? "Groceries…" : "Skipped Oct…"}
            className={inputClass}
          />
        </label>
        <label className="space-y-1 text-xs text-zinc-400">
          <span>Amount</span>
          <input
            name="amount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="200…"
            className={`${inputClass} font-mono tabular-nums`}
          />
        </label>
        <label className="space-y-1 text-xs text-zinc-400">
          <span>Category</span>
          <CategorySelect value={category} onChange={setCategory} />
        </label>
        <label className="space-y-1 text-xs text-zinc-400">
          <span>Date</span>
          <input
            name="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-700/40 bg-red-900/30 px-3 py-2 text-sm text-red-300"
        >
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-zinc-700"
          disabled={saving}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          className="bg-blue-600 text-white hover:bg-blue-500"
          disabled={saving}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  )
}
