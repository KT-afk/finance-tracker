## Why

Managing finances across four Singapore bank accounts (OCBC, DBS/POSB, UOB, Trust) with no unified view makes it impossible to understand spending patterns without manual effort. A personal localhost finance tracker eliminates manual logging and surfaces clear category-level insights from CSV exports.

## What Changes

- New localhost web app (Next.js) running as a macOS auto-start service
- CSV upload and parsing for OCBC, DBS/POSB, UOB, and Trust bank formats
- Automatic transaction categorization using keyword rules + Claude Haiku API fallback
- Per-bank transaction storage in a local SQLite database
- Daily glance home screen: monthly summary, top categories, recent transactions
- Transaction list with category correction (corrections saved as reusable rules)
- Insights screen: month-over-month comparison, category trends over time
- Deduplication on upload (hash-based, skips already-imported transactions)
- macOS launchd plist for auto-start on boot (production build on port 3000)
- Home wifi phone access via `--hostname 0.0.0.0`

## Capabilities

### New Capabilities

- `csv-ingestion`: Parse and normalize CSV exports from OCBC, DBS/POSB, UOB, and Trust into a unified transaction format; deduplicate on re-upload
- `categorization`: Assign categories to transactions using a keyword rules engine with Claude Haiku API fallback for unknown merchants; save corrections as new rules
- `transaction-storage`: Persist normalized transactions and category rules in a local SQLite database
- `home-dashboard`: Daily glance screen showing current month spend, top categories with progress bars, and recent transactions
- `transaction-management`: Full transaction list with month/category filtering and inline category correction
- `spending-insights`: Month-over-month comparison and category trend charts over 3–6 months
- `autostart`: macOS launchd configuration to run the production build on boot at localhost:3000

### Modified Capabilities

## Impact

- **New dependencies**: Next.js 14, Tailwind CSS, shadcn/ui, Recharts, Drizzle ORM, better-sqlite3, Anthropic SDK
- **External API**: Claude Haiku (Anthropic) — transaction descriptions sent only for uncategorized merchants, not stored externally
- **Data**: SQLite file lives at project root (`finance.db`); recommended to back up to iCloud/Dropbox
- **Runtime**: Node.js required on host machine; launchd service runs production build
- **Network**: Accessible on home LAN via local IP; no inbound internet access required
