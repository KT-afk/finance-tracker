## 1. Database Schema & Migration

- [x] 1.1 Add `ai_conversations` and `ai_memory` table definitions to `lib/schema.ts`
- [x] 1.2 Run `drizzle-kit push` (or generate + apply migration) to create both tables in the SQLite DB
- [x] 1.3 Export the new tables from `lib/db.ts` so API routes can import them

## 2. Insight API

- [x] 2.1 Create `app/api/insight/route.ts` — POST handler with no request body
- [x] 2.2 Query current month transactions grouped by category + top merchants
- [x] 2.3 Query last 3 months' category totals for trend context
- [x] 2.4 Fetch all `ai_memory` rows and serialise as a bullet list
- [x] 2.5 Call Claude Sonnet with system + user prompt; return `{ text: string }`

## 3. Ask API

- [x] 3.1 Create `app/api/ask/route.ts` — POST handler accepting `{ question: string }`
- [x] 3.2 Build summarised transaction context (all-time, grouped by category + merchant)
- [x] 3.3 Include full memory in system prompt
- [x] 3.4 Call Claude Sonnet; parse response to detect intent (query / correction / teaching)
- [x] 3.5 For corrections: find matching transaction and update its category in DB; upsert memory entry
- [x] 3.6 For teaching: upsert fact in `ai_memory` with `source: "user"`
- [x] 3.7 Save conversation to `ai_conversations` after every successful call
- [x] 3.8 Return `{ text: string, answer_data?: object }`

## 4. Home Page Insight Card

- [x] 4.1 Add a `InsightCard` client component (`components/InsightCard.tsx`) with loading skeleton and text display
- [x] 4.2 On mount, fetch `POST /api/insight` and populate the card
- [x] 4.3 Handle empty-month case (skip API call, show neutral message)
- [x] 4.4 Handle API error (show fallback message, don't crash)
- [x] 4.5 Import and render `InsightCard` above existing content in `app/page.tsx`

## 5. Ask Page

- [x] 5.1 Create `app/ask/page.tsx` as a client component
- [x] 5.2 Add text input + submit button; POST to `/api/ask` on submit; show spinner
- [x] 5.3 Display answer text below input; render mini bar chart if `answer_data` is present
- [x] 5.4 Fetch and display conversation history from `GET /api/ask/history` (or read from a new history route)
- [x] 5.5 Create `app/api/ask/history/route.ts` — GET returns all `ai_conversations` ordered by `created_at DESC`
- [x] 5.6 Display memory entries in a collapsible section; add delete button per entry
- [x] 5.7 Create `app/api/memory/[id]/route.ts` — DELETE removes memory entry by id
- [x] 5.8 Add "Ask" nav item to the main navigation between Insights and Upload

## 6. Prompt Engineering & Polish

- [x] 6.1 Write the insight system prompt (anomaly detection, contextual Others naming, memory-aware skipping)
- [x] 6.2 Write the ask system prompt (intent classification, answer formatting, confirmation messages for corrections/teaching)
- [x] 6.3 Manual smoke test: upload statements, visit home page, check insight card, ask 2–3 questions, test a correction and a teaching statement
- [x] 6.4 Verify memory entries appear and can be deleted from the Ask page
