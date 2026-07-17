"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Sector,
} from "recharts"
import type { PieSectorShapeProps } from "recharts/types/polar/Pie"
import { Badge } from "@/components/ui/badge"
import { CATEGORY_COLORS, formatSGD } from "@/lib/display"
import { CATEGORIES } from "@/lib/schema"

// ── Types ─────────────────────────────────────────────────────────────────────

type BankFilter = "all" | "ocbc" | "dbs" | "uob" | "trust"

interface CategoryItem {
  category: string
  total: number
  count: number
  pct: number
}

interface CategoriesData {
  items: CategoryItem[]
  grandTotal: number
}

interface Rule {
  id: string
  keyword: string
  category: string
  created_at: string
}

// ── Picker config ──────────────────────────────────────────────────────────────

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

function currentYM(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number)
  const now = new Date()
  if (y === now.getFullYear() && m === now.getMonth() + 1) return "This month"
  if (y === now.getFullYear() && m === now.getMonth()) return "Last month"
  return new Date(y, m - 1, 1).toLocaleString("en-SG", {
    month: "short",
    year: "numeric",
  })
}

const BANKS: { value: BankFilter; label: string }[] = [
  { value: "all", label: "All banks" },
  { value: "ocbc", label: "OCBC" },
  { value: "dbs", label: "DBS" },
  { value: "uob", label: "UOB" },
  { value: "trust", label: "Trust" },
]

// ── Main component ─────────────────────────────────────────────────────────────

export default function CategoriesView() {
  const router = useRouter()

  const [selectedMonth, setSelectedMonth] = useState<string>(currentYM)
  const [allTime, setAllTime] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const [availableMonths, setAvailableMonths] = useState<string[]>([])
  const [bank, setBank] = useState<BankFilter>("all")

  useEffect(() => {
    fetch("/api/months")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.months)) setAvailableMonths(d.months)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!pickerOpen) return
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [pickerOpen])

  const monthsByYear = availableMonths.reduce<Record<number, number[]>>(
    (acc, ym) => {
      const [y, m] = ym.split("-").map(Number)
      if (!acc[y]) acc[y] = []
      acc[y].push(m)
      return acc
    },
    {}
  )
  const years = Object.keys(monthsByYear)
    .map(Number)
    .sort((a, b) => b - a)
  const [catData, setCatData] = useState<CategoriesData | null>(null)
  const [catLoading, setCatLoading] = useState(true)

  const [rules, setRules] = useState<Rule[]>([])
  const [rulesLoading, setRulesLoading] = useState(true)

  // Edit-rule state: id of the rule being edited
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null)
  const [editKeyword, setEditKeyword] = useState("")
  const [editCategory, setEditCategory] = useState<string>(CATEGORIES[0])

  // Add-rule form state
  const [newKeyword, setNewKeyword] = useState("")
  const [newCategory, setNewCategory] = useState<string>(CATEGORIES[0])
  const [addError, setAddError] = useState<string | null>(null)
  const [addLoading, setAddLoading] = useState(false)

  // Fetch category breakdown
  const fetchCategories = useCallback(() => {
    setCatLoading(true)
    const params = new URLSearchParams({ bank })
    if (allTime) {
      params.set("period", "all_time")
    } else {
      params.set("month", selectedMonth)
    }
    fetch(`/api/categories?${params}`)
      .then((r) => r.json())
      .then((d) => setCatData(d))
      .catch(() => setCatData({ items: [], grandTotal: 0 }))
      .finally(() => setCatLoading(false))
  }, [selectedMonth, allTime, bank])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  // Fetch rules (once, then manage locally)
  useEffect(() => {
    setRulesLoading(true)
    fetch("/api/rules")
      .then((r) => r.json())
      .then((d) => setRules(d.rules ?? []))
      .catch(() => setRules([]))
      .finally(() => setRulesLoading(false))
  }, [])

  async function handleDeleteRule(id: string) {
    const res = await fetch(`/api/rules/${id}`, { method: "DELETE" })
    if (res.ok) {
      setRules((prev) => prev.filter((r) => r.id !== id))
      if (editingRuleId === id) setEditingRuleId(null)
    }
  }

  function startEditing(rule: Rule) {
    setEditingRuleId(rule.id)
    setEditKeyword(rule.keyword)
    setEditCategory(rule.category)
  }

  function cancelEditing() {
    setEditingRuleId(null)
  }

  async function handleSaveEdit(rule: Rule) {
    if (!editKeyword.trim()) return
    // Delete old rule then save new one (keyword may have changed)
    const deleteRes = await fetch(`/api/rules/${rule.id}`, { method: "DELETE" })
    if (!deleteRes.ok) return

    const saveRes = await fetch("/api/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        keyword: editKeyword.trim(),
        category: editCategory,
      }),
    })
    const data = await saveRes.json()
    if (saveRes.ok && data.rule) {
      setRules((prev) => {
        const filtered = prev.filter(
          (r) => r.id !== rule.id && r.keyword !== data.rule.keyword
        )
        return [data.rule, ...filtered]
      })
      setEditingRuleId(null)
    }
  }

  async function handleAddRule(e: React.FormEvent) {
    e.preventDefault()
    if (!newKeyword.trim()) {
      setAddError("Keyword is required")
      return
    }
    setAddError(null)
    setAddLoading(true)
    try {
      const res = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: newKeyword.trim(),
          category: newCategory,
        }),
      })
      const data = await res.json()
      if (res.ok && data.rule) {
        setRules((prev) => {
          const filtered = prev.filter((r) => r.keyword !== data.rule.keyword)
          return [data.rule, ...filtered]
        })
        setNewKeyword("")
        setNewCategory(CATEGORIES[0])
      } else {
        setAddError(data.error ?? "Failed to add rule")
      }
    } catch {
      setAddError("Failed to add rule")
    } finally {
      setAddLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Period picker */}
      <div className="space-y-2">
        <p className="text-xs text-zinc-500">Period</p>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Month grid popover */}
          <div className="relative" ref={pickerRef}>
            <button
              onClick={() => {
                setPickerOpen((v) => !v)
                setAllTime(false)
              }}
              aria-expanded={pickerOpen}
              className={`px-3 py-1 rounded-full text-xs transition-colors cursor-pointer ${
                !allTime
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
              } flex items-center gap-1.5`}
            >
              <span>{monthLabel(selectedMonth)}</span>
              <svg
                width="9"
                height="9"
                viewBox="0 0 10 10"
                fill="none"
                aria-hidden="true"
                className={`transition-transform ${pickerOpen ? "rotate-180" : ""}`}
              >
                <path
                  d="M2 3.5L5 6.5L8 3.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {pickerOpen && (
              <div className="absolute left-0 top-full mt-1 z-50 rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-xl min-w-[220px]">
                {years.map((year) => (
                  <div key={year} className="mb-2 last:mb-0">
                    <p className="text-[10px] text-zinc-500 font-medium mb-1.5 uppercase tracking-wider">
                      {year}
                    </p>
                    <div className="grid grid-cols-4 gap-1">
                      {monthsByYear[year]
                        .sort((a, b) => b - a)
                        .map((m) => {
                          const ym = `${year}-${String(m).padStart(2, "0")}`
                          const isSelected = !allTime && ym === selectedMonth
                          return (
                            <button
                              key={ym}
                              onClick={() => {
                                setSelectedMonth(ym)
                                setAllTime(false)
                                setPickerOpen(false)
                              }}
                              className={`rounded px-1.5 py-1 text-xs font-medium transition-colors ${
                                isSelected
                                  ? "bg-blue-600 text-white"
                                  : "text-zinc-300 hover:bg-zinc-700"
                              }`}
                            >
                              {MONTH_SHORT[m - 1]}
                            </button>
                          )
                        })}
                    </div>
                  </div>
                ))}
                {years.length === 0 && (
                  <p className="text-xs text-zinc-500">Loading…</p>
                )}
              </div>
            )}
          </div>
          {/* All time pill */}
          <button
            onClick={() => {
              setAllTime(true)
              setPickerOpen(false)
            }}
            className={`px-3 py-1 rounded-full text-xs transition-colors cursor-pointer ${
              allTime
                ? "bg-blue-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
            }`}
          >
            All time
          </button>
        </div>
      </div>

      {/* Bank picker */}
      <div className="space-y-2">
        <p className="text-xs text-zinc-500">Bank</p>
        <div className="flex flex-wrap gap-1.5">
          {BANKS.map((o) => (
            <button
              key={o.value}
              onClick={() => setBank(o.value)}
              className={`px-3 py-1 rounded-full text-xs transition-colors cursor-pointer ${
                bank === o.value
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Donut chart + category list */}
      {catLoading ? (
        <div className="text-center py-12 text-zinc-500 text-sm">Loading…</div>
      ) : !catData || catData.grandTotal === 0 ? (
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-8 text-center">
          <p className="text-zinc-500 text-sm">
            No spending data for this period
          </p>
        </div>
      ) : (
        <>
          {/* Donut chart */}
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={catData.items}
                  dataKey="total"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  strokeWidth={0}
                  shape={(props: PieSectorShapeProps) => (
                    <Sector
                      cx={props.cx}
                      cy={props.cy}
                      innerRadius={props.innerRadius}
                      outerRadius={props.isActive ? 108 : props.outerRadius}
                      startAngle={props.startAngle}
                      endAngle={props.endAngle}
                      fill={props.fill}
                      stroke="transparent"
                    />
                  )}
                  onClick={(entry) => {
                    if (entry?.category) {
                      router.push(
                        `/insights/${encodeURIComponent(entry.category)}`
                      )
                    }
                  }}
                  cursor="pointer"
                >
                  {catData.items.map((item) => (
                    <Cell
                      key={item.category}
                      fill={CATEGORY_COLORS[item.category] ?? "#94A3B8"}
                      stroke="transparent"
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#18181b",
                    border: "1px solid #27272a",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "#f4f4f5",
                  }}
                  itemStyle={{ color: "#f4f4f5" }}
                  labelStyle={{ color: "#a1a1aa" }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any, name: any) =>
                    [
                      typeof value === "number" ? formatSGD(value) : "",
                      name ?? "",
                    ] as [string, string]
                  }
                />
                {/* Center label */}
                <text x="50%" y="46%" textAnchor="middle">
                  <tspan fontSize={11} fill="#71717a">
                    Total spend
                  </tspan>
                </text>
                <text x="50%" y="56%" textAnchor="middle">
                  <tspan fontSize={15} fontWeight="600" fill="#f4f4f5">
                    {formatSGD(catData.grandTotal)}
                  </tspan>
                </text>
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Category list */}
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 divide-y divide-zinc-800">
            {catData.items.map((item) => {
              const color = CATEGORY_COLORS[item.category] ?? "#94A3B8"
              return (
                <button
                  key={item.category}
                  onClick={() =>
                    router.push(
                      `/insights/${encodeURIComponent(item.category)}`
                    )
                  }
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/50 transition-colors cursor-pointer text-left"
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="flex-1 text-sm text-zinc-200 truncate">
                    {item.category}
                  </span>
                  <span className="text-xs text-zinc-500 shrink-0">
                    {item.pct}%
                  </span>
                  <span className="font-mono text-sm text-zinc-100 shrink-0 w-24 text-right">
                    {formatSGD(item.total)}
                  </span>
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* Rules manager */}
      <div className="rounded-xl bg-zinc-900 border border-zinc-800">
        <div className="px-4 py-3 border-b border-zinc-800">
          <h3 className="text-sm text-zinc-300 font-medium">
            Categorisation rules
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Keywords that automatically assign a category without calling AI
          </p>
        </div>

        {/* Rules list */}
        {rulesLoading ? (
          <div className="px-4 py-6 text-center text-zinc-500 text-sm">
            Loading rules…
          </div>
        ) : rules.length === 0 ? (
          <div className="px-4 py-6 text-center text-zinc-500 text-sm">
            No rules yet
          </div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {rules.map((rule) => {
              const isEditing = editingRuleId === rule.id
              const color = CATEGORY_COLORS[rule.category] ?? "#94A3B8"

              if (isEditing) {
                const editColor = CATEGORY_COLORS[editCategory] ?? "#94A3B8"
                return (
                  <div
                    key={rule.id}
                    className="px-4 py-3 bg-zinc-800/40 space-y-2"
                  >
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editKeyword}
                        onChange={(e) => setEditKeyword(e.target.value)}
                        className="flex-1 bg-zinc-800 border border-zinc-600 rounded-md px-2 py-1 text-sm text-zinc-100 font-mono focus:outline-none focus:border-blue-500 transition-colors"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveEdit(rule)
                          if (e.key === "Escape") cancelEditing()
                        }}
                      />
                      <select
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value)}
                        className="bg-zinc-800 border border-zinc-600 rounded-md px-2 py-1 text-sm focus:outline-none focus:border-blue-500 cursor-pointer"
                        style={{ color: editColor }}
                      >
                        {CATEGORIES.map((c) => (
                          <option
                            key={c}
                            value={c}
                            style={{ color: CATEGORY_COLORS[c] ?? "#94A3B8" }}
                          >
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSaveEdit(rule)}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-md transition-colors cursor-pointer"
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEditing}
                        className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs rounded-md transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        className="px-3 py-1 text-xs text-zinc-600 hover:text-red-400 transition-colors cursor-pointer ml-auto"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )
              }

              return (
                <div
                  key={rule.id}
                  className="flex items-center gap-3 px-4 py-2.5 group hover:bg-zinc-800/30 transition-colors"
                >
                  <span className="flex-1 font-mono text-sm text-zinc-300 truncate">
                    {rule.keyword}
                  </span>
                  <Badge
                    className="text-[10px] px-1.5 py-0 font-normal border-0 h-4 shrink-0"
                    style={{ backgroundColor: `${color}25`, color }}
                  >
                    {rule.category}
                  </Badge>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => startEditing(rule)}
                      className="text-zinc-500 hover:text-blue-400 transition-colors text-xs cursor-pointer px-1"
                      aria-label={`Edit rule for ${rule.keyword}`}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      className="text-zinc-600 hover:text-red-400 transition-colors text-xs cursor-pointer px-1"
                      aria-label={`Delete rule for ${rule.keyword}`}
                    >
                      ×
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Add rule form */}
        <div className="px-4 py-3 border-t border-zinc-800">
          <form onSubmit={handleAddRule} className="flex gap-2 items-start">
            <div className="flex-1 space-y-1">
              <input
                type="text"
                placeholder="Keyword (e.g. netflix)"
                value={newKeyword}
                onChange={(e) => {
                  setNewKeyword(e.target.value)
                  if (addError) setAddError(null)
                }}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
              />
              {addError && <p className="text-xs text-red-400">{addError}</p>}
            </div>
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={addLoading}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded-md transition-colors cursor-pointer whitespace-nowrap"
            >
              {addLoading ? "…" : "Add"}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
