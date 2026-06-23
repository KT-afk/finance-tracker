'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { CATEGORY_COLORS, formatSGD } from '@/lib/display'
import { CATEGORIES, BANKS } from '@/lib/schema'
import Link from 'next/link'

interface Transaction {
  id: string
  date: string
  description: string
  amount: number
  bank: string
  category: string
  is_corrected: boolean
  is_manual?: boolean
}

interface ApiResponse {
  transactions: Transaction[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

function getAvailableMonths(): string[] {
  const months: string[] = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    months.push(`${y}-${m}`)
  }
  return months
}

function getToday(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export default function TransactionsPage() {
  const [month, setMonth] = useState<string>('all')
  const [category, setCategory] = useState<string>('all')
  const [bank, setBank] = useState<string>('all')
  const [page, setPage] = useState(1)

  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [recategorizing, setRecategorizing] = useState(false)
  const [recategorizeResult, setRecategorizeResult] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [manualDate, setManualDate] = useState(getToday)
  const [manualType, setManualType] = useState<'expense' | 'income'>('expense')
  const [manualAmount, setManualAmount] = useState('')
  const [manualDescription, setManualDescription] = useState('')
  const [manualBank, setManualBank] = useState<string>(BANKS[0])
  const [manualCategory, setManualCategory] = useState<string>('Others')
  const [addingManual, setAddingManual] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [manualError, setManualError] = useState<string | null>(null)

  const months = getAvailableMonths()

  const fetchTransactions = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (month !== 'all') params.set('month', month)
    if (category !== 'all') params.set('category', category)
    if (bank !== 'all') params.set('bank', bank)
    params.set('page', String(page))
    params.set('pageSize', '50')

    try {
      const res = await fetch(`/api/transactions?${params}`)
      const json = await res.json()
      if (json.error) setError(json.error)
      else setData(json)
    } catch {
      setError('Failed to load transactions')
    } finally {
      setLoading(false)
    }
  }, [month, category, bank, page])

  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [month, category, bank])

  async function handleCategoryChange(id: string, newCategory: string) {
    setUpdatingId(id)
    try {
      const res = await fetch(`/api/transactions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: newCategory }),
      })
      if (res.ok) {
        // Optimistic update
        setData(prev => {
          if (!prev) return prev
          return {
            ...prev,
            transactions: prev.transactions.map(t =>
              t.id === id ? { ...t, category: newCategory, is_corrected: true } : t
            ),
          }
        })
      }
    } finally {
      setUpdatingId(null)
    }
  }

  async function handleManualSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAddingManual(true)
    setManualError(null)

    const parsedAmount = Number(manualAmount)
    const signedAmount = manualType === 'expense'
      ? -Math.abs(parsedAmount)
      : Math.abs(parsedAmount)

    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: manualDate,
          description: manualDescription,
          amount: signedAmount,
          bank: manualBank,
          category: manualCategory,
        }),
      })
      const json = await res.json()

      if (!res.ok) {
        setManualError(json.error ?? 'Failed to add transaction')
        return
      }

      setManualAmount('')
      setManualDescription('')
      setManualCategory('Others')
      setManualType('expense')
      setShowAddForm(false)
      setPage(1)
      fetchTransactions()
    } catch {
      setManualError('Failed to add transaction')
    } finally {
      setAddingManual(false)
    }
  }

  async function handleDeleteManual(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setError(typeof json.error === 'string' ? json.error : 'Failed to delete transaction')
        return
      }
      fetchTransactions()
    } catch {
      setError('Failed to delete transaction')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-4 p-4 max-w-3xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Transactions</h1>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            onClick={() => setShowAddForm(v => !v)}
            className="rounded-md bg-blue-600 hover:bg-blue-500 px-3 py-1.5 text-sm font-medium text-white transition-colors"
          >
            Add
          </button>
          <button
            onClick={async () => {
              setRecategorizing(true)
              setRecategorizeResult(null)
              try {
                const res = await fetch('/api/transactions/recategorize', { method: 'POST' })
                if (!res.ok) {
                  let message = 'Failed to recategorize'
                  try {
                    const data = await res.json()
                    if (typeof data?.error === 'string' && data.error) {
                      message = data.error
                    }
                  } catch {
                    // Ignore invalid error responses and keep the fallback message.
                  }
                  throw new Error(message)
                }

                const reader = res.body?.getReader()
                if (!reader) throw new Error('No stream')
                const decoder = new TextDecoder()
                let buffer = ''
                let lastResult = ''
                let streamError = ''
                let sawDone = false

                while (true) {
                  const { done, value } = await reader.read()
                  if (done) break
                  buffer += decoder.decode(value, { stream: true })
                  const lines = buffer.split('\n')
                  buffer = lines.pop() ?? ''
                  for (const line of lines) {
                    if (!line.trim()) continue
                    const data = JSON.parse(line)
                    if (data.error) {
                      streamError = data.error
                    } else if (data.done) {
                      sawDone = true
                      lastResult = data.message
                    } else {
                      setRecategorizeResult(`Processing ${data.progress} of ${data.total}... (${data.updated} updated)`)
                    }
                  }
                }

                if (buffer.trim()) {
                  const data = JSON.parse(buffer)
                  if (data.error) {
                    streamError = data.error
                  } else if (data.done) {
                    sawDone = true
                    lastResult = data.message
                  }
                }

                if (streamError) {
                  throw new Error(streamError)
                }

                if (!sawDone) {
                  throw new Error('Recategorization ended before completion')
                }

                setRecategorizeResult(lastResult || 'Done')
                fetchTransactions()
              } catch (error) {
                setRecategorizeResult(error instanceof Error ? error.message : 'Failed to recategorize')
              } finally {
                setRecategorizing(false)
              }
            }}
            disabled={recategorizing}
            className="rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition-colors disabled:opacity-50"
          >
            {recategorizing ? 'Recategorizing…' : 'Recategorize'}
          </button>
          <Link
            href="/upload"
            className="rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-300 transition-colors"
          >
            Upload
          </Link>
        </div>
      </div>

      {showAddForm && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-3">
            <form onSubmit={handleManualSubmit} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="date"
                  value={manualDate}
                  onChange={e => setManualDate(e.target.value)}
                  className="h-10 rounded-md border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100"
                  required
                />
                <Select value={manualType} onValueChange={value => setManualType(value as 'expense' | 'income')}>
                  <SelectTrigger className="h-10 bg-zinc-800 border-zinc-700 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    <SelectItem value="expense">Expense</SelectItem>
                    <SelectItem value="income">Income</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="Amount"
                value={manualAmount}
                onChange={e => setManualAmount(e.target.value)}
                className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 placeholder-zinc-500"
                required
              />

              <input
                type="text"
                placeholder="Description"
                value={manualDescription}
                onChange={e => setManualDescription(e.target.value)}
                className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 placeholder-zinc-500"
                required
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Select value={manualBank} onValueChange={setManualBank}>
                  <SelectTrigger className="h-10 bg-zinc-800 border-zinc-700 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    {BANKS.map(b => (
                      <SelectItem key={b} value={b}>{b.toUpperCase()}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={manualCategory} onValueChange={setManualCategory}>
                  <SelectTrigger className="h-10 bg-zinc-800 border-zinc-700 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    {CATEGORIES.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {manualError && (
                <p className="rounded-md border border-red-700/40 bg-red-900/30 px-3 py-2 text-sm text-red-300">
                  {manualError}
                </p>
              )}

              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="border-zinc-700"
                  onClick={() => setShowAddForm(false)}
                  disabled={addingManual}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-blue-600 text-white hover:bg-blue-500"
                  disabled={addingManual}
                >
                  {addingManual ? 'Adding...' : 'Add transaction'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {recategorizeResult && (
        <div className="rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm text-zinc-300">
          {recategorizeResult}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select value={month} onValueChange={setMonth} disabled={recategorizing}>
          <SelectTrigger className="bg-zinc-900 border-zinc-700 w-36 text-sm">
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700">
            <SelectItem value="all">All months</SelectItem>
            {months.map(m => (
              <SelectItem key={m} value={m}>
                {new Date(m + '-01').toLocaleString('en-SG', { month: 'long', year: 'numeric' })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={category} onValueChange={setCategory} disabled={recategorizing}>
          <SelectTrigger className="bg-zinc-900 border-zinc-700 w-44 text-sm">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700">
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map(c => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={bank} onValueChange={setBank} disabled={recategorizing}>
          <SelectTrigger className="bg-zinc-900 border-zinc-700 w-32 text-sm">
            <SelectValue placeholder="Bank" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700">
            <SelectItem value="all">All banks</SelectItem>
            {BANKS.map(b => (
              <SelectItem key={b} value={b}>{b.toUpperCase()}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading && (
        <div className="space-y-1">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-lg bg-zinc-900 border border-zinc-800 h-14 animate-pulse" />
          ))}
        </div>
      )}
      {error && (
        <div className="rounded bg-red-900/30 border border-red-700/30 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {data && !loading && (
        <>
          <p className="text-xs text-zinc-500">{data.total} transactions</p>

          <div className="space-y-1">
            {data.transactions.length === 0 && (
              <p className="text-center py-10 text-zinc-500 text-sm">No transactions found</p>
            )}
            {data.transactions.map(t => {
              const color = CATEGORY_COLORS[t.category] ?? '#94A3B8'
              return (
                <Card key={t.id} className="bg-zinc-900 border-zinc-800">
                  <CardContent className="py-3 px-3 space-y-3 sm:space-y-0 sm:flex sm:items-center sm:gap-3">
                    <div className="flex items-start justify-between gap-3 sm:contents">
                      {/* Date */}
                      <span className="text-xs text-zinc-500 sm:w-20 sm:shrink-0 font-mono">{t.date}</span>

                      {/* Amount */}
                      <span
                        className={`font-mono text-sm font-medium whitespace-nowrap sm:order-3 ${t.amount < 0 ? 'text-white' : 'text-green-400'}`}
                      >
                        {t.amount < 0 ? '-' : '+'}{formatSGD(Math.abs(t.amount))}
                      </span>
                    </div>

                    {/* Description */}
                    <div className="min-w-0 flex-1 sm:order-2">
                      <p className="text-sm text-zinc-100 sm:truncate leading-snug">{t.description}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Badge
                          className="text-[10px] px-1 py-0 font-normal border-0 h-4"
                          style={{
                            backgroundColor: `${color}25`,
                            color,
                          }}
                        >
                          {t.bank.toUpperCase()}
                        </Badge>
                        {t.is_corrected && (
                          <span className="text-[10px] text-blue-500/70 font-medium">edited</span>
                        )}
                        {t.is_manual && (
                          <span className="text-[10px] text-zinc-500 font-medium">manual</span>
                        )}
                      </div>
                    </div>

                    {/* Category selector */}
                    <div
                      className={`grid gap-2 sm:order-4 ${
                        t.is_manual ? 'grid-cols-[minmax(0,1fr)_auto]' : 'grid-cols-1'
                      }`}
                    >
                      <Select
                        value={t.category}
                        onValueChange={val => handleCategoryChange(t.id, val)}
                        disabled={updatingId === t.id || recategorizing}
                      >
                        <SelectTrigger
                          className="w-full sm:w-36 h-9 sm:h-7 text-xs border-zinc-700 bg-zinc-800"
                          style={{ color }}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-800 border-zinc-700">
                          {CATEGORIES.map(c => (
                            <SelectItem key={c} value={c} className="text-xs">
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {t.is_manual && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 sm:h-7 border-zinc-700 px-3 text-xs text-red-300 hover:text-red-200"
                          disabled={deletingId === t.id}
                          onClick={() => handleDeleteManual(t.id)}
                        >
                          {deletingId === t.id ? '...' : 'Delete'}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                className="border-zinc-700 text-xs"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
              >
                Previous
              </Button>
              <span className="text-xs text-zinc-500">
                {page} / {data.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="border-zinc-700 text-xs"
                disabled={page >= data.totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
