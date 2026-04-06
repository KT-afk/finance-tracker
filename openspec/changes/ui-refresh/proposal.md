## Why

Three parts of the UI feel disconnected from what users actually want to do:

1. **Ask page is a form, not a conversation.** Input at the top, answer appearing mid-page, history buried below — it reads like a search engine, not a chat. The mental model is wrong.
2. **Dashboard is a report.** Stacked cards of equal weight with no hierarchy between "the number that matters" and supporting detail. The AI insight and the spend total compete instead of the insight interpreting the total. No month-over-month delta on the dashboard means the spend number has no context.
3. **AI insight is too narrow.** It only analyses the current month and uses the prior 3 months solely for trend comparison. It misses cross-time patterns ("you've spent $4k on flights in 6 months", "grocery spend has crept up since November") that are often more interesting than a single-month summary.

## What Changes

- **Ask page → chat layout**: Input pinned to the bottom, conversation thread grows upward with user bubbles (right) and AI bubbles (left). Memory section collapses to a small pill/icon — it's plumbing, not UI. The current ephemeral answer disappears; every response flows directly into the thread.
- **Dashboard hierarchy**: Add month-over-month delta next to the spend total ("↑ 18% vs February"). Reposition the AI insight card below the total so it reads as interpretation, not competition. The insight call is expanded to 6 months of data and re-prompted to detect cross-time patterns.
- **Broader AI insight**: `/api/insight` gets 6 months of monthly summaries instead of 1 month + 3-month trend. System prompt updated to look for multi-month patterns, not just current-month anomalies.

## Capabilities

### New Capabilities
- `chat-ask-ui`: Chat-style Ask page — input pinned at bottom, bubbles layout, memory de-emphasised

### Modified Capabilities
- `home-insight-card`: Insight now covers 6 months and surfaces cross-time patterns; dashboard adds MoM delta above the insight
- `ask-page`: Layout overhaul — chat bubbles, input at bottom, memory collapsed

## Impact

- `app/ask/page.tsx` — full layout redesign
- `app/page.tsx` — reorder insight card, add MoM delta to spend total
- `app/api/insight/route.ts` — extend data window from 1+3 months to 6 months; update system prompt
- `app/api/dashboard/route.ts` — add `momDelta` and `momDeltaPct` fields to response
- No changes to Transactions, Upload, Insights pages, or any API other than insight and dashboard
