## 1. API Route — /api/insights/[category]

- [x] 1.1 Create `app/api/insights/[category]/route.ts` with a GET handler that decodes `params.category` and validates it against the CATEGORIES enum, returning 400 for unknown values
- [x] 1.2 Query the last 6 calendar months of transactions for the category (expenses only, `amount < 0`) and build the `trend` array: 6 objects with `month` (YYYY-MM) and `total` (rounded to 2dp)
- [x] 1.3 Query all-time transactions for the category (expenses only) and compute `topMerchants`: group by `description`, sum absolute amounts, sort descending, cap at 5
- [x] 1.4 Compute `count` (integer count of all-time expense transactions for the category) and `average` (mean absolute amount, rounded to 2dp)
- [x] 1.5 Query the 50 most recent expense transactions for the category, ordered by date descending, and return as `recentTransactions`
- [x] 1.6 Return all fields in a single JSON response; return `{ error }` with status 500 on any exception

## 2. Category Detail Page — /insights/[category]

- [x] 2.1 Create `app/insights/[category]/page.tsx` as a client component that reads `params.category` (decoded automatically by Next.js) and fetches `/api/insights/[encodedCategory]` on mount
- [x] 2.2 Render a page heading showing the category name and a back link (`← Insights`) that navigates to `/insights`
- [x] 2.3 Render stat cards for total count (labelled "Transactions") and average spend (labelled "Avg spend"), formatted with `formatSGD`
- [x] 2.4 Render a Recharts `LineChart` for the 6-month trend: single line in the category color from `CATEGORY_COLORS`, X-axis showing abbreviated month name, Y-axis formatted as `$N`, responsive container height 180px
- [x] 2.5 Render a "Top merchants" section: up to 5 rows, each showing description (truncated, `max-w` with `truncate`) and total spend formatted as SGD
- [x] 2.6 Render a "Recent transactions" list: up to 50 rows showing date, description (truncated), and absolute amount formatted as SGD
- [x] 2.7 Show a loading skeleton/spinner while data is being fetched
- [x] 2.8 Show a clear empty state message when `count === 0`

## 3. Insights Page — Make MoM Table Rows Clickable

- [x] 3.1 In `app/insights/page.tsx`, import `Link` from `next/link`
- [x] 3.2 Wrap each MoM table row `<div>` with a `<Link href={/insights/${encodeURIComponent(row.category)}}>`; keep existing styles, add `cursor-pointer hover:bg-zinc-800/50` for visual affordance

## 4. Insights Page — Make Chart Bars Clickable

- [x] 4.1 In `app/insights/page.tsx`, import `useRouter` from `next/navigation`
- [x] 4.2 Add an `onClick` prop to each `<Bar>` component that calls `router.push(/insights/${encodeURIComponent(cat)})` using the bar's category name; add `cursor="pointer"` prop to the Bar

## 5. Verification

- [x] 5.1 Run `npm run build` and confirm zero type errors and all routes compile successfully
- [ ] 5.2 Manually verify: clicking a MoM row navigates to the correct category detail page with data rendered
- [ ] 5.3 Manually verify: clicking a chart bar navigates to the correct category detail page
- [ ] 5.4 Manually verify: the trend line chart, stat cards, top merchants, and transaction list all render correctly on the detail page
- [ ] 5.5 Manually verify: navigating to a category with no transactions shows the empty state
