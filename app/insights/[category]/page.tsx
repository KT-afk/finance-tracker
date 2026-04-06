'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CATEGORY_COLORS, formatSGD } from '@/lib/display'
import { ChevronLeft } from 'lucide-react'

interface TrendPoint {
  month: string
  total: number
}

interface Merchant {
  description: string
  total: number
}

interface Transaction {
  id: string
  date: string
  description: string
  amount: number
  bank: string
  category: string
}

interface CategoryData {
  category: string
  trend: TrendPoint[]
  topMerchants: Merchant[]
  count: number
  average: number
  recentTransactions: Transaction[]
}

export default function CategoryDetailPage() {
  const params = useParams()
  const category = typeof params.category === 'string' ? decodeURIComponent(params.category) : ''
  const color = CATEGORY_COLORS[category] ?? '#94A3B8'

  const [data, setData] = useState<CategoryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!category) return
    setLoading(true)
    fetch(`/api/insights/${encodeURIComponent(category)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else setData(d)
      })
      .catch(() => setError('Failed to load category data'))
      .finally(() => setLoading(false))
  }, [category])

  return (
    <div className="space-y-5 p-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/insights"
          className="flex items-center gap-1 text-zinc-400 hover:text-zinc-200 transition-colors duration-200 text-sm cursor-pointer"
        >
          <ChevronLeft className="h-4 w-4" />
          Insights
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <span
          className="h-3 w-3 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        <h1 className="text-xl font-semibold text-white">{category}</h1>
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-center py-16 text-zinc-500 text-sm">Loading…</div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded bg-red-900/30 border border-red-700/30 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {data && !loading && (
        <>
          {/* Empty state */}
          {data.count === 0 ? (
            <div className="text-center py-20 text-zinc-500 text-sm">
              No transactions in this category yet.
            </div>
          ) : (
            <>
              {/* Stat cards */}
              <div className="grid grid-cols-2 gap-3">
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-xs text-zinc-500 font-normal">Transactions</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <p className="text-2xl font-mono font-semibold text-white">{data.count}</p>
                  </CardContent>
                </Card>
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-xs text-zinc-500 font-normal">Avg spend</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <p className="text-2xl font-mono font-semibold text-white">{formatSGD(data.average)}</p>
                  </CardContent>
                </Card>
              </div>

              {/* 6-month trend line chart */}
              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-zinc-400 font-normal">6-month trend</CardTitle>
                </CardHeader>
                <CardContent>
                  {data.trend.every(p => p.total === 0) ? (
                    <p className="text-center text-zinc-500 text-sm py-8">No data in the last 6 months</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={data.trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id={`areaGradient-${encodeURIComponent(category)}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                            <stop offset="100%" stopColor={color} stopOpacity={0} />
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
                          tickFormatter={v => `$${Math.round(v)}`}
                          width={48}
                          domain={[0, 'auto']}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#18181b',
                            border: '1px solid #27272a',
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          formatter={(value: any) => [typeof value === 'number' ? formatSGD(value) : '', category] as [string, string]}
                          labelFormatter={m => {
                            const [y, mo] = m.split('-')
                            const d = new Date(parseInt(y), parseInt(mo) - 1, 1)
                            return d.toLocaleString('en-SG', { month: 'long', year: 'numeric' })
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="total"
                          stroke={color}
                          strokeWidth={2}
                          fill={`url(#areaGradient-${encodeURIComponent(category)})`}
                          dot={{ fill: color, r: 3, strokeWidth: 0 }}
                          activeDot={{ fill: color, r: 5, strokeWidth: 0 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Top merchants */}
              {data.topMerchants.length > 0 && (
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-zinc-400 font-normal">Top merchants</CardTitle>
                  </CardHeader>
                  <CardContent className="divide-y divide-zinc-800">
                    {data.topMerchants.map((m, i) => (
                      <div key={i} className="flex items-center gap-3 py-2.5">
                        <span className="text-zinc-600 text-xs w-4 shrink-0">{i + 1}</span>
                        <span className="text-sm text-zinc-200 flex-1 truncate min-w-0">
                          {m.description}
                        </span>
                        <span className="font-mono text-sm text-white whitespace-nowrap">
                          {formatSGD(m.total)}
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Recent transactions */}
              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-zinc-400 font-normal">
                    Recent transactions
                    <span className="ml-2 text-zinc-600 text-xs font-normal">
                      ({data.recentTransactions.length})
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="divide-y divide-zinc-800">
                  {data.recentTransactions.map(t => (
                    <div key={t.id} className="flex items-center gap-3 py-2.5">
                      <span className="text-[10px] text-zinc-500 w-16 shrink-0 font-mono">
                        {t.date.slice(5)}
                      </span>
                      <span className="text-sm text-zinc-200 flex-1 truncate min-w-0">
                        {t.description}
                      </span>
                      <span className="font-mono text-sm text-white whitespace-nowrap">
                        {formatSGD(Math.abs(t.amount))}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  )
}
