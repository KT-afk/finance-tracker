## 1. Project Setup

- [x] 1.1 Initialise Next.js 14 project with App Router and TypeScript (`npx create-next-app@latest`)
- [x] 1.2 Install and configure Tailwind CSS
- [x] 1.3 Install and initialise shadcn/ui
- [x] 1.4 Install remaining dependencies: `better-sqlite3`, `drizzle-orm`, `drizzle-kit`, `recharts`, `@anthropic-ai/sdk`, `crypto` (node built-in)
- [x] 1.5 Create `.env.local` with `ANTHROPIC_API_KEY` placeholder and add to `.gitignore`
- [x] 1.6 Create `finance.db` gitignore entry so the database is never committed

## 2. Database Schema & Migrations

- [x] 2.1 Define Drizzle schema for `transactions` table (id, date, description, amount, bank, category, is_corrected, hash, uploaded_at)
- [x] 2.2 Define Drizzle schema for `category_rules` table (id, keyword, category, created_at) with unique index on keyword
- [x] 2.3 Create unique index on `transactions.hash`
- [x] 2.4 Write and run initial Drizzle migration to create both tables
- [x] 2.5 Create `lib/db.ts` singleton that opens `finance.db` with `better-sqlite3` in WAL mode

## 3. CSV Parsers

- [x] 3.1 Define `RawTransaction` type: `{ date: string, description: string, amount: number, bank: Bank }`
- [x] 3.2 Implement `lib/parsers/ocbc.ts` — parse `Transaction Date, Description, Withdrawals, Deposits, Balance` columns; map withdrawals to negative amounts
- [x] 3.3 Implement `lib/parsers/dbs.ts` — parse `Date, Reference, Debit Amount, Credit Amount` columns; handle `DD MMM YYYY` date format
- [x] 3.4 Implement `lib/parsers/uob.ts` — parse `Account, Transaction Date, Description, Withdrawal, Deposit, Balance`; handle `DD/MM/YYYY` date format
- [x] 3.5 Implement `lib/parsers/trust.ts` — parse `Date, Description, Amount`; signed amounts already correct
- [x] 3.6 Implement `lib/parsers/index.ts` router that selects the correct parser by bank name
- [x] 3.7 Implement `lib/parsers/normalizer.ts` — converts `RawTransaction[]` to final `Transaction[]` with SHA256 hash computed per row

## 4. Categorization Engine

- [x] 4.1 Implement `lib/categorize.ts` — `categorize(description: string): string` function; checks `category_rules` table first (case-insensitive keyword match)
- [x] 4.2 Implement Claude Haiku fallback in `lib/categorize.ts` — called only when no rule matches; prompt includes fixed category list and raw description; returns category name only
- [x] 4.3 Add fallback to "Others" when Claude returns an unrecognised category or API key is missing
- [x] 4.4 Implement `lib/rules.ts` — `saveRule(keyword: string, category: string)` using upsert on keyword
- [x] 4.5 Auto-extract keyword from description after Claude categorization and call `saveRule`

## 5. Upload API & UI

- [x] 5.1 Create `app/api/upload/route.ts` — accepts `multipart/form-data` with `file` and `bank` fields; parses CSV, normalizes, categorizes, deduplicates; returns preview payload (count, date range, new vs skipped)
- [x] 5.2 Create `app/api/upload/confirm/route.ts` — accepts the parsed transactions payload and inserts into DB using `INSERT OR IGNORE` on hash
- [x] 5.3 Build upload page `app/upload/page.tsx` — bank selector dropdown, file input, submit button
- [x] 5.4 Add upload preview step — show parsed transaction count, date range, skipped duplicates count before confirmation
- [x] 5.5 Add confirmation button that calls the confirm API and redirects to home on success

## 6. Home Dashboard

- [x] 6.1 Create `app/api/dashboard/route.ts` — returns current month total spend, top 5 categories with amounts, 5 most recent transactions; accepts optional `bank` query param
- [x] 6.2 Build `app/page.tsx` home screen — fetch dashboard data server-side (or client with SWR)
- [x] 6.3 Implement monthly summary card — total spend, days elapsed in month
- [x] 6.4 Implement top categories section — sorted bars with amount and relative percentage
- [x] 6.5 Implement recent transactions list — description, amount, category badge, relative date label
- [x] 6.6 Add per-bank filter tabs (All / OCBC / DBS / UOB / Trust) that re-fetch dashboard data

## 7. Transaction Management

- [x] 7.1 Create `app/api/transactions/route.ts` — returns paginated transactions; accepts `month`, `category`, `bank` query params
- [x] 7.2 Create `app/api/transactions/[id]/route.ts` — PATCH endpoint to update category and save rule
- [x] 7.3 Build `app/transactions/page.tsx` — full transaction list with month, category, and bank filter controls
- [x] 7.4 Implement inline category correction — dropdown on each row; on change calls PATCH API and updates UI optimistically
- [x] 7.5 Add transaction list pagination or virtual scroll for large datasets

## 8. Spending Insights

- [x] 8.1 Create `app/api/insights/route.ts` — returns month-over-month delta per category, 6-month trend data per category, top 5 biggest transactions for current month; accepts optional `bank` param
- [x] 8.2 Build `app/insights/page.tsx` — insights screen layout
- [x] 8.3 Implement month-over-month comparison table — current vs previous month per category with delta amount and percentage
- [x] 8.4 Implement category trend chart using Recharts (bar or line chart, 3–6 months of data)
- [x] 8.5 Implement biggest transactions list for current month
- [x] 8.6 Add per-bank filter consistent with home dashboard

## 9. Navigation & Layout

- [x] 9.1 Create root layout `app/layout.tsx` with sidebar or bottom nav: Home / Transactions / Insights / Upload
- [x] 9.2 Ensure layout is responsive — bottom nav on mobile widths, sidebar on desktop
- [x] 9.3 Add active route highlighting to nav items

## 10. macOS Auto-Start

- [x] 10.1 Create `com.financetracker.app.plist` launchd agent file — runs `npm run start`, bound to `0.0.0.0:3000`, `RunAtLoad: true`
- [x] 10.2 Create `scripts/setup-autostart.sh` — copies plist to `~/Library/LaunchAgents/` and runs `launchctl load`
- [x] 10.3 Add `WORKING_DIRECTORY` and absolute Node path to plist so launchd finds the right binary
- [x] 10.4 Document setup steps in `README.md`: install deps → build → run setup script → open localhost:3000

## 11. Polish & Edge Cases

- [x] 11.1 Handle empty database state — show helpful empty state on home screen with link to upload
- [x] 11.2 Handle missing `ANTHROPIC_API_KEY` — show warning banner on upload screen; fall back to "Others" silently
- [x] 11.3 Handle malformed CSV — show descriptive error in upload UI (wrong bank selected, bad format)
- [x] 11.4 Add app version display in footer
- [x] 11.5 Manual end-to-end test: upload one CSV from each of the 4 banks and verify categorization, deduplication, and all 3 screens render correctly
