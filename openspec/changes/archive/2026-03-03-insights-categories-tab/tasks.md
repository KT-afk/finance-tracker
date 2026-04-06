## 1. API — GET /api/categories

- [x] 1.1 Create `app/api/categories/route.ts` with a GET handler accepting `period` and `bank` query params
- [x] 1.2 Map period param to calendar date range: `this_month`, `last_month`, `2_months_ago`, `3_months_ago`, `all_time`
- [x] 1.3 Query expenses (`amount < 0`) for the date range and bank filter; exclude `Transfer` and `Income` categories
- [x] 1.4 Group by category, sum absolute amounts (rounded 2dp), count rows, compute pct of grand total (rounded 1dp)
- [x] 1.5 Return `{ items: [...], grandTotal }` sorted by total descending; return `{ items: [], grandTotal: 0 }` if empty

## 2. API — GET/POST /api/rules and DELETE /api/rules/[id]

- [x] 2.1 Create `app/api/rules/route.ts` with `GET` handler returning all rules from `category_rules`, sorted by `created_at` descending
- [x] 2.2 Add `POST` handler to `app/api/rules/route.ts`: validate `keyword` and `category` fields, call `saveRule()`, return the saved rule
- [x] 2.3 Create `app/api/rules/[id]/route.ts` with `DELETE` handler: look up rule by id, delete if found (return 200), return 404 if not found

## 3. CategoriesView Component

- [x] 3.1 Create `components/CategoriesView.tsx` as a client component with state for `period` (default `this_month`) and `bank` (default `all`)
- [x] 3.2 Fetch `GET /api/categories?period=...&bank=...` on mount and on picker change; show loading state while fetching
- [x] 3.3 Render a period picker: 5 pill/tab options ("This month", "Last month", "2 months ago", "3 months ago", "All time") — active pill highlighted in blue
- [x] 3.4 Render a bank picker: 5 pill/tab options ("All banks", "OCBC", "DBS", "UOB", "Trust") — active pill highlighted in blue
- [x] 3.5 Render a Recharts `PieChart` with `innerRadius` (donut); each slice colored from `CATEGORY_COLORS`; center label shows grand total as `formatSGD(grandTotal)`; clicking a slice navigates to `/insights/[category]`
- [x] 3.6 Render "No spending data for this period" empty state when `grandTotal === 0`
- [x] 3.7 Render a category list below the chart: rows with color dot, category name, formatted SGD total, pct; sorted by total descending; clicking a row navigates to `/insights/[category]`
- [x] 3.8 Fetch `GET /api/rules` on mount and render a rules list: each row shows keyword, category badge (colored), and a delete button
- [x] 3.9 Implement delete: call `DELETE /api/rules/[id]` on click, remove from local state on success
- [x] 3.10 Render an add-rule inline form: keyword text input, category `<select>` populated from `CATEGORIES`, "Add" button; on submit call `POST /api/rules`, append to list, clear the form
- [x] 3.11 Add inline validation: disable "Add" and show error if keyword is empty when form is submitted

## 4. Insights Page — View Toggle

- [x] 4.1 In `app/insights/page.tsx`, add `activeView` state (`'overview' | 'categories'`), default `'overview'`
- [x] 4.2 Render a segmented control (two buttons: "Overview" | "Categories") below the page title; active button styled with blue text/border, inactive muted
- [x] 4.3 Conditionally render existing content under `activeView === 'overview'` and `<CategoriesView />` under `activeView === 'categories'`

## 5. Verification

- [x] 5.1 Run `npm run build` — confirm zero type errors, all new routes compile
- [ ] 5.2 Manually verify: toggling Overview / Categories switches content correctly
- [ ] 5.3 Manually verify: period and bank pickers update the pie chart and category list
- [ ] 5.4 Manually verify: clicking a pie slice or category row navigates to the correct detail page
- [ ] 5.5 Manually verify: rules list shows all saved rules; delete removes a rule; add creates a new rule
