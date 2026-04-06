## Context

The app stores all transactions in SQLite via Drizzle ORM and uses the Anthropic SDK (already installed) for categorization via `lib/categorize.ts`. Claude Haiku handles categorization; Claude Sonnet will handle insights and Q&A. There is no AI interaction layer today — users must read raw tables and charts themselves to understand their spending.

## Goals / Non-Goals

**Goals:**
- Surface proactive spending insights on the home page without user prompting
- Let users ask natural language questions about their finances and get answers
- Persist a memory layer so Claude's context improves over time
- Allow users to teach Claude facts and correct miscategorised transactions via the Ask page

**Non-Goals:**
- Real-time streaming responses (plain JSON response is fine)
- Multi-turn conversational memory within a single session (each Ask query is self-contained but has access to the global memory store)
- Changing the existing Insights, Transactions, or Upload pages
- User authentication / multi-user support

## Decisions

### Model selection
Use `claude-sonnet-4-6` for both `/api/insight` and `/api/ask`. Haiku is sufficient for single-word categorization but Sonnet is needed for nuanced spending analysis and natural language understanding. The model ID is passed as a constant so it can be changed without touching API logic.

### Data passed to Claude
Do not pass raw transaction rows. Instead, summarise:
- This month's spending grouped by category (label + total + top merchants)
- Last 3 months' category totals for trend context
- Full `ai_memory` table content serialised as a bullet list

This keeps prompts token-efficient and avoids leaking unnecessary data.

### DB schema (new tables)

**`ai_conversations`**
| column | type | notes |
|---|---|---|
| id | integer PK autoincrement | |
| question | text NOT NULL | user's raw question |
| answer_text | text NOT NULL | Claude's plain-English reply |
| answer_data | text | JSON blob for mini visual (nullable) |
| created_at | text NOT NULL | ISO timestamp |

**`ai_memory`**
| column | type | notes |
|---|---|---|
| id | integer PK autoincrement | |
| key | text NOT NULL UNIQUE | fact identifier, e.g. "kt_is_sister" |
| value | text NOT NULL | fact content |
| source | text NOT NULL | `"user"` or `"inferred"` |
| created_at | text NOT NULL | ISO timestamp |

### API routes

**`POST /api/insight`**
- Reads current month transactions + last 3 months summary + memory
- Calls Claude Sonnet with a system prompt instructing anomaly detection, contextual Others naming, and skipping known-normal items (from memory)
- Returns `{ text: string }` — no streaming, no visual data
- Called once on home page mount, result cached in component state (no server-side caching needed at this scale)

**`POST /api/ask`**
- Body: `{ question: string }`
- Reads all transactions (summary form) + full memory
- Claude determines intent: query / correction / teaching
- For corrections: updates the transaction's category in DB, stores a memory entry
- For teaching: stores the fact in `ai_memory` with `source: "user"`
- For queries: may include `answer_data` (JSON with `type`, `labels`, `values`) for a mini bar chart
- Returns `{ text: string, answer_data?: object }`
- Conversation saved to `ai_conversations` after every successful call

### Memory lifecycle
- Memory is append/upsert by key (unique constraint on `key`)
- Claude can suggest new inferred facts; the API validates before writing
- Users can view/delete memory entries via the Ask page (future: dedicated Memory settings page)

### Navigation
Add "Ask" to the existing nav bar as a new item between Insights and Upload.

## Risks / Trade-offs

- **Latency**: Sonnet responses take 2–5 s. The home insight card shows a loading skeleton; the Ask page shows a spinner. No streaming needed at this stage.
- **Token cost**: Summarised data (not raw rows) keeps prompts small. At ~500 transactions/month the summary is well under 2K tokens.
- **Memory pollution**: User-provided facts are stored verbatim. Bad facts accumulate. Mitigation: users can delete individual memory entries from the Ask page.
- **SQLite concurrency**: Single-writer SQLite is fine for a personal finance app with one user.
