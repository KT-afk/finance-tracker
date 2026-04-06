## Context

A personal finance tracker for one user, running entirely on a local macOS machine. Data comes from CSV exports across four Singapore banks (OCBC, DBS/POSB, UOB, Trust). No prior codebase exists — this is a greenfield project. The primary constraints are privacy (data stays local), simplicity (no infra to manage), and daily usability (low friction to check).

## Goals / Non-Goals

**Goals:**
- Parse and normalize CSV exports from all four banks into a single SQLite database
- Auto-categorize transactions using a keyword rules engine with Claude Haiku as fallback
- Serve a responsive web UI at localhost:3000, auto-started via macOS launchd
- Accessible from phone on home wifi via LAN IP
- Observe-only: understand spending, no budget targets

**Non-Goals:**
- Multi-user support or authentication
- Bank API / real-time sync
- Budget tracking or alerts
- Cloud deployment or remote access outside home network
- Mobile native app
- Multi-currency support
- Investment or savings tracking

## Decisions

### 1. Next.js 14 App Router as the full-stack framework
**Decision**: Use Next.js with App Router for both UI and API routes in a single project.
**Rationale**: Avoids maintaining a separate backend. API routes handle CSV parsing, DB writes, and Claude calls server-side — keeping sensitive operations (API key, DB file path) out of the browser entirely. Single `npm run build` artifact simplifies launchd setup.
**Alternative considered**: Separate Express API + React SPA. Rejected — unnecessary complexity for a personal tool with one user.

### 2. SQLite via better-sqlite3 + Drizzle ORM
**Decision**: Local SQLite file (`finance.db` at project root) accessed synchronously via `better-sqlite3`, with Drizzle ORM for schema definition and query building.
**Rationale**: Zero infra — no database server, no connection strings, no cloud accounts. The file can be backed up by dragging it to iCloud. `better-sqlite3` is synchronous which simplifies Next.js API route code. Drizzle provides type-safe queries and schema migrations without a heavyweight ORM.
**Alternative considered**: Turso (cloud SQLite). Rejected — data leaves the machine, defeating the privacy goal.

### 3. Four dedicated CSV parsers + a normalizer
**Decision**: Each bank gets its own parser module (`lib/parsers/ocbc.ts`, `dbs.ts`, `uob.ts`, `trust.ts`) that returns a common `RawTransaction[]` type. A normalizer converts to the final `Transaction` shape.
**Rationale**: Bank CSV formats differ significantly (column names, date formats, debit/credit split vs signed amounts). Isolating parsers makes each easy to fix when banks change their export format without touching shared logic.
**Alternative considered**: Single generic parser with config. Rejected — the format differences are structural, not just cosmetic. A config-driven approach produces fragile code.

### 4. Categorization: rules-first, Claude Haiku fallback
**Decision**: On import, check each transaction description against `category_rules` (case-insensitive keyword match). If no match, call Claude Haiku with a structured prompt listing the fixed categories. Save the result as a new rule immediately.
**Rationale**: Rules are instant, free, and private. Claude only handles genuinely unknown merchants. After a few months of uploads, the rules table covers the vast majority of transactions, making Claude calls rare.
**Key prompt design**: Single-turn, minimal — description + category list, respond with category name only. Use `claude-haiku-3-5` for speed and cost.
**Alternative considered**: Claude for every transaction. Rejected — unnecessary cost and latency, and sends more data than needed to the API.

### 5. Hash-based deduplication
**Decision**: Compute `SHA256(date + description + amount + bank)` for each parsed transaction. Store as a unique index on `transactions.hash`. On import, use `INSERT OR IGNORE`.
**Rationale**: Users will re-download and re-upload the same month's CSV regularly (banks often include the full month in each export). Silent deduplication with a count of skipped rows in the upload preview is the right UX — no errors, just transparency.

### 6. shadcn/ui + Recharts for UI
**Decision**: shadcn/ui for layout, forms, tables, and interactive elements. Recharts for category bar charts and trend line charts.
**Rationale**: shadcn/ui components are copy-paste (no runtime dependency), highly composable, and look polished without design effort. Recharts is the simplest React-native charting library that handles the bar + line chart types needed here.
**Alternative considered**: Tremor (higher-level). Rejected — less control over layout for the daily glance home screen.

### 7. Per-bank data separation with unified view toggle
**Decision**: All transactions store their `bank` field. The UI defaults to "All banks" view but supports filtering to a single bank via a tab/select on each screen. All queries accept an optional `bank` filter parameter.
**Rationale**: User thinks of finances as separate per bank (e.g. Trust for daily spend, OCBC for savings). Unified view is useful for total picture. Both views needed.

### 8. macOS launchd for auto-start
**Decision**: Ship a `com.financetracker.app.plist` launchd agent and a `scripts/setup-autostart.sh` that installs it to `~/Library/LaunchAgents/`. Service runs `npm run start` (production build) bound to `0.0.0.0:3000`.
**Rationale**: Makes the app feel native — always available at localhost:3000 without terminal interaction. Binding to `0.0.0.0` enables phone access on home wifi without additional config.
**Requirement**: User must run `npm run build` once before installing the service, and after any app updates.

## Risks / Trade-offs

- **Bank CSV format changes** → Parsers break silently on new columns or renamed headers. Mitigation: parser throws a descriptive error shown in the upload UI; user can report and fix the parser.
- **Claude API key required** → App won't auto-categorize unknown merchants without a key. Mitigation: graceful fallback to "Others" if `ANTHROPIC_API_KEY` is unset; app is still functional with manual corrections.
- **SQLite file corruption** → Unlikely but possible if machine loses power mid-write. Mitigation: `better-sqlite3` uses WAL mode by default; recommend iCloud/Dropbox backup of `finance.db`.
- **No auth** → Anyone on home LAN can access the app. Mitigation: acceptable tradeoff for a home-only personal tool; documented in README. Not suitable if guests frequently use home wifi.
- **launchd service uses stale build** → After updating app code, user forgets to rebuild. Mitigation: document clearly in README; consider showing app version in footer.

## Open Questions

- Should the upload screen support drag-and-drop in addition to file picker? (Nice to have, low priority)
- Should category rules be exportable/importable as JSON for backup? (Useful if `finance.db` is lost, low priority for v1)
