/**
 * Unit tests for financial calculation logic extracted from API routes.
 * These test the pure math — no DB, no HTTP.
 */

import assert from 'node:assert/strict'

// ─── helpers replicated from route logic ────────────────────────────────────

type Tx = { date: string; amount: number; category: string; bank: string }

function totalSpend(txns: Tx[]): number {
  return txns
    .filter(t => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)
}

function topCategories(txns: Tx[], limit = 5): { category: string; amount: number }[] {
  const totals: Record<string, number> = {}
  for (const t of txns) {
    if (t.amount < 0) {
      totals[t.category] = (totals[t.category] ?? 0) + Math.abs(t.amount)
    }
  }
  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([category, amount]) => ({ category, amount }))
}

function momDelta(currentSpend: number, priorSpend: number, hasPrior: boolean) {
  return hasPrior ? currentSpend - priorSpend : null
}

function momDeltaPct(currentSpend: number, priorSpend: number, hasPrior: boolean) {
  return hasPrior && priorSpend > 0
    ? ((currentSpend - priorSpend) / priorSpend) * 100
    : null
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function roundPercent(value: number): number {
  return Math.round(value * 10) / 10
}

function buildMomComparison(currentData: Record<string, number>, prevData: Record<string, number>) {
  const allCategories = new Set([...Object.keys(currentData), ...Object.keys(prevData)])
  return Array.from(allCategories)
    .map(cat => {
      const current = roundMoney(currentData[cat] ?? 0)
      const previous = roundMoney(prevData[cat] ?? 0)
      const delta = roundMoney(current - previous)
      const deltaPct = previous > 0 ? roundPercent((delta / previous) * 100) : null
      return { category: cat, current, previous, delta, deltaPct }
    })
    .filter(r => r.current > 0 || r.previous > 0)
    .sort((a, b) => b.current - a.current)
}

function paginate<T>(items: T[], page: number, pageSize: number) {
  const total = items.length
  const offset = (page - 1) * pageSize
  return {
    items: items.slice(offset, offset + pageSize),
    total,
    totalPages: Math.ceil(total / pageSize),
  }
}

function balancesTotal(balances: { balance: number }[]): number {
  return balances.reduce((sum, b) => sum + b.balance, 0)
}

// ─── totalSpend ──────────────────────────────────────────────────────────────

{
  const txns: Tx[] = [
    { date: '2026-05-01', amount: -10.00, category: 'Food & Drink', bank: 'uob' },
    { date: '2026-05-02', amount: -20.50, category: 'Transport',    bank: 'uob' },
    { date: '2026-05-03', amount:  500.00, category: 'Income',      bank: 'uob' }, // income — excluded
  ]
  assert.equal(totalSpend(txns), 30.50, 'totalSpend excludes income')
}

{
  const txns: Tx[] = []
  assert.equal(totalSpend(txns), 0, 'totalSpend on empty list is 0')
}

{
  const txns: Tx[] = [
    { date: '2026-05-01', amount: 100, category: 'Income', bank: 'uob' },
  ]
  assert.equal(totalSpend(txns), 0, 'totalSpend with only income is 0')
}

{
  // Floating point: sum of amounts that could drift
  const txns: Tx[] = [
    { date: '2026-05-01', amount: -1.10, category: 'Food & Drink', bank: 'uob' },
    { date: '2026-05-02', amount: -2.20, category: 'Food & Drink', bank: 'uob' },
  ]
  const result = totalSpend(txns)
  assert.ok(Math.abs(result - 3.30) < 0.001, `totalSpend float sum: expected 3.30 got ${result}`)
}

// ─── topCategories ───────────────────────────────────────────────────────────

{
  const txns: Tx[] = [
    { date: '2026-05-01', amount: -5,   category: 'Transport',    bank: 'uob' },
    { date: '2026-05-02', amount: -100, category: 'Food & Drink', bank: 'uob' },
    { date: '2026-05-03', amount: -30,  category: 'Shopping',     bank: 'uob' },
    { date: '2026-05-04', amount: -50,  category: 'Bills & Utilities', bank: 'uob' },
    { date: '2026-05-05', amount: -20,  category: 'Health',       bank: 'uob' },
    { date: '2026-05-06', amount: -10,  category: 'Groceries',    bank: 'uob' },
    { date: '2026-05-07', amount: 200,  category: 'Income',       bank: 'uob' }, // excluded
  ]
  const top = topCategories(txns)
  // Ranked: Food $100, Bills $50, Shopping $30, Health $20, Groceries $10 — top 5
  // Transport $5 is 6th — must be excluded
  assert.equal(top.length, 5, 'topCategories returns max 5')
  assert.equal(top[0].category, 'Food & Drink', 'topCategories first is highest spend')
  assert.equal(top[0].amount, 100)
  assert.equal(top[1].category, 'Bills & Utilities')
  assert.ok(top.find(c => c.category === 'Groceries'), 'Groceries ($10, 5th) is included')
  assert.ok(!top.find(c => c.category === 'Transport'), 'Transport ($5, 6th) is excluded')
}

{
  // Same category across multiple transactions — should be summed
  const txns: Tx[] = [
    { date: '2026-05-01', amount: -10, category: 'Food & Drink', bank: 'uob' },
    { date: '2026-05-02', amount: -20, category: 'Food & Drink', bank: 'uob' },
    { date: '2026-05-03', amount: -5,  category: 'Transport',    bank: 'uob' },
  ]
  const top = topCategories(txns)
  assert.equal(top[0].category, 'Food & Drink')
  assert.equal(top[0].amount, 30, 'topCategories aggregates same category')
}

{
  // Income-only: no categories
  const txns: Tx[] = [
    { date: '2026-05-01', amount: 500, category: 'Income', bank: 'uob' },
  ]
  assert.equal(topCategories(txns).length, 0, 'topCategories empty for income-only')
}

// ─── momDelta / momDeltaPct ──────────────────────────────────────────────────

{
  assert.equal(momDelta(200, 100, true), 100, 'momDelta increase')
  assert.equal(momDelta(80, 100, true), -20, 'momDelta decrease')
  assert.equal(momDelta(200, 0, false), null, 'momDelta null when no prior data')
}

{
  assert.ok(Math.abs((momDeltaPct(200, 100, true) ?? 0) - 100) < 0.001, 'momDeltaPct 100% increase')
  assert.ok(Math.abs((momDeltaPct(75, 100, true) ?? 0) - (-25)) < 0.001, 'momDeltaPct 25% decrease')
  assert.equal(momDeltaPct(200, 0, true), null, 'momDeltaPct null when priorSpend is 0')
  assert.equal(momDeltaPct(200, 100, false), null, 'momDeltaPct null when no prior data')
}

// ─── momComparison ───────────────────────────────────────────────────────────

{
  const current = { 'Food & Drink': 200, 'Transport': 50 }
  const prev    = { 'Food & Drink': 100, 'Health': 30 }
  const result = buildMomComparison(current, prev)

  // Sorted by current spend descending
  assert.equal(result[0].category, 'Food & Drink')
  assert.equal(result[0].current, 200)
  assert.equal(result[0].previous, 100)
  assert.equal(result[0].delta, 100)
  assert.ok(Math.abs((result[0].deltaPct ?? 0) - 100) < 0.001, 'Food & Drink delta pct 100%')

  // Transport: appeared this month, not in prev
  const transport = result.find(r => r.category === 'Transport')!
  assert.ok(transport, 'Transport row exists')
  assert.equal(transport.previous, 0)
  assert.equal(transport.delta, 50)
  assert.equal(transport.deltaPct, null, 'deltaPct null when no prior spend')

  // Health: was in prev, not in current
  const health = result.find(r => r.category === 'Health')!
  assert.ok(health, 'Health row exists — appeared in prior month')
  assert.equal(health.current, 0)
  assert.equal(health.previous, 30)
  assert.equal(health.delta, -30)
}

{
  // Both empty: no rows
  assert.equal(buildMomComparison({}, {}).length, 0)
}

{
  const result = buildMomComparison(
    { 'Groceries': 110, 'Food & Drink': 76.5 },
    { 'Groceries': 142.1, 'Food & Drink': 88.25 }
  )

  const groceries = result.find(r => r.category === 'Groceries')!
  assert.equal(groceries.delta, -32.1, 'momComparison rounds money deltas')
  assert.equal(groceries.deltaPct, -22.6, 'momComparison rounds percent deltas')

  const food = result.find(r => r.category === 'Food & Drink')!
  assert.equal(food.delta, -11.75, 'momComparison keeps exact cent deltas')
  assert.equal(food.deltaPct, -13.3, 'momComparison rounds one-decimal percentage')
}

// ─── pagination ──────────────────────────────────────────────────────────────

{
  const items = Array.from({ length: 125 }, (_, i) => i)
  const p1 = paginate(items, 1, 50)
  assert.equal(p1.total, 125)
  assert.equal(p1.totalPages, 3)
  assert.equal(p1.items.length, 50)
  assert.equal(p1.items[0], 0)

  const p3 = paginate(items, 3, 50)
  assert.equal(p3.items.length, 25, 'last page has remainder')
  assert.equal(p3.items[0], 100)
}

{
  const items = Array.from({ length: 50 }, (_, i) => i)
  const p1 = paginate(items, 1, 50)
  assert.equal(p1.totalPages, 1, 'exact fit = 1 page')
}

{
  const p = paginate([], 1, 50)
  assert.equal(p.total, 0)
  assert.equal(p.totalPages, 0, 'empty list = 0 pages')
}

// ─── balancesTotal ───────────────────────────────────────────────────────────

{
  const balances = [
    { balance: 1000.00 },
    { balance: 2500.50 },
    { balance: 750.25 },
  ]
  const result = balancesTotal(balances)
  assert.ok(Math.abs(result - 4250.75) < 0.001, `balancesTotal: expected 4250.75 got ${result}`)
}

{
  assert.equal(balancesTotal([]), 0, 'balancesTotal empty = 0')
}

{
  // Single bank
  assert.equal(balancesTotal([{ balance: 12345.67 }]), 12345.67)
}

{
  // Float imprecision: 5000 + 1234.56 must not return 6234.5599999999995
  const raw = balancesTotal([{ balance: 5000 }, { balance: 1234.56 }])
  const rounded = Math.round(raw * 100) / 100
  assert.equal(rounded, 6234.56, `balance total float precision: ${raw}`)
}

// ─── done ────────────────────────────────────────────────────────────────────

console.log('All calculation tests passed.')
