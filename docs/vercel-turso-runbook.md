# Vercel + Turso Runbook

This is the concrete hosted path for using Finance Tracker while your Mac is offline.

## 1. Create Turso Database

Create the database in Turso, then collect:

```bash
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...
```

Do not commit these values.

## 2. Migrate And Verify Database

Run from this repo:

```bash
TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npx drizzle-kit migrate
TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npm run db:verify-cloud
```

## 3. Copy Existing Local Data

Preview first:

```bash
TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npm run db:copy-cloud
```

Then copy:

```bash
TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npm run db:copy-cloud -- --confirm
```

## 4. Link Or Create Vercel Project

```bash
npx vercel login
npx vercel link
```

Use the existing repo as the project root.

## 5. Set Vercel Environment Variables

Use Vercel's encrypted env storage:

```bash
npx vercel env add TURSO_DATABASE_URL production
npx vercel env add TURSO_AUTH_TOKEN production
npx vercel env add APP_PASSWORD production
npx vercel env add ANTHROPIC_API_KEY production
```

`ANTHROPIC_API_KEY` is optional.

## 6. Deploy

```bash
npm run cloud:preflight
npx vercel --prod
```

## 7. Verify Hosted App

```bash
FINANCE_TRACKER_URL=https://your-app.vercel.app APP_PASSWORD=... npm run hosted:preflight
```

The hosted preflight verifies protected access, login rate limiting, and a reversible manual transaction edit without leaving test data behind.

## 8. Verify From Phone

Open the deployed URL on your phone, log in, and make a small edit:

- add a manual transaction, or
- update an account balance.

Refresh and confirm the edit remains visible.
