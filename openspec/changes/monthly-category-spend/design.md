## Context

The category insights page (`/insights/[category]`) currently shows a single "Avg spend" number — computed as total spend ÷ transaction count. This tells you nothing useful: it doesn't account for months with no activity, doesn't show trends, and mixes all time into one stat.

The API (`/api/insights/[category]`) already queries all transactions for that category. We can add a month-bucketed aggregation in the same query with minimal overhead.

The `MiniBarChart` component already exists in the codebase and renders bar charts — we can reuse it.

## Goals / Non-Goals

**Goals:**
- Show spend per month for the selected category as a bar chart
- Keep the monthly average as secondary context (small label, not hero)
- No new API routes — extend existing `/api/insights/[category]`
- Reuse `MiniBarChart` if it supports labelled axes; extend minimally if not

**Non-Goals:**
- Cross-category comparison
- Filtering by bank within the category page
- Budget/target overlays (future)

## Decisions

**Add `monthlySpend` array to existing API response** rather than a new endpoint — the query is already scoped to the category, just needs a GROUP BY month. Avoids an extra network round-trip.

**Show last 6 months** — consistent with the StatementCoverage component convention in this codebase. Enough history to see a trend without overwhelming the mobile screen.

**Keep `average` field in the API** — the category page shows it as a subtitle under the chart ("avg $X/mo"). Removing it would be a breaking change to the API contract; cheaper to keep it.

**Bar chart over table** — scannable at a glance, consistent with existing `MiniBarChart` usage on the dashboard. A table would waste vertical space on mobile.

## Risks / Trade-offs

- [MiniBarChart may not support month labels] → Check implementation first; add a `labels` prop if missing. Small change, low risk.
- [Months with zero spend won't appear in GROUP BY] → Fill gaps client-side by generating the last 6 month slots and defaulting missing ones to 0.

## Migration Plan

1. Extend API response — backward compatible (additive field)
2. Update category page UI — replace stat card with chart
3. No DB migrations needed
