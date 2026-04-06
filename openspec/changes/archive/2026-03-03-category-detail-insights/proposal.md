## Why

The current Insights page gives a high-level view of spending by category across months, but there is no way to drill down into a specific category to understand *what* is driving that spending. Users need per-category detail — top merchants, transaction count, average spend, and a trend line — to turn raw category totals into actionable insight.

## What Changes

- Add a new `/insights/[category]` page that shows a detailed breakdown for any spending category
- Add a new `/api/insights/[category]` API route that returns category-specific stats (6-month trend, top merchants/payees, count, average, full transaction list)
- Make the MoM table rows on `/insights` clickable, linking to the category detail page
- Make the stacked bar chart segments on `/insights` clickable, linking to the category detail page

## Capabilities

### New Capabilities

- `category-insights-api`: New API route `/api/insights/[category]` returning 6-month monthly totals, top merchants, transaction count, average spend, and paginated transaction list for a given category
- `category-insights-page`: New `/insights/[category]` page showing a mini trend line chart, stat cards (count, average, total), top merchants list, and full transaction table for the selected category

### Modified Capabilities

- none

## Impact

- New files: `app/api/insights/[category]/route.ts`, `app/insights/[category]/page.tsx`
- Modified files: `app/insights/page.tsx` (add click handlers / links to chart bars and MoM table rows)
- No schema changes, no new dependencies
- Reads from existing `transactions` table via Drizzle ORM
