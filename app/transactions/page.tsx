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

interface Transaction {
  id: string
  date: string
  description: string
  amount: number
  bank: string
  category: string
  is_corrected: boolean
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

export default function TransactionsPage() {
  const [month, setMonth] = useState<string>('all')
  const [category, setCategory] = useState<string>('all')
  const [bank, setBank] = useState<string>('all')
  const [page, setPage] = useState(1)

  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

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

  return (
    <div className="space-y-4 p-4 max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold">Transactions</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select value={month} onValueChange={setMonth}>
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

        <Select value={category} onValueChange={setCategory}>
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

        <Select value={bank} onValueChange={setBank}>
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
                  <CardContent className="py-2.5 px-3 flex items-center gap-3">
                    {/* Date */}
                    <span className="text-xs text-zinc-500 w-20 shrink-0 font-mono">{t.date}</span>

                    {/* Description */}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-zinc-100 truncate">{t.description}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
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
                      </div>
                    </div>

                    {/* Amount */}
                    <span
                      className={`font-mono text-sm font-medium whitespace-nowrap ${t.amount < 0 ? 'text-white' : 'text-green-400'}`}
                    >
                      {t.amount < 0 ? '-' : '+'}{formatSGD(Math.abs(t.amount))}
                    </span>

                    {/* Category selector */}
                    <Select
                      value={t.category}
                      onValueChange={val => handleCategoryChange(t.id, val)}
                      disabled={updatingId === t.id}
                    >
                      <SelectTrigger
                        className="w-36 h-7 text-xs border-zinc-700 bg-zinc-800"
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
