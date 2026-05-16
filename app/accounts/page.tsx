'use client'

import { useEffect, useState, useRef } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatSGD, relativeDate } from '@/lib/display'
import { BANKS } from '@/lib/schema'

interface BankBalance {
  bank: string
  balance: number
  recorded_at: string
}

interface BalancesData {
  balances: BankBalance[]
  total: number
}

interface TrendPoint {
  month: string
  total: number | null
}

const BANK_LABELS: Record<string, string> = {
  ocbc: 'OCBC',
  dbs: 'DBS/POSB',
  uob: 'UOB',
  trust: 'Trust Bank',
}

export default function AccountsPage() {
  const [data, setData] = useState<BalancesData | null>(null)
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [editingBank, setEditingBank] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function fetchData() {
    Promise.all([
      fetch('/api/balances').then(r => r.json()),
      fetch('/api/balances/history').then(r => r.json()),
    ])
      .then(([balData, trendData]) => {
        setData(balData)
        setTrend(trendData.trend ?? [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    if (editingBank && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingBank])

  function startEdit(bank: string, currentBalance: number | null) {
    setEditingBank(bank)
    setEditValue(currentBalance !== null ? currentBalance.toFixed(2) : '')
  }

  function cancelEdit() {
    setEditingBank(null)
    setEditValue('')
  }

  async function saveBalance(bank: string) {
    const balance = parseFloat(editValue)
    if (isNaN(balance)) return

    setSaving(true)
    try {
      const res = await fetch('/api/balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bank, balance }),
      })
      if (res.ok) {
        setEditingBank(null)
        setEditValue('')
        setLoading(true)
        fetchData()
      }
    } finally {
      setSaving(false)
    }
  }

  const balanceMap = new Map(
    (data?.balances ?? []).map(b => [b.bank, b])
  )

  const bankCount = data?.balances.length ?? 0
  const hasBalances = bankCount > 0

  const trendFiltered = trend.filter(p => p.total !== null)

  return (
    <div className="space-y-5 p-4 max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold">Accounts</h1>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-xl bg-zinc-900 border border-zinc-800 animate-pulse" style={{ height: i === 1 ? '80px' : '64px' }} />
          ))}
        </div>
      )}

      {!loading && (
        <>
          {/* Net worth header */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-400 font-normal">Net worth</CardTitle>
            </CardHeader>
            <CardContent>
              {hasBalances ? (
                <>
                  <p className="text-4xl font-mono font-semibold text-white">
                    {formatSGD(data!.total)}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">
                    across {bankCount} {bankCount === 1 ? 'bank' : 'banks'}
                  </p>
                </>
              ) : (
                <p className="text-sm text-zinc-500">No balances set yet. Add your first balance below.</p>
              )}
            </CardContent>
          </Card>

          {/* Per-bank list */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-400 font-normal">Bank accounts</CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-zinc-800">
              {BANKS.map(bank => {
                const entry = balanceMap.get(bank)
                const isEditing = editingBank === bank

                if (isEditing) {
                  return (
                    <div key={bank} className="py-3 space-y-2">
                      <p className="text-sm font-medium text-zinc-200">{BANK_LABELS[bank]}</p>
                      <div className="flex gap-2 items-center">
                        <span className="text-sm text-zinc-400">$</span>
                        <input
                          ref={inputRef}
                          type="text"
                          inputMode="decimal"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveBalance(bank)
                            if (e.key === 'Escape') cancelEdit()
                          }}
                          className="flex-1 bg-zinc-800 border border-zinc-600 rounded-md px-3 py-1.5 text-sm text-zinc-100 font-mono focus:outline-none focus:border-blue-500 transition-colors"
                          disabled={saving}
                        />
                        <button
                          onClick={() => saveBalance(bank)}
                          disabled={saving}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded-md transition-colors cursor-pointer"
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-sm rounded-md transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )
                }

                return (
                  <div key={bank} className="flex items-center justify-between py-3 group">
                    <div>
                      <p className="text-sm font-medium text-zinc-200">{BANK_LABELS[bank]}</p>
                      {entry ? (
                        <p className="text-xs text-zinc-500 mt-0.5">
                          Updated {relativeDate(entry.recorded_at)}
                        </p>
                      ) : (
                        <p className="text-xs text-zinc-600 mt-0.5">No balance set</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {entry ? (
                        <span className="font-mono text-sm text-white">
                          {formatSGD(entry.balance)}
                        </span>
                      ) : null}
                      <button
                        onClick={() => startEdit(bank, entry?.balance ?? null)}
                        className="text-xs text-zinc-500 hover:text-blue-400 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                      >
                        {entry ? 'Edit' : 'Set balance'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          {/* Net worth trend chart */}
          {trendFiltered.length > 1 && (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-zinc-400 font-normal">Net worth trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={trendFiltered} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="netWorthGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22c55e" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="month"
                      tick={{ fill: '#71717a', fontSize: 11 }}
                      tickFormatter={m => {
                        const [y, mo] = m.split('-')
                        const d = new Date(parseInt(y), parseInt(mo) - 1, 1)
                        return d.toLocaleString('en-SG', { month: 'short' })
                      }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: '#71717a', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={v => `$${Math.round(v / 1000)}k`}
                      width={48}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#18181b',
                        border: '1px solid #27272a',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={(value: any) => [typeof value === 'number' ? formatSGD(value) : '', 'Net worth'] as [string, string]}
                      labelFormatter={m => {
                        const [y, mo] = m.split('-')
                        const d = new Date(parseInt(y), parseInt(mo) - 1, 1)
                        return d.toLocaleString('en-SG', { month: 'long', year: 'numeric' })
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="total"
                      stroke="#22c55e"
                      strokeWidth={2}
                      fill="url(#netWorthGradient)"
                      dot={{ fill: '#22c55e', r: 3, strokeWidth: 0 }}
                      activeDot={{ fill: '#22c55e', r: 5, strokeWidth: 0 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
