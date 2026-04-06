## Context

The app has a working `/insights` page with a 6-month stacked bar chart and MoM comparison table. Both are read-only — clicking a category does nothing. The existing `/api/insights` route aggregates data across all categories per month. There is no per-category breakdown.

Categories are a fixed enum of 11 values in `lib/schema.ts`. Category names contain spaces and special characters (e.g. "Food & Drink", "Bills & Utilities"), so they must be URL-encoded when used as route segments.

The DB is SQLite via Drizzle ORM (`better-sqlite3`, synchronous API). All queries are `.all()` calls — no async needed.

## Goals / Non-Goals

**Goals:**
- New `/api/insights/[category]` route returning per-category stats: 6-month monthly totals, top 5 merchants by spend, transaction count, average spend, and a paginated list of transactions
- New `/insights/[category]` page rendering those stats with a trend line chart, stat cards, merchant list, and transaction table
- MoM table rows on `/insights` become `<Link>` elements pointing to the category detail page
- Stacked bar chart on `/insights` gets click handler navigating to the category detail page on bar segment click

**Non-Goals:**
- No budgets or targets — observe only
- No date range picker on the detail page (always shows last 6 months for trend, all-time for merchant/txn list)
- No pagination on the transaction list beyond a reasonable cap (50 most recent)
- No bank filter on the detail page (keep it simple)

## Decisions

### 1. URL encoding for category names
Category names like "Food & Drink" become `Food%20%26%20Drink` in the URL. The Next.js dynamic segment `[category]` receives the decoded value automatically via `params.category`. The API route does the same. Client-side navigation uses `encodeURIComponent(category)` when building hrefs.

**Alternative considered**: Slug mapping (e.g. `food-drink`). Rejected — adds an indirection layer with no benefit since categories are a fixed enum and Next.js handles decoding natively.

### 2. Trend chart type on detail page
Use a Recharts `LineChart` (single line) rather than a stacked `BarChart`. A single category over time is clearer as a line — it shows trajectory (rising/falling) better than a bar.

**Alternative considered**: Bar chart for consistency with the main insights page. Rejected — a line chart communicates trend more clearly for a single series.

### 3. Top merchants aggregation
Group transactions by `description` and sum absolute amounts, sort descending, take top 5. Description is the raw merchant/payee string from the bank CSV — good enough for merchant identification without additional parsing.

**Alternative considered**: A separate `merchants` table. Rejected — over-engineered for the current scale; description grouping is sufficient.

### 4. Transaction list cap
Show the 50 most recent transactions for the category (all-time, not just current month). No pagination UI — a scrollable list is sufficient for personal use.

**Alternative considered**: Full pagination. Rejected — unnecessary complexity for a personal finance app with at most a few hundred transactions per category.

### 5. Making chart bars clickable
Recharts `Bar` supports an `onClick` prop that receives the data payload. Use `useRouter()` from `next/navigation` to navigate programmatically on bar click.

**Alternative considered**: Wrapping bars in SVG `<a>` tags. Rejected — Recharts doesn't expose easy SVG-level anchor wrapping; the `onClick` prop is the idiomatic approach.

## Risks / Trade-offs

- **Long description strings as merchant names** → Truncate to ~40 chars in the UI with `truncate` class. Acceptable for personal use.
- **URL-encoding edge cases** → `encodeURIComponent` is standard and handles all category name characters. Next.js decodes params automatically. Low risk.
- **Empty state on detail page** → If a category has no transactions, show a clear empty state rather than blank charts. Handled via `count === 0` check.

## Migration Plan

No DB migrations needed. New files only, plus edits to the existing insights page. No rollback complexity — changes are additive.
