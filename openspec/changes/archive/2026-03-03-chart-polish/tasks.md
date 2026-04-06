## 1. Color Palette

- [x] 1.1 In `lib/display.ts`, update `CATEGORY_COLORS`: set `Subscriptions` to `#F43F5E`, `Others` to `#FBBF24`, `Bills & Utilities` to `#60A5FA`, `Shopping` to `#E879F9`, `Personal` to `#818CF8`, `Health` to `#2DD4BF` — leave all other entries unchanged

## 2. Donut Chart Polish

- [x] 2.1 In `components/CategoriesView.tsx`, change `Pie` props: `innerRadius={60}` (was 68), `outerRadius={100}` (was 96)
- [x] 2.2 Add `activeIndex` state (`useState<number | undefined>(undefined)`) to `CategoriesView`
- [x] 2.3 Import `Sector` from `recharts`; implement `renderActiveShape` function that returns a `Sector` with the same fill/stroke props but `outerRadius={108}`
- [x] 2.4 Add `activeShape={renderActiveShape}` and `activeIndex={activeIndex}` props to `Pie`; replace existing `onClick` with `onMouseEnter={(_, index) => setActiveIndex(index)}`, `onMouseLeave={() => setActiveIndex(undefined)}`; keep `onClick` for navigation

## 3. Stacked Bar Polish

- [x] 3.1 In `app/insights/page.tsx`, remove the `TREND_CATEGORIES` constant
- [x] 3.2 After fetching trend data, derive the category list dynamically: collect all keys from `trendData` rows excluding `"month"`, compute per-category 6-month totals, sort ascending by total (so lowest total renders last/topmost in stack)
- [x] 3.3 Replace the hardcoded `TREND_CATEGORIES.map(...)` rendering of `<Bar>` components with a dynamic map over the derived sorted list; apply `radius={[0, 0, 0, 0]}` to all except the last entry which gets `radius={[3, 3, 0, 0]}`
- [x] 3.4 Add `labelStyle={{ color: '#a1a1aa' }}` to the stacked bar `<Tooltip>` props

## 4. Area Chart Polish

- [x] 4.1 In `app/insights/[category]/page.tsx`, replace `LineChart` and `Line` imports with `AreaChart`, `Area`, and add `linearGradient` via SVG `<defs>` (no new npm packages needed — all from `recharts`)
- [x] 4.2 Inside `AreaChart`, add a `<defs>` block with a `LinearGradient` id `areaGradient-${encodeURIComponent(category)}`, gradient stops: `stopColor={color}` `stopOpacity={0.25}` at offset `0%` and `stopOpacity={0}` at offset `100%`
- [x] 4.3 Replace `<Line>` with `<Area type="monotone" dataKey="total" stroke={color} strokeWidth={2} fill={\`url(#areaGradient-${encodeURIComponent(category)})\`} dot={{ fill: color, r: 3, strokeWidth: 0 }} activeDot={{ fill: color, r: 5, strokeWidth: 0 }} />`
- [x] 4.4 On `YAxis`, add `domain={[0, 'auto']}`; change `ResponsiveContainer` height from `180` to `200`

## 5. Verification

- [x] 5.1 Run `npm run build` — confirm zero type errors, all routes compile
- [ ] 5.2 Manually verify: donut chart shows new colors with no orange cluster; Bills & Utilities slice is clearly blue
- [ ] 5.3 Manually verify: hovering a donut slice expands it; clicking navigates correctly
- [ ] 5.4 Manually verify: stacked bar shows all categories present in data (not just 6); rounded corners are at the top of each column
- [ ] 5.5 Manually verify: category detail page shows area fill under the trend line; Y-axis starts at 0
