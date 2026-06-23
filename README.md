# Finance Tracker

Personal finance tracker for Singapore bank accounts (OCBC, DBS/POSB, UOB, Trust).
Runs locally on your Mac. Your database stays local; optional AI features send selected transaction summaries to Anthropic when `ANTHROPIC_API_KEY` is configured.

## Features

- Upload CSV exports from OCBC, DBS/POSB, UOB, and Trust Bank
- Automatic categorization via keyword rules + Claude Haiku AI
- Home dashboard: monthly spend, top categories, recent transactions
- Transactions list: filter by month/category/bank, inline category correction
- Insights: month-over-month comparison, 6-month trend chart, biggest transactions
- Deduplication: re-uploading the same CSV is safe
- Dark OLED UI

## Setup

### 1. Install system dependencies

**Node.js** (v24 recommended; v20.9+ and <26 required) — via [nvm](https://github.com/nvm-sh/nvm) or [Homebrew](https://brew.sh):

```bash
brew install node@24
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
```

**poppler** — required for UOB PDF uploads only (CSV uploads work without it):

```bash
brew install poppler
```

### 2. Install Node dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and add your Anthropic API key (optional — without it, unknown merchants are categorised as "Others", the app still works fully). When enabled, AI categorisation, Ask, and Insights send transaction descriptions, amounts, categories, and remembered facts needed for the request to Anthropic:

```
ANTHROPIC_API_KEY=sk-ant-...
```

To require a password before using the app, also set:

```bash
APP_PASSWORD=choose-a-long-password
```

### 4. Run the database migration

Creates `finance.db` with all tables:

```bash
npx drizzle-kit migrate
```

By default, local development stores SQLite data at `./finance.db` in the repo root. That file is ignored by git because it contains financial data.

If you work on multiple computers, set `FINANCE_DB_PATH` in `.env.local` to keep the database outside the repo, for example:

```bash
FINANCE_DB_PATH=~/Documents/FinanceTracker/finance.db
```

You can put that folder somewhere backed up or synced, but avoid running the app on two computers against the same synced SQLite database at the same time. Close the app on one computer before opening it on another.

For access when your Mac is offline, host the app and use a cloud libSQL database such as Turso:

```bash
TURSO_DATABASE_URL=libsql://your-db-org.turso.io
TURSO_AUTH_TOKEN=your-turso-token
APP_PASSWORD=choose-a-long-password
```

Hosted deployments fail closed without `APP_PASSWORD`.

Run migrations against the cloud database with those variables set:

```bash
TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npx drizzle-kit migrate
TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npm run db:verify-cloud
```

Preview and then copy your current local data into the cloud database:

```bash
TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npm run db:copy-cloud
TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npm run db:copy-cloud -- --confirm
```

Deploy the Next.js app to a Node-compatible host such as Vercel and set the same env vars there. CSV import and manual edits work in this mode; PDF import needs a host that includes the `pdftotext`/Poppler binary.

For the full cloud checklist, see [docs/cloud-deploy-checklist.md](docs/cloud-deploy-checklist.md). For Vercel-specific commands, see [docs/vercel-turso-runbook.md](docs/vercel-turso-runbook.md).

Before deploying, you can run:

```bash
TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... APP_PASSWORD=... npm run cloud:preflight
```

After deployment, verify the hosted app:

```bash
FINANCE_TRACKER_URL=https://your-app.example.com APP_PASSWORD=... npm run hosted:preflight
```

For a safer cloud-backed copy, keep the live database local and back it up to a synced folder:

```bash
FINANCE_BACKUP_DIR=~/Documents/FinanceTracker/backups npm run db:backup
```

The backup script uses SQLite's backup command, so it is safe to run while the app is open.

### 5. Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 6. Production build

```bash
npm run build
npm run start
```

## macOS Auto-start (runs at login)

To have Finance Tracker start automatically when you log in:

```bash
bash scripts/setup-autostart.sh
```

This will:
1. Build the current production bundle
2. Install a launchd agent to `~/Library/LaunchAgents/`
3. Start the app immediately

The launch agent prefers `/opt/homebrew/opt/node@24/bin/npm`. Override with `FINANCE_TRACKER_NPM_BIN` in `.env.local` only if Node 24 is installed somewhere else.
Set `FINANCE_TRACKER_SKIP_BUILD=1` only when you intentionally want to reload the service without rebuilding.
Set `FINANCE_TRACKER_SKIP_LAUNCHCTL=1` only to render and inspect the plist without loading the service.

The app will be available only on this Mac at [http://localhost:3000](http://localhost:3000).

## Private phone access with Tailscale

For on-the-go edits while your Mac is online, use Tailscale instead of exposing the app to the public internet. For Mac-offline access, use the hosted cloud path above. A compact checklist lives in [docs/phone-access-runbook.md](docs/phone-access-runbook.md).

Short decision guide:

- Mac online, private access only: Tailscale + `APP_PASSWORD`.
- Mac offline, access anywhere: hosted app + Turso/libSQL + `APP_PASSWORD`.
- Local-only use: leave `ENABLE_TAILSCALE_ACCESS` unset or `0`.

1. Install Tailscale on your Mac and phone, open the Tailscale app on both devices, and sign in to the same tailnet.
2. Run the helper and follow the prompts:

```bash
npm run phone:configure
```

This writes `APP_PASSWORD`, `ENABLE_TAILSCALE_ACCESS`, `FINANCE_TRACKER_HOSTNAME`, and `FINANCE_TRACKER_PORT` to `.env.local`.

You can also pass values directly without putting the password in chat or shell history:

```bash
read -s APP_PASSWORD
APP_PASSWORD="$APP_PASSWORD" FINANCE_TRACKER_HOSTNAME=100.x.y.z npm run phone:configure
```

3. Install or refresh the login service:

```bash
npm run phone:setup-service
```

4. Diagnose phone readiness:

```bash
npm run phone:diagnose
```

If diagnostics says `Failed to load preferences`, open or restart the Tailscale macOS app and sign in before running the check again.

If the Tailscale app shows this Mac's `100.x.y.z` address but the CLI still cannot read preferences, pass that address manually:

```bash
read -s APP_PASSWORD
APP_PASSWORD="$APP_PASSWORD" FINANCE_TRACKER_HOSTNAME=100.x.y.z npm run phone:configure
```

5. Run the phone preflight:

```bash
npm run phone:preflight
```

This prints the private URL, verifies login and protected routes, checks login rate limiting, rejects an invalid transaction date, creates one tiny manual transaction, deletes it, and confirms no test data remains.

For lower-level checks:

```bash
npm run phone:verify-access
npm run phone:verify-edit
FINANCE_TRACKER_URL=http://100.x.y.z:3000 npm run auth:verify-rate-limit
```

6. On your phone, open the printed URL and log in with `APP_PASSWORD`.

To print the phone URL without running the full verifier:

```bash
npm run phone:check
```

Keep `ENABLE_TAILSCALE_ACCESS=0` or unset unless you need phone access.

### Managing the service

```bash
# Stop
launchctl unload ~/Library/LaunchAgents/com.financetracker.app.plist

# Start
launchctl load ~/Library/LaunchAgents/com.financetracker.app.plist

# View logs
tail -f logs/stdout.log
tail -f logs/stderr.log
```

## CSV export instructions

| Bank | How to export |
|------|--------------|
| OCBC | Internet Banking → Accounts → Transaction History → Download CSV |
| DBS/POSB | digibank → Deposits → Account History → Download |
| UOB | Personal Internet Banking → Accounts → Transaction History → Export |
| Trust | Trust app → Account → Statements → Export CSV |

## Tech stack

- Next.js App Router + TypeScript
- Tailwind CSS + shadcn/ui
- SQLite/libSQL via Drizzle ORM, with optional Turso cloud database
- Recharts for charts
- Anthropic Claude Haiku for AI categorization
