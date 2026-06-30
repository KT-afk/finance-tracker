#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env.local"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

BASE_URL="${FINANCE_TRACKER_URL:-${BASE_URL:-}}"
BASE_URL="${BASE_URL%/}"

if [ -z "$BASE_URL" ]; then
  echo "FINANCE_TRACKER_URL or BASE_URL is required, e.g. http://127.0.0.1:3000"
  exit 1
fi

if [ -z "${APP_PASSWORD:-}" ]; then
  echo "APP_PASSWORD is required to verify import persistence."
  exit 1
fi

if [ "${ALLOW_IMPORT_PERSISTENCE_WRITE:-}" != "1" ]; then
  echo "Refusing to write test transactions unless ALLOW_IMPORT_PERSISTENCE_WRITE=1 is set."
  echo "This verifier posts directly to /api/upload/confirm and then cleans up the inserted rows."
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to verify import persistence."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is required to verify import persistence."
  exit 1
fi

COOKIE_FILE="$(mktemp "${TMPDIR:-/tmp}/finance-tracker-import-cookie.XXXXXX")"
BODY_FILE="$(mktemp "${TMPDIR:-/tmp}/finance-tracker-import-body.XXXXXX")"
CONFIRM_FILE="$(mktemp "${TMPDIR:-/tmp}/finance-tracker-import-confirm.XXXXXX")"
LIST_FILE="$(mktemp "${TMPDIR:-/tmp}/finance-tracker-import-list.XXXXXX")"
DELETE_FILE="$(mktemp "${TMPDIR:-/tmp}/finance-tracker-import-delete.XXXXXX")"
trap 'rm -f "$COOKIE_FILE" "$BODY_FILE" "$CONFIRM_FILE" "$LIST_FILE" "$DELETE_FILE"' EXIT

json_login_body() {
  APP_PASSWORD_VALUE="$APP_PASSWORD" node -e 'process.stdout.write(JSON.stringify({ password: process.env.APP_PASSWORD_VALUE }))'
}

login_status="$(
  curl -sS -c "$COOKIE_FILE" -o /dev/null -w '%{http_code}' \
    -H 'Content-Type: application/json' \
    -d "$(json_login_body)" \
    "$BASE_URL/api/login"
)"

if [ "$login_status" != "200" ]; then
  echo "FAIL login: expected HTTP 200, got $login_status"
  exit 1
fi
echo "ok login"

RUN_ID="$(date -u +%Y%m%d%H%M%S)-$$"
IMPORT_DESCRIPTION="Import persistence verification $RUN_ID"

RUN_ID="$RUN_ID" IMPORT_DESCRIPTION="$IMPORT_DESCRIPTION" node -e '
  const runId = process.env.RUN_ID
  const description = process.env.IMPORT_DESCRIPTION
  const now = new Date().toISOString()
  process.stdout.write(JSON.stringify({
    transactions: [
      {
        id: `verify-import:${runId}:1`,
        date: "2026-05-15",
        description,
        amount: -1.23,
        bank: "uob",
        category: "Others",
        is_corrected: false,
        hash: `manual:verify-import:${runId}:1`,
        uploaded_at: now
      }
    ]
  }))
' > "$BODY_FILE"

confirm_status="$(
  curl -sS -b "$COOKIE_FILE" -o "$CONFIRM_FILE" -w '%{http_code}' \
    -H 'Content-Type: application/json' \
    -d @"$BODY_FILE" \
    "$BASE_URL/api/upload/confirm"
)"

if [ "$confirm_status" != "200" ]; then
  echo "FAIL confirm import: expected HTTP 200, got $confirm_status"
  cat "$CONFIRM_FILE"
  exit 1
fi

INSERTED="$(
  node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(String(body.inserted ?? ""))' "$CONFIRM_FILE"
)"

if [ "$INSERTED" != "1" ]; then
  echo "FAIL confirm import: expected inserted=1"
  cat "$CONFIRM_FILE"
  exit 1
fi
echo "ok confirm inserted row"

curl -sS -b "$COOKIE_FILE" "$BASE_URL/api/transactions?bank=uob&month=2026-05&page=1&pageSize=200" > "$LIST_FILE"
TRANSACTION_ID="$(
  IMPORT_DESCRIPTION="$IMPORT_DESCRIPTION" node -e '
    const fs=require("fs")
    const data=JSON.parse(fs.readFileSync(process.argv[1],"utf8"))
    const tx=(data.transactions || []).find(t => t.description === process.env.IMPORT_DESCRIPTION)
    process.stdout.write(tx?.id || "")
  ' "$LIST_FILE"
)"

if [ -z "$TRANSACTION_ID" ]; then
  echo "FAIL verify persisted import: confirmed row was not returned by /api/transactions"
  exit 1
fi
echo "ok confirmed row is queryable"

delete_status="$(
  curl -sS -b "$COOKIE_FILE" -o "$DELETE_FILE" -w '%{http_code}' \
    -X DELETE \
    "$BASE_URL/api/transactions/$TRANSACTION_ID"
)"

if [ "$delete_status" != "200" ]; then
  echo "FAIL cleanup: expected HTTP 200, got $delete_status"
  cat "$DELETE_FILE"
  exit 1
fi

curl -sS -b "$COOKIE_FILE" "$BASE_URL/api/transactions?bank=uob&month=2026-05&page=1&pageSize=200" > "$LIST_FILE"
FOUND_AFTER_DELETE="$(
  IMPORT_DESCRIPTION="$IMPORT_DESCRIPTION" node -e '
    const fs=require("fs")
    const data=JSON.parse(fs.readFileSync(process.argv[1],"utf8"))
    const tx=(data.transactions || []).find(t => t.description === process.env.IMPORT_DESCRIPTION)
    process.stdout.write(tx ? "yes" : "no")
  ' "$LIST_FILE"
)"

if [ "$FOUND_AFTER_DELETE" != "no" ]; then
  echo "FAIL cleanup: imported verification row is still listed"
  exit 1
fi
echo "ok cleanup"

echo "Import persistence verified without leaving test data: $BASE_URL"
