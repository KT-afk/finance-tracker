# Cloud Deployment Checklist

Use this path when the app must work while your Mac is offline.

For a Vercel-specific command sequence, see [vercel-turso-runbook.md](vercel-turso-runbook.md).

## 1. Create Cloud Database

Create a Turso/libSQL database and collect:

```bash
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...
```

## 2. Migrate Schema

```bash
TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npx drizzle-kit migrate
TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npm run db:verify-cloud
```

You can also run the preflight before deployment:

```bash
TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... APP_PASSWORD=... npm run cloud:preflight
```

This verifies the cloud DB, previews the data copy, and builds the app.

## 3. Copy Existing Local Data

First preview:

```bash
TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npm run db:copy-cloud
```

Then copy:

```bash
TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npm run db:copy-cloud -- --confirm
```

## 4. Deploy App

Deploy the Next.js app to a Node-compatible host such as Vercel.

Set these production environment variables:

```bash
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...
APP_PASSWORD=...
ANTHROPIC_API_KEY=... # optional
```

## 5. Verify Hosted Access

```bash
FINANCE_TRACKER_URL=https://your-app.example.com APP_PASSWORD=... npm run hosted:preflight
```

## 6. Verify Phone Edit

On your phone, open the deployed URL, log in, and make a small real edit:

- add a manual transaction, or
- update an account balance.

The goal is complete only after this phone edit is visible when you refresh.

You can also run a reversible hosted write check before the phone test:

```bash
FINANCE_TRACKER_URL=https://your-app.example.com APP_PASSWORD=... npm run hosted:verify-edit
FINANCE_TRACKER_URL=https://your-app.example.com APP_PASSWORD=... npm run auth:verify-rate-limit
```
