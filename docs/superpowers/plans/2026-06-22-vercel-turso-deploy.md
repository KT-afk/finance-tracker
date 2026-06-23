# Vercel Turso Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy Finance Tracker so it works from a phone while the Mac is offline, using Vercel for the app and Turso/libSQL seeded from the current local finance data.

**Architecture:** The hosted Next.js app runs on Vercel and reads/writes Turso through the existing libSQL Drizzle client. A one-time migration copies the local SQLite-backed data into Turso, after which hosted phone edits persist in the cloud database.

**Tech Stack:** Next.js 16, Drizzle ORM, libSQL/Turso, Vercel, existing `APP_PASSWORD` authentication.

## Global Constraints

- Do not commit secrets from `.env.local`, Turso, Vercel, or Anthropic.
- Use the existing repo scripts before writing new deployment automation.
- Seed Turso from the current local finance data.
- Keep the current Tailscale/Mac setup working as an optional fallback.
- Treat the hosted Vercel + Turso deployment as the source of truth for Mac-offline phone edits.

---

### Task 1: Verify Local Cloud-Ready State

**Files:**
- Read: `package.json`
- Read: `docs/vercel-turso-runbook.md`
- Read: `docs/cloud-deploy-checklist.md`
- Read: `lib/db.ts`
- Read: `drizzle.config.ts`

**Interfaces:**
- Consumes: Existing local SQLite data and `.env.local` values.
- Produces: Confirmation that app scripts and cloud database config are present.

- [ ] **Step 1: Check relevant scripts exist**

Run:

```bash
cd /Users/ongkongtat/PersonalProjects/finance-tracker-latest
npm pkg get scripts.db:verify-cloud scripts.db:copy-cloud scripts.cloud:preflight scripts.hosted:preflight
```

Expected: JSON output containing commands for all four scripts.

- [ ] **Step 2: Check local app still builds enough for deployment checks**

Run:

```bash
cd /Users/ongkongtat/PersonalProjects/finance-tracker-latest
npm run build
```

Expected: production build completes. If macOS blocks a native Next binary, clear quarantine for the affected package and rerun:

```bash
cd /Users/ongkongtat/PersonalProjects/finance-tracker-latest
xattr -dr com.apple.quarantine node_modules/next node_modules/@next
npm run build
```

- [ ] **Step 3: Confirm no secret values are staged**

Run:

```bash
cd /Users/ongkongtat/PersonalProjects/finance-tracker-latest
git status --short
git diff -- .env.local
```

Expected: `.env.local` is not tracked or staged with secret values.

### Task 2: Create Or Identify Turso Database

**Files:**
- No repo files changed.

**Interfaces:**
- Consumes: A Turso account login.
- Produces: `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.

- [ ] **Step 1: Check Turso CLI availability**

Run:

```bash
cd /Users/ongkongtat/PersonalProjects/finance-tracker-latest
command -v turso || true
turso --version || true
```

Expected: Turso CLI path and version, or empty output if it must be installed.

- [ ] **Step 2: Install Turso CLI if missing**

Run:

```bash
brew install tursodatabase/tap/turso
```

Expected: install succeeds and `turso --version` prints a version.

- [ ] **Step 3: Login if needed**

Run:

```bash
turso auth login
turso auth whoami
```

Expected: browser login completes and `whoami` shows the active account.

- [ ] **Step 4: Create database if one does not already exist**

Run:

```bash
turso db list
turso db create finance-tracker
```

Expected: either an existing finance tracker database is chosen, or a new `finance-tracker` database is created.

- [ ] **Step 5: Capture database URL and token**

Run:

```bash
turso db show finance-tracker --url
turso db tokens create finance-tracker
```

Expected: copy the URL and token into the current shell only:

```bash
export TURSO_DATABASE_URL='libsql://...'
export TURSO_AUTH_TOKEN='...'
```

### Task 3: Migrate And Seed Turso From Local Data

**Files:**
- Read: `scripts/verify-cloud-db.ts`
- Read: `scripts/copy-local-db-to-cloud.ts`
- Modify local shell environment only.

**Interfaces:**
- Consumes: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, local finance data.
- Produces: Turso database with migrated schema and copied local finance data.

- [ ] **Step 1: Run cloud migrations**

Run:

```bash
cd /Users/ongkongtat/PersonalProjects/finance-tracker-latest
TURSO_DATABASE_URL="$TURSO_DATABASE_URL" TURSO_AUTH_TOKEN="$TURSO_AUTH_TOKEN" npx drizzle-kit migrate
```

Expected: Drizzle applies migrations successfully or reports that no migrations are pending.

- [ ] **Step 2: Verify required cloud tables**

Run:

```bash
cd /Users/ongkongtat/PersonalProjects/finance-tracker-latest
TURSO_DATABASE_URL="$TURSO_DATABASE_URL" TURSO_AUTH_TOKEN="$TURSO_AUTH_TOKEN" npm run db:verify-cloud
```

Expected: script passes without missing-table errors.

- [ ] **Step 3: Preview local-to-cloud copy**

Run:

```bash
cd /Users/ongkongtat/PersonalProjects/finance-tracker-latest
TURSO_DATABASE_URL="$TURSO_DATABASE_URL" TURSO_AUTH_TOKEN="$TURSO_AUTH_TOKEN" npm run db:copy-cloud
```

Expected: script prints the rows it would copy and does not mutate Turso.

- [ ] **Step 4: Confirm local-to-cloud copy**

Run:

```bash
cd /Users/ongkongtat/PersonalProjects/finance-tracker-latest
TURSO_DATABASE_URL="$TURSO_DATABASE_URL" TURSO_AUTH_TOKEN="$TURSO_AUTH_TOKEN" npm run db:copy-cloud -- --confirm
```

Expected: script copies local finance data into Turso and exits successfully.

- [ ] **Step 5: Run combined cloud preflight**

Run:

```bash
cd /Users/ongkongtat/PersonalProjects/finance-tracker-latest
TURSO_DATABASE_URL="$TURSO_DATABASE_URL" TURSO_AUTH_TOKEN="$TURSO_AUTH_TOKEN" APP_PASSWORD="$APP_PASSWORD" npm run cloud:preflight
```

Expected: cloud DB verification, copy preview, and production build pass.

### Task 4: Deploy Vercel App

**Files:**
- Read: `docs/vercel-turso-runbook.md`
- Vercel project metadata may be created by the Vercel CLI.

**Interfaces:**
- Consumes: Vercel account login, Turso env vars, `APP_PASSWORD`, optional `ANTHROPIC_API_KEY`.
- Produces: Production Vercel deployment URL.

- [ ] **Step 1: Check Vercel CLI availability**

Run:

```bash
cd /Users/ongkongtat/PersonalProjects/finance-tracker-latest
npx vercel --version
```

Expected: Vercel CLI prints a version.

- [ ] **Step 2: Login and link project**

Run:

```bash
cd /Users/ongkongtat/PersonalProjects/finance-tracker-latest
npx vercel login
npx vercel link
```

Expected: browser login completes and the local repo is linked to a Vercel project.

- [ ] **Step 3: Add production environment variables**

Run each command and paste the matching value when prompted:

```bash
cd /Users/ongkongtat/PersonalProjects/finance-tracker-latest
npx vercel env add TURSO_DATABASE_URL production
npx vercel env add TURSO_AUTH_TOKEN production
npx vercel env add APP_PASSWORD production
npx vercel env add ANTHROPIC_API_KEY production
```

Expected: Vercel stores all required variables. `ANTHROPIC_API_KEY` may be skipped if AI insights are not needed on hosted.

- [ ] **Step 4: Deploy production**

Run:

```bash
cd /Users/ongkongtat/PersonalProjects/finance-tracker-latest
npx vercel --prod
```

Expected: Vercel returns a production URL such as `https://finance-tracker-....vercel.app`.

### Task 5: Verify Hosted Editing

**Files:**
- Read: `scripts/hosted-preflight.sh`
- Read: `scripts/verify-hosted-access.sh`
- Read: `scripts/verify-hosted-edit.sh`

**Interfaces:**
- Consumes: `FINANCE_TRACKER_URL` and `APP_PASSWORD`.
- Produces: Verified hosted login and reversible hosted write.

- [ ] **Step 1: Run hosted preflight**

Run:

```bash
cd /Users/ongkongtat/PersonalProjects/finance-tracker-latest
FINANCE_TRACKER_URL='https://your-vercel-url.vercel.app' APP_PASSWORD="$APP_PASSWORD" npm run hosted:preflight
```

Expected: protected access, rate limiting, and reversible hosted edit pass.

- [ ] **Step 2: Verify from phone**

Open on phone:

```text
https://your-vercel-url.vercel.app/login
```

Expected: login succeeds with `APP_PASSWORD`; adding and deleting a small manual transaction works after refresh.

- [ ] **Step 3: Record final URL**

Update the user-facing runbook or final notes with:

```text
Hosted phone URL: https://your-vercel-url.vercel.app/login
Mac/Tailscale fallback URL: http://100.70.146.63:3000/login
```

Expected: user has both hosted and local fallback URLs.

## Self-Review

- Spec coverage: the plan covers Vercel hosting, Turso/libSQL database creation, local data copy, env vars, deployment, and phone verification.
- Placeholder scan: no `TBD` or incomplete implementation instructions remain; commands include exact working directory and expected outcomes.
- Type consistency: no new code interfaces are introduced; the plan uses existing repo scripts and environment variable names consistently.
