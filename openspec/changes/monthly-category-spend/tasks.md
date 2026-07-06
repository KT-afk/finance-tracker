## 1. API

- [x] 1.1 Add `monthlySpend` GROUP BY month query to `/api/insights/[category]/route.ts`
- [x] 1.2 Generate last-6-months slot array and fill gaps with `amount: 0`
- [x] 1.3 Add `monthlySpend: { month, label, amount }[]` to the API response type

## 2. Chart Component

- [x] 2.1 Check if `MiniBarChart` supports labelled x-axis; add `labels` prop if missing
- [x] 2.2 Ensure bars with `amount: 0` render as zero-height (not hidden)

## 3. Category Page UI

- [x] 3.1 Add `monthlySpend` to the `CategoryData` interface in the category page
- [x] 3.2 Replace the "Avg spend" stat card with the monthly bar chart
- [x] 3.3 Add "avg $X/mo" secondary label beneath the chart (average over months with spend only)
