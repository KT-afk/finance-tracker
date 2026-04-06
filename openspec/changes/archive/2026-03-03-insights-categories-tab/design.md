## Context

The app already has an Insights page at `/insights` showing a month-over-month bar chart and category table. There is no way to see a breakdown of spending by category for a specific time window, and no UI for the categorisation rules stored in `category_rules`. The categories tab fills both gaps.

## Goals / Non-Goals

**Goals:**
- View total spending by category for a chosen period and bank, as a donut pie chart and sorted list
- Navigate from a category row to the existing category detail page
- View, add, and delete categorisation keyword rules

**Non-Goals:**
- No editing of existing rules (delete + re-add is sufficient for v1)
- No time-scoping of rules (rules are global)
- No budgets or targets
- No changes to the Overview tab

## Decisions

### 1. View toggle inside Insights page, not a new nav item

A segmented control (`Overview | Categories`) sits at the top of the Insights page. Switching views does not change the URL. The nav bar stays at 4 items.

**Alternative:** New `/categories` route with its own nav item. Rejected — 5th item crowds mobile bottom nav and the content is logically part of insights.

### 2. Period picker — relative labels

```
This month | Last month | 2 months ago | 3 months ago | All time
```

Maps to calendar month boundaries. "This month" = current calendar month to today. Relative labels are friendlier than date pickers for a personal finance app.

### 3. Bank picker — All banks + individual banks

```
All banks | OCBC | DBS | UOB | Trust
```

Both pickers control the pie chart AND the category list simultaneously. They are independent of the Overview tab's bank filter tabs.

### 4. Donut chart — Recharts PieChart with innerRadius

Center label shows the total spend for the selected period/bank. Each slice is colored using `CATEGORY_COLORS` from `lib/display.ts`. Clicking a slice navigates to `/insights/[category]`.

Only expense categories are shown (amount < 0). Income and Transfer are excluded from the chart.

### 5. Category list — sorted by spend descending

Below the chart, a list of rows: category color dot, category name, amount (formatted SGD), percentage of total. Clicking a row navigates to `/insights/[category]`.

### 6. Rules manager — always all-time

Rules are not time-scoped. The rules section is always rendered below the category list, regardless of period/bank selection.

Layout: header "Categorisation rules", list of rules (keyword + category badge + delete button), then an inline add form (keyword text input + category dropdown + Add button).

### 7. API design

```
GET  /api/categories?period=this_month&bank=ocbc
     → { items: [{ category, total, count, pct }], grandTotal }

GET  /api/rules
     → { rules: [{ id, keyword, category, created_at }] }

POST /api/rules
     body: { keyword, category }
     → { rule: { id, keyword, category, created_at } }

DELETE /api/rules/[id]
     → { success: true }
```

Period values: `this_month`, `last_month`, `2_months_ago`, `3_months_ago`, `all_time`
Bank values: `all`, `ocbc`, `dbs`, `uob`, `trust`

## Component Structure

```
app/insights/page.tsx
  ├── SegmentedControl (Overview | Categories)
  ├── [if Overview] — existing content unchanged
  └── [if Categories] — <CategoriesView />

components/CategoriesView.tsx
  ├── PeriodPicker (5 options)
  ├── BankPicker (5 options)
  ├── DonutChart (Recharts PieChart, innerRadius)
  ├── CategoryList (rows, click → /insights/[category])
  └── RulesManager
       ├── RulesList (keyword, category badge, delete button)
       └── AddRuleForm (keyword input, category select, Add button)
```
