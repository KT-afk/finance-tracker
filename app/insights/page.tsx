"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CATEGORY_COLORS, formatSGD, BANK_TABS } from "@/lib/display"
import { ChevronDown } from "lucide-react"
import CategoriesView from "@/components/CategoriesView"

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

interface PnLMonth {
  month: string
  label: string
  income: number
  reimbursements: number
  spend: number
  net: number | null
  categories: { category: string; amount: number }[]
}

interface InsightsData {
  momComparison: MomRow[]
  trendData: Record<string, string | number>[]
  monthLabels: string[]
  monthlyPnL: PnLMonth[]
  biggestTransactions: BigTransaction[]
  currentMonth: string
}

type ActiveView = "overview" | "categories"

export default function InsightsPage() {
  const [activeView, setActiveView] = useState<ActiveView>("overview")
  const [selectedBank, setSelectedBank] = useState("all")
  const [data, setData] = useState<InsightsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    const params = selectedBank !== "all" ? `?bank=${selectedBank}` : ""
    fetch(`/api/insights${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error)
        else setData(d)
      })
      .catch(() => setError("Failed to load insights"))
      .finally(() => setLoading(false))
  }, [selectedBank])

  return (
    <div className="space-y-5 p-4 max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold">Insights</h1>

      {/* View toggle */}
      <div className="flex rounded-lg bg-zinc-900 border border-zinc-800 p-0.5 w-fit">
        {(["overview", "categories"] as ActiveView[]).map((v) => (
          <button
            key={v}
            onClick={() => setActiveView(v)}
            className={`px-4 py-1.5 rounded-md text-sm transition-colors cursor-pointer capitalize ${
              activeView === v
                ? "bg-zinc-700 text-white"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      {/* Categories view */}
      {activeView === "categories" && <CategoriesView />}

      {/* Overview view */}
      {activeView === "overview" && (
        <>
          {/* Bank filter */}
          <Tabs value={selectedBank} onValueChange={setSelectedBank}>
            <TabsList className="bg-zinc-900 border border-zinc-800 w-full">
              {BANK_TABS.map((b) => (
                <TabsTrigger
                  key={b}
                  value={b}
                  className="flex-1 text-xs uppercase tracking-wide data-[state=active]:bg-zinc-700"
                >
                  {b === "all" ? "All" : b.toUpperCase()}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {loading && (
            <div className="space-y-5">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="rounded-xl bg-zinc-900 border border-zinc-800 animate-pulse"
                  style={{
                    height: i === 1 ? "220px" : i === 2 ? "160px" : "120px",
                  }}
                />
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
              {/* Monthly P&L summary — 6 months, accordion */}
              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm text-zinc-400 font-normal">
                      6-month summary
                    </CardTitle>
                    <div className="hidden sm:grid grid-cols-[5rem_5rem_5rem_5.5rem_1rem] gap-x-3 text-[11px] text-zinc-600 pr-1">
                      <span className="text-right">Income</span>
                      <span className="text-right">Repaid</span>
                      <span className="text-right">Spend</span>
                      <span className="text-right">Net</span>
                      <span />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                  {(data.monthlyPnL ?? []).length === 0 ? (
                    <p className="text-center text-zinc-500 text-sm py-8 px-4">
                      Not enough data yet
                    </p>
                  ) : (
                    <div className="divide-y divide-zinc-800">
                      {(data.monthlyPnL ?? []).map((row) => {
                        const isExpanded = expandedMonth === row.month
                        const netPositive = row.net !== null && row.net >= 0
                        return (
                          <div key={row.month}>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedMonth(isExpanded ? null : row.month)
                              }
                              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/40 transition-colors text-left"
                              aria-expanded={isExpanded}
                            >
                              <span className="w-14 shrink-0 text-sm font-medium text-zinc-200">
                                {row.label}
                              </span>
                              {/* Mobile: compact */}
                              <div className="flex-1 flex items-center gap-2 sm:hidden">
                                <span className="font-mono text-xs text-red-400">
                                  {formatSGD(row.spend)}
                                </span>
                                {row.net !== null && (
                                  <span
                                    className={`font-mono text-xs ${netPositive ? "text-green-400" : "text-red-400"}`}
                                  >
                                    {row.net >= 0 ? "+" : ""}
                                    {formatSGD(row.net)}
                                  </span>
                                )}
                              </div>
                              {/* Desktop: all columns */}
                              <div className="hidden sm:grid grid-cols-[5rem_5rem_5rem_5.5rem] gap-x-3 ml-auto">
                                <span className="font-mono text-xs text-zinc-400 text-right">
                                  {row.income > 0 ? formatSGD(row.income) : "—"}
                                </span>
                                <span className="font-mono text-xs text-teal-400 text-right">
                                  {row.reimbursements > 0
                                    ? formatSGD(row.reimbursements)
                                    : "—"}
                                </span>
                                <span className="font-mono text-xs text-zinc-200 text-right">
                                  {formatSGD(row.spend)}
                                </span>
                                <span
                                  className={`font-mono text-xs text-right ${
                                    row.net === null
                                      ? "text-zinc-600"
                                      : netPositive
                                        ? "text-green-400"
                                        : "text-red-400"
                                  }`}
                                >
                                  {row.net === null
                                    ? "—"
                                    : `${row.net >= 0 ? "+" : ""}${formatSGD(row.net)}`}
                                </span>
                              </div>
                              <ChevronDown
                                className={`h-3.5 w-3.5 shrink-0 text-zinc-600 transition-transform duration-200 ${
                                  isExpanded ? "rotate-180" : ""
                                }`}
                              />
                            </button>

                            {/* Expanded: category breakdown */}
                            {isExpanded && (
                              <div className="px-4 pb-3 pt-0">
                                {row.categories.length === 0 ? (
                                  <p className="text-xs text-zinc-600 pl-14">
                                    No expense data
                                  </p>
                                ) : (
                                  <div className="pl-14 flex flex-wrap gap-1.5">
                                    {row.categories.map((c) => (
                                      <Link
                                        key={c.category}
                                        href={`/insights/${encodeURIComponent(c.category)}`}
                                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-opacity hover:opacity-80"
                                        style={{
                                          backgroundColor: `${CATEGORY_COLORS[c.category] ?? "#94A3B8"}20`,
                                          color:
                                            CATEGORY_COLORS[c.category] ??
                                            "#94A3B8",
                                          border: `1px solid ${CATEGORY_COLORS[c.category] ?? "#94A3B8"}40`,
                                        }}
                                      >
                                        {c.category}
                                        <span className="font-mono opacity-80">
                                          {formatSGD(c.amount)}
                                        </span>
                                      </Link>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Month-over-month comparison */}
              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-zinc-400 font-normal">
                    Month-over-month
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.momComparison.length === 0 ? (
                    <p className="text-center text-zinc-500 text-sm py-6">
                      No data for current month
                    </p>
                  ) : (
                    <div className="space-y-0 divide-y divide-zinc-800">
                      <div className="hidden sm:grid sm:grid-cols-[minmax(0,1.5fr)_minmax(6rem,1fr)_minmax(6rem,1fr)_minmax(7rem,1fr)] pb-2 text-xs text-zinc-500">
                        <span>Category</span>
                        <span className="text-right">This month</span>
                        <span className="text-right">Last month</span>
                        <span className="text-right">Change</span>
                      </div>
                      {data.momComparison.map((row) => {
                        const color = CATEGORY_COLORS[row.category] ?? "#94A3B8"
                        const isUp = row.delta > 0
                        return (
                          <Link
                            key={row.category}
                            href={`/insights/${encodeURIComponent(row.category)}`}
                            className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 py-3 text-sm items-center cursor-pointer hover:bg-zinc-800/50 transition-colors duration-200 rounded -mx-1 px-1 sm:grid-cols-[minmax(0,1.5fr)_minmax(6rem,1fr)_minmax(6rem,1fr)_minmax(7rem,1fr)] sm:gap-y-0 sm:py-2.5"
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className="h-2 w-2 rounded-full shrink-0"
                                style={{ backgroundColor: color }}
                              />
                              <span className="text-zinc-200 text-xs sm:text-sm truncate">
                                {row.category}
                              </span>
                            </div>
                            <span className="hidden text-right font-mono text-xs text-zinc-100 sm:block">
                              {formatSGD(row.current)}
                            </span>
                            <span className="hidden text-right font-mono text-xs text-zinc-500 sm:block">
                              {formatSGD(row.previous)}
                            </span>
                            <div className="flex items-center justify-end gap-1">
                              <span
                                className={`font-mono text-xs ${isUp ? "text-red-400" : row.delta < 0 ? "text-green-400" : "text-zinc-500"}`}
                              >
                                {row.delta > 0 ? "+" : ""}
                                {formatSGD(row.delta)}
                              </span>
                              {row.deltaPct !== null && (
                                <span
                                  className={`text-[10px] ${isUp ? "text-red-500" : "text-green-500"}`}
                                >
                                  ({row.deltaPct > 0 ? "+" : ""}
                                  {Math.round(row.deltaPct)}%)
                                </span>
                              )}
                            </div>
                            <div className="col-span-2 flex flex-wrap gap-x-3 gap-y-1 pl-4 text-[11px] text-zinc-500 sm:hidden">
                              <span>
                                This{" "}
                                <span className="font-mono text-zinc-200">
                                  {formatSGD(row.current)}
                                </span>
                              </span>
                              <span>
                                Last{" "}
                                <span className="font-mono">
                                  {formatSGD(row.previous)}
                                </span>
                              </span>
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
                    <p className="text-center text-zinc-500 text-sm py-6">
                      No transactions yet
                    </p>
                  ) : (
                    data.biggestTransactions.map((t, i) => {
                      const color = CATEGORY_COLORS[t.category] ?? "#94A3B8"
                      return (
                        <div
                          key={t.id}
                          className="flex items-center gap-3 py-2.5"
                        >
                          <span className="text-zinc-600 text-xs w-4 shrink-0">
                            {i + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-zinc-100 truncate">
                              {t.description}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge
                                className="text-[10px] px-1 py-0 font-normal border-0 h-4"
                                style={{ backgroundColor: `${color}25`, color }}
                              >
                                {t.category}
                              </Badge>
                              <span className="text-[10px] text-zinc-500">
                                {new Date(
                                  t.date + "T00:00:00"
                                ).toLocaleDateString("en-SG", {
                                  day: "numeric",
                                  month: "short",
                                })}
                              </span>
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
