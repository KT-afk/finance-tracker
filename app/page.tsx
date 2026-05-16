'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CATEGORY_COLORS, formatSGD, relativeDate, BANK_TABS } from '@/lib/display'
import Link from 'next/link'
import InsightCard from '@/components/InsightCard'

interface CategoryTotal {
  category: string
  amount: number
}

interface Transaction {
  id: string
  date: string
  description: string
  amount: number
  bank: string
  category: string
}

interface DashboardData {
  totalSpend: number
  daysElapsed: number
  month: string
  topCategories: CategoryTotal[]
  recentTransactions: Transaction[]
  momDelta: number | null
  momDeltaPct: number | null
  priorMonthLabel: string | null
}

interface BalanceData {
  balances: { bank: string; balance: number; recorded_at: string }[]
  total: number
}

export default function HomePage() {
  const [selectedBank, setSelectedBank] = useState<string>('all')
  const [data, setData] = useState<DashboardData | null>(null)
  const [balanceData, setBalanceData] = useState<BalanceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    const params = selectedBank !== 'all' ? `?bank=${selectedBank}` : ''
    Promise.all([
      fetch(`/api/dashboard${params}`).then(r => r.json()),
      fetch('/api/balances').then(r => r.json()),
    ])
      .then(([d, b]) => {
        if (d.error) setError(d.error)
        else setData(d)
        setBalanceData(b)
      })
      .catch(() => setError('Failed to load dashboard'))
      .finally(() => setLoading(false))
  }, [selectedBank])

  const isEmpty = !loading && data && data.recentTransactions.length === 0 && data.topCategories.length === 0

  const maxAmount = data?.topCategories?.[0]?.amount ?? 1

  return (
    <div className="space-y-5 p-4 max-w-2xl mx-auto">
      <h1 className="text-base font-semibold text-zinc-300 px-0">Overview</h1>
      {/* Bank filter tabs */}
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
            <div key={i} className="rounded-xl bg-zinc-900 border border-zinc-800 animate-pulse" style={{ height: i === 1 ? '80px' : i === 2 ? '140px' : '180px' }} />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-900/30 border border-red-700/30 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="py-14 text-center space-y-3">
            <p className="text-zinc-300 font-medium">No transactions yet</p>
            <p className="text-sm text-zinc-500">Upload a statement to get started</p>
            <Link
              href="/upload"
              className="inline-block mt-2 rounded-md bg-blue-600 hover:bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors"
            >
              Upload statement
            </Link>
          </CardContent>
        </Card>
      )}

      {data && !isEmpty && (
        <>
          {/* AI insight card */}
          <InsightCard hasTransactions={data.recentTransactions.length > 0 || data.topCategories.length > 0} />

          {/* Balance + Spend side-by-side */}
          <div className="grid grid-cols-2 gap-3">
            {/* Balance card */}
            <Link href="/accounts">
              <Card className="bg-zinc-900 border-zinc-800 hover:bg-zinc-800/50 transition-colors cursor-pointer h-full">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-zinc-400 font-normal">Total balance</CardTitle>
                </CardHeader>
                <CardContent>
                  {balanceData && balanceData.balances.length > 0 ? (
                    <>
                      <p className="text-2xl font-mono font-semibold text-white">
                        {formatSGD(balanceData.total)}
                      </p>
                      <p className="text-xs text-zinc-500 mt-1">
                        across {balanceData.balances.length} {balanceData.balances.length === 1 ? 'bank' : 'banks'} →
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-zinc-500 mt-1">No balances set</p>
                      <p className="text-xs text-blue-400 mt-1">Set up →</p>
                    </>
                  )}
                </CardContent>
              </Card>
            </Link>

            {/* Spend card */}
            <Card className="bg-zinc-900 border-zinc-800 h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-zinc-400 font-normal">
                  {new Date(data.month + '-01').toLocaleString('en-SG', { month: 'short' })} spend
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-mono font-semibold text-white">
                  {formatSGD(data.totalSpend)}
                </p>
                <div className="mt-1">
                  <p className="text-xs text-zinc-500">Day {data.daysElapsed} of month</p>
                  {data.momDelta !== null && data.momDeltaPct !== null && data.priorMonthLabel && (
                    <p className={`text-xs font-mono ${data.momDelta > 0 ? 'text-red-400' : 'text-green-400'}`}>
                      {data.momDelta > 0 ? '↑' : '↓'} {formatSGD(Math.abs(data.momDelta))} ({data.momDelta > 0 ? '+' : ''}{data.momDeltaPct.toFixed(0)}%)
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Top categories */}
          {data.topCategories.length > 0 && (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-zinc-400 font-normal">Top categories</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.topCategories.map(cat => {
                  const color = CATEGORY_COLORS[cat.category] ?? '#94A3B8'
                  const pct = (cat.amount / maxAmount) * 100
                  return (
                    <Link
                      key={cat.category}
                      href={`/insights/${encodeURIComponent(cat.category)}`}
                      className="block group cursor-pointer -mx-1 px-1 rounded-lg hover:bg-zinc-800/50 transition-colors duration-200 py-1"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full inline-block"
                            style={{ backgroundColor: color }}
                          />
                          <span className="text-sm text-zinc-200 group-hover:text-white transition-colors duration-200">{cat.category}</span>
                        </div>
                        <span className="font-mono text-sm text-zinc-100 group-hover:text-white transition-colors duration-200">
                          {formatSGD(cat.amount)}
                        </span>
                      </div>
                      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-200"
                          style={{ width: `${pct}%`, backgroundColor: color }}
                        />
                      </div>
                    </Link>
                  )
                })}
              </CardContent>
            </Card>
          )}

          {/* Recent transactions */}
          {data.recentTransactions.length > 0 && (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm text-zinc-400 font-normal">Recent</CardTitle>
                <Link href="/transactions" className="text-xs text-blue-400 hover:text-blue-300">
                  View all
                </Link>
              </CardHeader>
              <CardContent className="divide-y divide-zinc-800">
                {data.recentTransactions.map(t => (
                  <div key={t.id} className="flex items-center justify-between py-2.5 gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-zinc-100 truncate">{t.description}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge
                          className="text-xs px-1.5 py-0 font-normal border-0"
                          style={{
                            backgroundColor: `${CATEGORY_COLORS[t.category] ?? '#94A3B8'}25`,
                            color: CATEGORY_COLORS[t.category] ?? '#94A3B8',
                          }}
                        >
                          {t.category}
                        </Badge>
                        <span className="text-xs text-zinc-500">{relativeDate(t.date)}</span>
                      </div>
                    </div>
                    <span
                      className={`font-mono text-sm font-medium whitespace-nowrap ${t.amount < 0 ? 'text-white' : 'text-green-400'}`}
                    >
                      {t.amount < 0 ? '-' : '+'}{formatSGD(Math.abs(t.amount))}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
