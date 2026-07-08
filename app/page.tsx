'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CATEGORY_COLORS, formatSGD, relativeDate, BANK_TABS } from '@/lib/display'
import Link from 'next/link'
import InsightCard from '@/components/InsightCard'
import StatementCoverage from '@/components/StatementCoverage'

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
  isEmpty: boolean
  isCurrentMonth: boolean
  topCategories: CategoryTotal[]
  recentTransactions: Transaction[]
  momDelta: number | null
  momDeltaPct: number | null
  priorMonthLabel: string | null
}

function getMonthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const now = new Date()
  if (y === now.getFullYear() && m === now.getMonth() + 1) return 'This Month'
  if (y === now.getFullYear() && m === now.getMonth()) return 'Last Month'
  return new Date(y, m - 1, 1).toLocaleString('en-SG', { month: 'long', year: 'numeric' })
}

function buildMonthOptions(): { value: string; label: string }[] {
  const now = new Date()
  const options = []
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const value = `${y}-${m}`
    options.push({ value, label: getMonthLabel(value) })
  }
  return options
}

interface BalanceData {
  balances: { bank: string; balance: number; account_type: string; recorded_at: string }[]
  total: number
  totalCC: number
  lastUpdated: string
}

export default function HomePage() {
  const [selectedBank, setSelectedBank] = useState<string>('all')
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [autoFalledBack, setAutoFalledBack] = useState(false)
  const [data, setData] = useState<DashboardData | null>(null)
  const [balanceData, setBalanceData] = useState<BalanceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const monthOptions = buildMonthOptions()

  useEffect(() => {
    setLoading(true)
    setAutoFalledBack(false)
    const params = new URLSearchParams()
    if (selectedBank !== 'all') params.set('bank', selectedBank)
    params.set('month', selectedMonth)
    Promise.all([
      fetch(`/api/dashboard?${params}`).then(r => r.json()),
      fetch('/api/balances').then(r => r.json()),
    ])
      .then(([d, b]) => {
        if (d.error) { setError(d.error); return }
        // Always set balance data regardless of fallback
        setBalanceData(b)
        // Auto-fallback: if current month has no data, silently switch to last month
        if (d.isEmpty && d.isCurrentMonth) {
          const now = new Date()
          const lastMonthFixed = now.getMonth() === 0
            ? `${now.getFullYear() - 1}-12`
            : `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`
          setSelectedMonth(lastMonthFixed)
          setAutoFalledBack(true)
          return
        }
        setData(d)
      })
      .catch(() => setError('Failed to load dashboard'))
      .finally(() => setLoading(false))
  }, [selectedBank, selectedMonth])

  const isEmpty = !loading && data && data.recentTransactions.length === 0 && data.topCategories.length === 0

  const maxAmount = data?.topCategories?.[0]?.amount ?? 1

  return (
    <div className="space-y-6 p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-zinc-100">Financial Overview</h1>
        <select
          value={selectedMonth}
          onChange={e => { setSelectedMonth(e.target.value); setAutoFalledBack(false) }}
          aria-label="Select month"
          className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {monthOptions.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      {autoFalledBack && (
        <p className="text-xs text-zinc-500 -mt-3">
          No data for this month yet — showing last month instead.
        </p>
      )}
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
      <StatementCoverage />

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
              role="link"
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

          {/* Financial Health Summary */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-sm text-zinc-400 font-normal">{getMonthLabel(selectedMonth)} Financial Health</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Primary metrics row */}
              <div className="grid grid-cols-3 gap-4">
                {/* Balance */}
                <Link href="/accounts">
                  <div className="text-center p-3 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 transition-colors cursor-pointer">
                    <p className="text-xs text-zinc-400 mb-1">Total Balance</p>
                    <p className="text-lg font-mono font-semibold text-white">
                      {balanceData && balanceData.balances.length > 0 ? formatSGD(balanceData.total) : '$0'}
                    </p>
                    {balanceData && balanceData.balances.length > 0 && (
                      <p className="text-xs text-zinc-500 mt-1">
                        {balanceData.balances.length} bank{balanceData.balances.length > 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                </Link>
                
                {/* Spend */}
                <div className="text-center p-3 rounded-lg bg-zinc-800/50">
                  <p className="text-xs text-zinc-400 mb-1">Spent</p>
                  <p className="text-lg font-mono font-semibold text-red-400">
                    {formatSGD(data.totalSpend)}
                  </p>
                </div>
                
                {/* Savings Rate */}
                <div className="text-center p-3 rounded-lg bg-zinc-800/50">
                  <p className="text-xs text-zinc-400 mb-1">Saved</p>
                  <p className="text-lg font-mono font-semibold text-green-400">
                    {data.momDelta !== null && data.momDelta < 0 ? 
                      `${Math.abs(data.momDeltaPct || 0).toFixed(0)}%` : 
                      '0%'
                    }
                  </p>
                </div>
              </div>
              
              {/* Trend indicator with clear context */}
              {data.momDelta !== null && data.momDeltaPct !== null && data.priorMonthLabel && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/30">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${
                      data.momDelta < 0 ? 'bg-green-400' : 'bg-red-400'
                    }`} />
                    <span className="text-sm text-zinc-300">
                      {data.momDelta < 0 ? 'Spending decreased' : 'Spending increased'} vs {data.priorMonthLabel}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-mono font-medium ${
                      data.momDelta < 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {data.momDelta < 0 ? '↓' : '↑'} {formatSGD(Math.abs(data.momDelta))}
                    </p>
                    <p className={`text-xs font-mono ${
                      data.momDelta < 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      ({data.momDelta > 0 ? '+' : ''}{data.momDeltaPct.toFixed(0)}%)
                    </p>
                  </div>
                </div>
              )}
              
              {/* Bank balances breakdown */}
              {balanceData && balanceData.balances.length > 0 && (
                <div className="p-3 rounded-lg bg-zinc-800/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-zinc-300">Account Balances</span>
                    <span className="text-xs text-zinc-400">
                      Updated {relativeDate(balanceData.lastUpdated)}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {balanceData.balances.filter(b => b.account_type !== 'credit_card').map(({ bank, balance }) => (
                      <div key={bank} className="flex items-center justify-between">
                        <span className="text-sm text-zinc-200">{bank.toUpperCase()}</span>
                        <span className="text-sm font-mono text-white">{formatSGD(balance)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 pt-2 border-t border-zinc-700">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-zinc-100">Total</span>
                      <span className="text-sm font-mono font-semibold text-white">{formatSGD(balanceData.total)}</span>
                    </div>
                  </div>
                </div>
              )}
              {/* Progress through month */}
              <div className="p-3 rounded-lg bg-zinc-800/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-zinc-300">Month Progress</span>
                  <span className="text-xs text-zinc-400">Day {data.daysElapsed} of {new Date(data.month + '-01').getDate() === 1 ? 
                    new Date(data.month + '-01').toLocaleString('en-SG', { month: 'short' }) + ' has ' + new Date(new Date(data.month + '-01').getFullYear(), new Date(data.month + '-01').getMonth() + 1, 0).getDate() + ' days' : 
                    '30 days'
                  }</span>
                </div>
                <div className="w-full bg-zinc-700 rounded-full h-2">
                  <div 
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min((data.daysElapsed / 30) * 100, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  {Math.round((data.daysElapsed / 30) * 100)}% of month complete
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Top categories */}
          {data.topCategories.length > 0 && (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm text-zinc-400 font-normal">Top Spending Categories</CardTitle>
                  <span className="text-xs text-zinc-500">
                    {new Date(data.month + '-01').toLocaleString('en-SG', { month: 'short' })}
                  </span>
                </div>
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
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm text-zinc-400 font-normal">Recent Transactions</CardTitle>
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
