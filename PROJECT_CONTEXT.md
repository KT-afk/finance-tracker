# Finance Tracker — Full Project Context

Use this document to understand the entire codebase when working in a new session. It contains every file, its purpose, and key implementation details.

---

## Overview

A **personal finance tracker** webapp for a Singapore resident. It imports bank transactions from CSV/PDF files from 4 SG banks (OCBC, DBS/POSB, UOB, Trust Bank), auto-categorizes them using keyword rules + Claude AI fallback, and provides spending insights via a dashboard, charts, and an AI chat interface.

**Single-user, local-only, privacy-first.** All data stays in a local SQLite file (`finance.db`). No auth, no cloud sync.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 16.1.6 |
| Frontend | React | 19.2.3 |
| Styling | Tailwind CSS 4, shadcn/ui, CVA, tailwind-merge |
| Charts | Recharts | 3.7.0 |
| Icons | Lucide React | 0.576.0 |
| Database | SQLite via better-sqlite3 | 12.6.2 |
| ORM | Drizzle ORM + Drizzle Kit | 0.45.1 / 0.31.9 |
| AI | Anthropic Claude SDK | 0.78.0 |
| Fonts | IBM Plex Sans + IBM Plex Mono (Google Fonts) |

**AI models used:**
- `claude-haiku-4-5` — transaction categorization (fast, cheap)
- `claude-sonnet-4-6` — AI chat (`/api/ask`) and insight generation (`/api/insight`)

---

## Project Structure

```
finance-tracker/
├── app/
│   ├── layout.tsx                    # Root layout (dark mode, IBM Plex fonts, NavBar, sidebar offset)
│   ├── page.tsx                      # Dashboard (home page)
│   ├── globals.css                   # Global styles
│   ├── favicon.ico
│   ├── upload/page.tsx               # Upload CSV/PDF page
│   ├── transactions/page.tsx         # Transaction list with filters + inline edit
│   ├── insights/
│   │   ├── page.tsx                  # Insights overview (trends, MoM, biggest txns)
│   │   └── [category]/page.tsx       # Category detail (trend, top merchants, recent txns)
│   ├── ask/page.tsx                  # AI chat interface
│   └── api/
│       ├── upload/route.ts           # POST: parse + categorize file → preview
│       ├── upload/confirm/route.ts   # POST: save previewed transactions to DB
│       ├── dashboard/route.ts        # GET: current month summary, top categories, recent, MoM
│       ├── transactions/route.ts     # GET: paginated + filtered transaction list
│       ├── transactions/[id]/route.ts # PATCH: update category, save rule
│       ├── categories/route.ts       # GET: category breakdown with period/bank filters
│       ├── insights/route.ts         # GET: 6-month trend, MoM comparison, biggest txns
│       ├── insights/[category]/route.ts # GET: single category detail (trend, merchants, stats)
│       ├── insight/route.ts          # POST: AI-generated spending insight (Claude Sonnet)
│       ├── ask/route.ts              # POST: AI chat (query/correction/teaching intents)
│       ├── ask/history/route.ts      # GET: conversation history
│       ├── memory/route.ts           # GET: list AI memories
│       ├── memory/[id]/route.ts      # DELETE: remove a memory
│       ├── rules/route.ts            # GET: list rules, POST: create rule
│       └── rules/[id]/route.ts       # DELETE: remove a rule
├── components/
│   ├── NavBar.tsx                    # Desktop sidebar + mobile bottom nav
│   ├── InsightCard.tsx               # AI insight card (sessionStorage cached, 30min TTL)
│   ├── CategoriesView.tsx            # Donut chart + category list + rules manager
│   ├── MiniBarChart.tsx              # Inline bar chart for AI chat responses
│   └── ui/                           # shadcn/ui primitives
│       ├── badge.tsx, button.tsx, card.tsx, progress.tsx
│       ├── select.tsx, separator.tsx, table.tsx, tabs.tsx
├── lib/
│   ├── schema.ts                     # Drizzle schema (4 tables) + BANKS/CATEGORIES constants
│   ├── db.ts                         # Singleton DB connection (WAL mode, foreign keys)
│   ├── categorize.ts                 # Hybrid categorization: rules → Claude Haiku → "Others"
│   ├── rules.ts                      # saveRule() + findRuleCategory() for keyword matching
│   ├── display.ts                    # CATEGORY_COLORS, formatSGD(), relativeDate(), BANK_TABS
│   ├── utils.ts                      # cn() utility (clsx + tailwind-merge)
│   └── parsers/
│       ├── index.ts                  # Router: parseCSV() + parseFile() dispatch by bank
│       ├── types.ts                  # RawTransaction interface, tokenizeCSV(), parseCSVRows(), date parsers
│       ├── normalizer.ts             # normalize() + computeHash() (SHA256 dedup)
│       ├── ocbc.ts                   # OCBC CSV parser (DD/MM/YYYY, multi-line quoted descriptions)
│       ├── dbs.ts                    # DBS/POSB CSV parser (DD MMM YYYY)
│       ├── uob.ts                    # UOB CSV parser (DD/MM/YYYY, Withdrawal/Deposit columns)
│       ├── trust.ts                  # Trust Bank CSV parser (YYYY-MM-DD, signed amounts)
│       ├── pdf.ts                    # PDF text extraction via pdftotext (poppler)
│       ├── uob-pdf.ts               # UOB credit card PDF parser (statement layout)
│       └── paynow.ts                # PayNow/FAST/NETS/IBG description parser (6 patterns)
├── drizzle/                          # Migration files
├── drizzle.config.ts                 # Drizzle Kit config (SQLite, ./finance.db)
├── next.config.ts                    # Next.js config (empty/default)
├── tsconfig.json                     # TypeScript strict mode, ES2017, @/* path alias
├── package.json                      # Dependencies and scripts
└── finance.db                        # SQLite database file (gitignored)
```

---

## Database Schema (lib/schema.ts)

4 tables in SQLite (`finance.db`), managed by Drizzle ORM:

### `transactions`
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| date | TEXT | ISO YYYY-MM-DD |
| description | TEXT | Raw bank description |
| amount | REAL | negative = expense, positive = income |
| bank | TEXT | enum: 'ocbc' \| 'dbs' \| 'uob' \| 'trust' |
| category | TEXT | default 'Others' |
| is_corrected | BOOLEAN | default false, set true on manual edit |
| hash | TEXT UNIQUE | SHA256(date\|description\|amount\|bank) for dedup |
| uploaded_at | TEXT | ISO timestamp |

### `category_rules`
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| keyword | TEXT UNIQUE | lowercased keyword for matching |
| category | TEXT | target category |
| created_at | TEXT | ISO timestamp |

### `ai_conversations`
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | autoincrement |
| question | TEXT | user's question |
| answer_text | TEXT | AI response text |
| answer_data | TEXT | nullable JSON blob (bar chart data) |
| created_at | TEXT | ISO timestamp |

### `ai_memory`
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | autoincrement |
| key | TEXT UNIQUE | snake_case identifier |
| value | TEXT | the remembered fact |
| source | TEXT | 'user' \| 'inferred' |
| created_at | TEXT | ISO timestamp |

**DB init:** Singleton pattern in `lib/db.ts`, WAL mode + foreign keys enabled. Reuses connection across hot reloads via `globalThis`.

**Migrations:** Run `npx drizzle-kit migrate` to create/update tables.

---

## Categories

12 fixed categories defined in `lib/schema.ts`:
```
Food & Drink, Groceries, Transport, Shopping, Subscriptions, Health,
Entertainment, Bills & Utilities, Transfer, Personal, Income, Others
```

Each has a color in `lib/display.ts` (`CATEGORY_COLORS`).

---

## Banks

4 supported banks: `ocbc`, `dbs`, `uob`, `trust`

Bank tabs (for filtering): `['all', 'ocbc', 'dbs', 'uob', 'trust']`

---

## Key Flows

### Upload Flow
1. User selects bank + file (CSV or PDF) on `/upload`
2. `POST /api/upload` → parses file with bank-specific parser → normalizes → deduplicates via hash → categorizes each new transaction → returns preview
3. User reviews preview (total, new, skipped, date range)
4. `POST /api/upload/confirm` → inserts into DB with `onConflictDoNothing` on hash
5. Redirects to dashboard

### Categorization Pipeline (lib/categorize.ts)
1. Parse PayNow/FAST/NETS/IBG description into structured fields (memo, recipient, method)
2. Check keyword rules — try memo, then recipient, then raw description
3. If no rule match → call Claude Haiku with structured prompt
4. If Claude returns valid category → derive keyword → save as rule for future
5. If Claude fails → fallback to "Others"

**Keyword derivation priority:**
- Memo ≥3 chars → extract first 1-3 meaningful words
- Recipient that looks like a business (PTE, LTD, all-caps) → use full name
- Otherwise (human name) → don't save a rule

### PayNow Description Parser (lib/parsers/paynow.ts)
Handles 6 patterns:
1. `FUND TRANSFER OTHR - [REF] via PayNow-[METHOD] to [MERCHANT]`
2. `FUND TRANSFER OTHR - [REF] to [MERCHANT] via PayNow-[METHOD]`
3. `FAST PAYMENT OTHR-[MEMO] to [RECIPIENT] via PayNow-[METHOD]`
4. `FAST PAYMENT OTHR-[MEMO] via PayNow-[METHOD] to [RECIPIENT]`
5. `NETS QR [MERCHANT] NETS QR PURCHASE`
6. `IBG GIRO [REF] [MERCHANT]COLL [REF]`

Junk memo detection: filters out "OTHR", pure numeric strings, long alphanumeric codes.

### Transaction Correction
- User changes category in inline dropdown on `/transactions`
- `PATCH /api/transactions/[id]` → updates category, sets `is_corrected = true`
- Extracts keyword from description → saves rule

### AI Chat (app/api/ask/route.ts)
- Uses Claude Sonnet 4.6
- Builds context: full transaction summary grouped by month/category/merchant + AI memory
- 3 intents:
  - **query** → spending analysis, optional bar chart data
  - **correction** → updates matching transactions + saves memory
  - **teaching** → stores fact in ai_memory
- All conversations saved to ai_conversations table
- Response is JSON: `{ intent, text, answer_data?, correction?, memory? }`

### AI Insight (app/api/insight/route.ts)
- Uses Claude Sonnet 4.6
- Builds 6-month spending summary (current + 5 prior months)
- Includes AI memory context
- Returns 3-5 sentence plain English insight
- Frontend caches in sessionStorage for 30 minutes

### Dashboard (app/api/dashboard/route.ts)
- Current month total spend (negative amounts only)
- Top 5 categories by spend
- 5 most recent transactions (across all months)
- Month-over-month delta (amount + percentage)
- Day-of-month progress indicator
- Bank-filtered

### Insights (app/api/insights/route.ts)
- 6-month stacked bar chart data (category breakdown per month)
- Month-over-month category comparison (current vs previous)
- Top 5 biggest transactions this month
- Bank-filtered

### Category Detail (app/api/insights/[category]/route.ts)
- 6-month trend for single category
- Top 5 merchants by total spend
- Transaction count + average amount
- 50 most recent transactions

### Categories View (components/CategoriesView.tsx)
- Donut chart + category list with percentages
- Period picker: this month / last month / 2-3 months ago / all time
- Bank picker: all / ocbc / dbs / uob / trust
- Rules manager: list, add, edit, delete keyword→category rules

---

## CSV Parsing (lib/parsers/types.ts)

Custom CSV tokenizer that handles:
- Double-quoted fields with embedded commas and newlines
- Escaped quotes (`""`)
- Windows (`\r\n`), Unix (`\n`), old Mac (`\r`) line endings

`parseCSVRows()` finds header row by matching first cell against candidates (e.g., "Transaction date", "Date"), then maps subsequent rows to key-value records.

Date parsers: `parseDDMMYYYY()`, `parseDDMMMYYYY()`, `parseFlexibleDate()`

### Bank-specific parsers:
- **OCBC** (`ocbc.ts`): Header candidates: "Transaction date". Columns: Transaction date, Description, Withdrawals(SGD), Deposits(SGD). DD/MM/YYYY dates. Multi-line quoted descriptions collapsed.
- **DBS** (`dbs.ts`): Header candidates: "Date". Columns: Date, Reference, Debit Amount, Credit Amount. DD MMM YYYY dates.
- **UOB** (`uob.ts`): Header candidates: "Transaction Date", "Account". Columns: Transaction Date, Description, Withdrawal, Deposit. DD/MM/YYYY dates.
- **Trust** (`trust.ts`): Header candidates: "Date". Columns: Date, Description, Amount (already signed). YYYY-MM-DD dates.

### PDF parsing:
- `pdf.ts`: Uses system `pdftotext` (poppler) with `-layout` flag. Writes temp file, extracts text, cleans up.
- `uob-pdf.ts`: Parses UOB credit card PDF text. Detects transaction section between "Post Trans Description" and "End of Transaction Details". Regex: `DD MMM DD MMM Description Amount`. Handles multi-page, continuation lines, CR (credit) suffix. Resolves year from statement date.

---

## Deduplication (lib/parsers/normalizer.ts)

Hash: `SHA256(date|description|amount.toFixed(2)|bank)`

On upload:
1. Normalize all parsed transactions (compute hashes)
2. Query DB for existing hashes
3. Filter out already-imported transactions
4. Only categorize + return new ones

On confirm: `INSERT ... ON CONFLICT DO NOTHING` on hash column.

---

## Frontend Architecture

### Layout (app/layout.tsx)
- Dark mode always (`<html class="dark">`)
- IBM Plex Sans (body) + IBM Plex Mono (monospace)
- NavBar rendered globally
- Desktop: `md:ml-56` offset for sidebar. Mobile: `pb-20` for bottom nav.

### Navigation (components/NavBar.tsx)
5 routes: Home (`/`), Transactions (`/transactions`), Insights (`/insights`), Ask (`/ask`), Upload (`/upload`)
- Desktop: fixed left sidebar (w-56) with icon + label
- Mobile: fixed bottom nav with icon + label
- Active state: blue icon + white text + bg-zinc-800

### All pages are `'use client'` components with:
- `useState` / `useEffect` for data fetching
- Loading skeletons (animated pulse)
- Error states with red cards
- Empty states with guidance

### Currency formatting
`formatSGD()` in `lib/display.ts` — uses `Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' })`

### Relative dates
`relativeDate()` — Today, Yesterday, Xd ago, Xw ago, or "DD MMM"

---

## Configuration

### package.json scripts
- `npm run dev` — Next.js dev server
- `npm run build` — production build
- `npm start` — production server

### Environment variables
- `ANTHROPIC_API_KEY` — in `.env.local`, required for AI features
- `NEXT_PUBLIC_HAS_ANTHROPIC_KEY` — frontend flag to show API key warning on upload page

### drizzle.config.ts
```ts
{ schema: './lib/schema.ts', out: './drizzle', dialect: 'sqlite', dbCredentials: { url: './finance.db' } }
```

### tsconfig.json
- Strict mode, ES2017 target
- Path alias: `@/*` → `./*`
- JSX: react-jsx

---

## Design Patterns

- **Singleton:** DB connection (`lib/db.ts`) survives hot reload
- **Strategy:** Bank-specific parsers dispatched via switch in `parseCSV()`
- **Adapter:** `normalizer.ts` converts `RawTransaction[]` to DB-ready format
- **Hash dedup:** SHA256 prevents duplicate imports
- **Fallback chain:** Rules → AI → "Others" for categorization
- **Optimistic updates:** Category changes on transactions page update UI immediately
- **Session caching:** AI insights cached in browser sessionStorage (30-min TTL)

---

## What's NOT in the project

- No authentication / authorization
- No tests
- No export functionality (CSV/PDF)
- No bulk operations
- No error logging / monitoring
- No deployment config (designed for local `npm run dev`)
- No service worker / PWA support
