# Finance Tracker

Personal finance tracker for Singapore bank accounts (OCBC, DBS/POSB, UOB, Trust).
Runs locally on your Mac — data never leaves your machine.

## Features

- Upload CSV exports from OCBC, DBS/POSB, UOB, and Trust Bank
- Automatic categorization via keyword rules + Claude Haiku AI
- Home dashboard: monthly spend, top categories, recent transactions
- Transactions list: filter by month/category/bank, inline category correction
- Insights: month-over-month comparison, 6-month trend chart, biggest transactions
- Deduplication: re-uploading the same CSV is safe
- Dark OLED UI, mobile-accessible over home Wi-Fi

## Setup

### 1. Install system dependencies

**Node.js** (v18+) — via [nvm](https://github.com/nvm-sh/nvm) or [Homebrew](https://brew.sh):

```bash
brew install node
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

Edit `.env.local` and add your Anthropic API key (optional — without it, unknown merchants are categorised as "Others", the app still works fully):

```
ANTHROPIC_API_KEY=sk-ant-...
```

### 4. Run the database migration

Creates `finance.db` with all tables:

```bash
npx drizzle-kit migrate
```

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
1. Build the production bundle (if not already built)
2. Install a launchd agent to `~/Library/LaunchAgents/`
3. Start the app immediately

The app will be available at [http://localhost:3000](http://localhost:3000) (also accessible from other devices on your home Wi-Fi at `http://<your-mac-ip>:3000`).

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

- Next.js 14 App Router + TypeScript
- Tailwind CSS + shadcn/ui
- SQLite via better-sqlite3 + Drizzle ORM
- Recharts for charts
- Anthropic Claude Haiku for AI categorization
