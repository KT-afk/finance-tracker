#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

if [ -f "$PROJECT_DIR/.env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$PROJECT_DIR/.env.local"
  set +a
fi

if [ -z "${TURSO_DATABASE_URL:-}" ]; then
  echo "TURSO_DATABASE_URL is required."
  exit 1
fi

if [ -z "${TURSO_AUTH_TOKEN:-}" ]; then
  echo "TURSO_AUTH_TOKEN is required."
  exit 1
fi

if [ -z "${APP_PASSWORD:-}" ]; then
  echo "APP_PASSWORD is required for hosted/cloud access."
  exit 1
fi

echo "==> Verifying cloud database"
npm run db:verify-cloud

echo ""
echo "==> Previewing local-to-cloud data copy"
npm run db:copy-cloud

echo ""
echo "==> Building production app"
npm run build

echo ""
echo "Cloud preflight passed."
echo "Next: deploy the app, then run npm run hosted:preflight with FINANCE_TRACKER_URL."
