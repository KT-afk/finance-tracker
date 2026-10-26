# Insights

## Sub-features

- Overview: bank tabs, "6-month summary" accordion (Income, Repaid, Spend, Net per month; a row expands to category pills linking to `/insights/<category>`), "Biggest transactions this month".
- Categories view (toggle button "categories").

## How to get to it (user POV)

Sidebar "Insights" (`/insights`).

## Driving it with Playwright

`e2e.sh tests/e2e/insights.spec.ts`. `GET /api/insights` returns `momComparison`, `trendData`, `monthLabels`, `biggestTransactions`, `currentMonth`.

## Gotchas

- The stacked bar chart ("6-month spend trend") was replaced by the summary in commit c42cae5. Don't test for the chart.
