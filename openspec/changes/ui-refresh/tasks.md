## 1. Dashboard — MoM Delta

- [x] 1.1 In `/api/dashboard/route.ts`, compute prior month date range using same bank filter
- [x] 1.2 Query prior month total spend and add `momDelta` and `momDeltaPct` to the JSON response
- [x] 1.3 In `app/page.tsx`, add `momDelta` and `momDeltaPct` to the `DashboardData` interface
- [x] 1.4 Render delta line below spend total: `↑/↓ $X vs <month> (+Y%)`, red for increase, green for decrease, hidden if no prior data

## 2. AI Insight — 6-Month Window

- [x] 2.1 In `/api/insight/route.ts`, replace the `getPastMonthRanges(3)` trend query with a 6-month loop (current month + 5 prior) building full category+merchant summaries for each month
- [x] 2.2 Update the system prompt to prioritise cross-time patterns over single-month anomalies

## 3. Ask Page — Chat Layout

- [x] 3.1 Replace the three-card layout with a full-height flex container: thread (flex-1, overflow-y-auto) + pinned bottom bar
- [x] 3.2 On mount, load history from `/api/ask/history` and seed the thread as AI+user bubble pairs in chronological order
- [x] 3.3 Render user messages as right-aligned bubbles (zinc-700 bg) and AI responses as left-aligned bubbles (zinc-800 bg)
- [x] 3.4 On submit: add user bubble immediately, add loading bubble, replace loading with AI response on completion — all in the same thread state array
- [x] 3.5 Render `answer_data` bar chart inside the AI bubble (same `MiniBarChart` component)
- [x] 3.6 Add empty-state placeholder when thread has no messages
- [x] 3.7 Replace the memory Card with a collapsed chip above the input; clicking expands inline list with per-entry delete

## 4. Verification

- [x] 4.1 TypeScript build passes with no errors (`npx tsc --noEmit`)
- [x] 4.2 Manually verify: dashboard shows delta, insight covers multiple months, Ask page scrolls correctly with long history
