'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CATEGORY_COLORS, formatSGD } from '@/lib/display'
import { ChevronLeft } from 'lucide-react'

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

interface MonthlySpend {
  month: string
  label: string
  amount: number
}

interface CategoryData {
  category: string
  monthlySpend: MonthlySpend[]
  topMerchants: Merchant[]
  count: number
  average: number
  currentMonthSpend: number
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
              {/* Monthly bar chart with avg reference line + callout */}
              {(() => {
                const months = data.monthlySpend ?? []
                const monthsWithSpend = months.filter(m => m.amount > 0)
                const avg = monthsWithSpend.length > 0
                  ? monthsWithSpend.reduce((s, m) => s + m.amount, 0) / monthsWithSpend.length
                  : 0
                const currentSpend = data.currentMonthSpend ?? 0
                const diff = currentSpend - avg
                const hasCurrentMonth = currentSpend > 0
                return (
                  <Card className="bg-zinc-900 border-zinc-800">
                    <CardHeader className="pb-1 pt-4 px-4">
                      <div className="flex items-baseline justify-between">
                        <CardTitle className="text-xs text-zinc-500 font-normal">Monthly spend</CardTitle>
                        {avg > 0 && (
                          <span className="text-xs text-zinc-500 font-mono">avg {formatSGD(avg)}/mo</span>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      {months.every(m => m.amount === 0) ? (
                        <p className="text-center text-zinc-500 text-sm py-6">No data in the last 6 months</p>
                      ) : (
                        <div className="h-36 w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={months.map(m => ({ label: m.label, value: m.amount }))}
                              margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
                            >
                              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#a1a1aa' }} tickLine={false} axisLine={false} />
                              <YAxis tick={{ fontSize: 10, fill: '#a1a1aa' }} tickLine={false} axisLine={false} width={44} tickFormatter={v => `$${v}`} />
                              <Tooltip
                                contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 6 }}
                                labelStyle={{ color: '#a1a1aa', fontSize: 11 }}
                                itemStyle={{ color: '#e4e4e7', fontSize: 11 }}
                                formatter={(v: number | undefined) => v !== undefined ? [formatSGD(v), ''] : ['', '']}
                              />
                              {avg > 0 && (
                                <ReferenceLine
                                  y={avg}
                                  stroke={color}
                                  strokeOpacity={0.5}
                                  strokeDasharray="4 3"
                                  strokeWidth={1.5}
                                />
                              )}
                              <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                      {/* Callout: this month vs avg */}
                      {avg > 0 && hasCurrentMonth && (
                        <p className={`text-xs mt-2 font-mono ${
                          diff > 0 ? 'text-red-400' : 'text-green-400'
                        }`}>
                          {diff > 0 ? '↑' : '↓'} This month: {formatSGD(currentSpend)}
                          {' · '}
                          {formatSGD(Math.abs(diff))} {diff > 0 ? 'above' : 'below'} avg
                        </p>
                      )}
                      {avg > 0 && !hasCurrentMonth && (
                        <p className="text-xs mt-2 text-zinc-600">No spend recorded this month yet</p>
                      )}
                      <p className="text-xs text-zinc-600 mt-1">{data.count} transactions total</p>
                    </CardContent>
                  </Card>
                )
              })()}

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
