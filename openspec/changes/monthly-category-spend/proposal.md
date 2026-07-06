## Why

The category insights page shows "Avg spend" — a single averaged number across all time — which is hard to act on. What users actually want is to see how much they spent in each category per month, so they can spot trends, identify outlier months, and understand their real spending pattern over time.

## What Changes

- Replace the "Avg spend" stat card in `/insights/[category]` with a month-by-month spend breakdown
- Add a monthly spend bar chart to the category insights page (each bar = one month's spend in that category)
- Update the `/api/insights/[category]` endpoint to return per-month totals instead of a single average
- Show the actual monthly average as a secondary label beneath the chart (e.g. "avg $240/mo over 6 months") so context is preserved but not the hero metric

## Capabilities

### New Capabilities
- `category-monthly-breakdown`: Per-month spend totals for a given category, shown as a bar chart with month labels and amounts, replacing the single avg spend stat

### Modified Capabilities
- none

## Impact

- `app/api/insights/[category]/route.ts` — add `monthlySpend: { month, label, amount }[]` to response
- `app/insights/[category]/page.tsx` — replace avg spend card with monthly bar chart component
- `components/MiniBarChart.tsx` — may need to support labelled axes if not already
