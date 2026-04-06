'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CATEGORY_COLORS, formatSGD, BANK_TABS } from '@/lib/display'
import CategoriesView from '@/components/CategoriesView'

interface MomRow {
  category: string
  current: number
  previous: number
  delta: number
  deltaPct: number | null
}

interface BigTransaction {
  id: string
  date: string
  description: string
  amount: number
  bank: string
  category: string
}

interface InsightsData {
  momComparison: MomRow[]
  trendData: Record<string, string | number>[]
  monthLabels: string[]
  biggestTransactions: BigTransaction[]
  currentMonth: string
}

type ActiveView = 'overview' | 'categories'

export default function InsightsPage() {
  const router = useRouter()
  const [activeView, setActiveView] = useState<ActiveView>('overview')
  const [selectedBank, setSelectedBank] = useState('all')
  const [data, setData] = useState<InsightsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Derive trend categories dynamically from API data, sorted ascending by total
  const trendCategories = useMemo(() => {
    if (!data?.trendData) return []
    const totals: Record<string, number> = {}
    for (const row of data.trendData) {
      for (const [key, value] of Object.entries(row)) {
        if (key === 'month') continue
        totals[key] = (totals[key] ?? 0) + (typeof value === 'number' ? value : 0)
      }
    }
    return Object.entries(totals)
      .sort(([, a], [, b]) => b - a) // descending by total (bottom of stack = highest)
  }, [data?.trendData])

  useEffect(() => {
    setLoading(true)
    const params = selectedBank !== 'all' ? `?bank=${selectedBank}` : ''
    fetch(`/api/insights${params}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else setData(d)
      })
      .catch(() => setError('Failed to load insights'))
      .finally(() => setLoading(false))
  }, [selectedBank])

  return (
    <div className="space-y-5 p-4 max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold">Insights</h1>

      {/* View toggle */}
      <div className="flex rounded-lg bg-zinc-900 border border-zinc-800 p-0.5 w-fit">
        {(['overview', 'categories'] as ActiveView[]).map(v => (
          <button
            key={v}
            onClick={() => setActiveView(v)}
            className={`px-4 py-1.5 rounded-md text-sm transition-colors cursor-pointer capitalize ${
              activeView === v
                ? 'bg-zinc-700 text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      {/* Categories view */}
      {activeView === 'categories' && <CategoriesView />}

      {/* Overview view */}
      {activeView === 'overview' && (
        <>
          {/* Bank filter */}
          <Tabs value={selectedBank} onValueChange={setSelectedBank}>
            <TabsList className="bg-zinc-900 border border-zinc-800 w-full">
              {BANK_TABS.map(b => (
                <TabsTrigger
                  key={b}
                  value={b}
                  className="flex-1 text-xs uppercase tracking-wide data-[state=active]:bg-zinc-700"
                >
                  {b === 'all' ? 'All' : b.toUpperCase()}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

      {loading && (
        <div className="space-y-5">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-xl bg-zinc-900 border border-zinc-800 animate-pulse" style={{ height: i === 1 ? '220px' : i === 2 ? '160px' : '120px' }} />
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
          {/* 6-month trend chart */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-400 font-normal">6-month spend trend</CardTitle>
            </CardHeader>
            <CardContent>
              {trendCategories.length === 0 ? (
                <p className="text-center text-zinc-500 text-sm py-8">Not enough data yet</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.trendData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <XAxis
                      dataKey="month"
                      tick={{ fill: '#71717a', fontSize: 11 }}
                      tickFormatter={m => {
                        const [y, mo] = m.split('-')
                        const date = new Date(parseInt(y), parseInt(mo) - 1, 1)
                        return date.toLocaleString('en-SG', { month: 'short' })
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
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#18181b',
                        border: '1px solid #27272a',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      labelStyle={{ color: '#a1a1aa' }}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={(value: any, name: any) => [
                        typeof value === 'number' ? formatSGD(value) : '',
                        name ?? '',
                      ] as [string, string]}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 11, color: '#a1a1aa' }}
                      iconType="circle"
                      iconSize={8}
                    />
                    {trendCategories.map(([cat], i) => (
                      <Bar
                        key={cat}
                        dataKey={cat}
                        stackId="a"
                        fill={CATEGORY_COLORS[cat] ?? '#94A3B8'}
                        radius={i === trendCategories.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                        cursor="pointer"
                        onClick={() => router.push(`/insights/${encodeURIComponent(cat)}`)}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Month-over-month comparison */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-400 font-normal">Month-over-month</CardTitle>
            </CardHeader>
            <CardContent>
              {data.momComparison.length === 0 ? (
                <p className="text-center text-zinc-500 text-sm py-6">No data for current month</p>
              ) : (
                <div className="space-y-0 divide-y divide-zinc-800">
                  <div className="grid grid-cols-4 pb-2 text-xs text-zinc-500">
                    <span>Category</span>
                    <span className="text-right">This month</span>
                    <span className="text-right">Last month</span>
                    <span className="text-right">Change</span>
                  </div>
                  {data.momComparison.map(row => {
                    const color = CATEGORY_COLORS[row.category] ?? '#94A3B8'
                    const isUp = row.delta > 0
                    return (
                      <Link
                        key={row.category}
                        href={`/insights/${encodeURIComponent(row.category)}`}
                        className="grid grid-cols-4 py-2.5 text-sm items-center cursor-pointer hover:bg-zinc-800/50 transition-colors duration-200 rounded -mx-1 px-1"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: color }}
                          />
                          <span className="text-zinc-200 text-xs truncate">{row.category}</span>
                        </div>
                        <span className="text-right font-mono text-xs text-zinc-100">
                          {formatSGD(row.current)}
                        </span>
                        <span className="text-right font-mono text-xs text-zinc-500">
                          {formatSGD(row.previous)}
                        </span>
                        <div className="flex items-center justify-end gap-1">
                          <span
                            className={`font-mono text-xs ${isUp ? 'text-red-400' : row.delta < 0 ? 'text-green-400' : 'text-zinc-500'}`}
                          >
                            {row.delta > 0 ? '+' : ''}{formatSGD(row.delta)}
                          </span>
                          {row.deltaPct !== null && (
                            <span className={`text-[10px] ${isUp ? 'text-red-500' : 'text-green-500'}`}>
                              ({row.deltaPct > 0 ? '+' : ''}{Math.round(row.deltaPct)}%)
                            </span>
                          )}
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Biggest transactions */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-400 font-normal">
                Biggest transactions this month
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-zinc-800">
              {data.biggestTransactions.length === 0 ? (
                <p className="text-center text-zinc-500 text-sm py-6">No transactions yet</p>
              ) : (
                data.biggestTransactions.map((t, i) => {
                  const color = CATEGORY_COLORS[t.category] ?? '#94A3B8'
                  return (
                    <div key={t.id} className="flex items-center gap-3 py-2.5">
                      <span className="text-zinc-600 text-xs w-4 shrink-0">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-zinc-100 truncate">{t.description}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge
                            className="text-[10px] px-1 py-0 font-normal border-0 h-4"
                            style={{ backgroundColor: `${color}25`, color }}
                          >
                            {t.category}
                          </Badge>
                          <span className="text-[10px] text-zinc-500">{new Date(t.date + 'T00:00:00').toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}</span>
                        </div>
                      </div>
                      <span className="font-mono text-sm text-white whitespace-nowrap">
                        {formatSGD(Math.abs(t.amount))}
                      </span>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
        </>
      )}
        </>
      )}
    </div>
  )
}
