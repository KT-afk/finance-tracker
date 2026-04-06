## Why

The Insights page currently shows a month-over-month breakdown and a bar chart but has no way to see spending by category across a chosen time window. The user wants to understand "where is my money actually going this month" with a visual breakdown — and also to see and manage the categorisation rules that drive automated classification.

Adding a Categories view inside the existing Insights page gives per-category visibility without adding a fifth item to the mobile navigation bar.

## What Changes

- Add an Overview / Categories view toggle to the Insights page
- Categories view: Recharts donut pie chart + category list, both controlled by independent period and bank pickers
- Rules section below the category list: view all saved rules, delete a rule, add a new rule manually
- New API routes: `GET /api/categories`, `GET /api/rules`, `POST /api/rules`, `DELETE /api/rules/[id]`

## Capabilities

### New Capabilities

- `categories-view`: Donut pie chart with period and bank pickers, category list, navigation to category detail pages
- `rules-manager`: View, add, and delete categorisation keyword rules inline on the Insights page

### Modified Capabilities

- `insights-page`: Gains a view toggle (Overview | Categories) at the top; Overview stays exactly as is

## Impact

- `app/insights/page.tsx` — add view toggle, render CategoriesView component when active
- `app/api/categories/route.ts` — new: return spending totals per category for a period + bank filter
- `app/api/rules/route.ts` — new: GET all rules, POST new rule
- `app/api/rules/[id]/route.ts` — new: DELETE rule by id
- `components/CategoriesView.tsx` — new: pie chart + category list + rules manager
- No DB schema changes (category_rules table already exists)
