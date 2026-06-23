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

if [ -z "${FINANCE_TRACKER_URL:-}" ]; then
  echo "FINANCE_TRACKER_URL is required, e.g. https://finance-tracker.example.com"
  exit 1
fi

if [ -z "${APP_PASSWORD:-}" ]; then
  echo "APP_PASSWORD is required to verify hosted edits."
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to verify hosted edits."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is required to verify hosted edits."
  exit 1
fi

BASE_URL="${FINANCE_TRACKER_URL%/}"
COOKIE_FILE="$(mktemp "${TMPDIR:-/tmp}/finance-tracker-edit-cookie.XXXXXX")"
BODY_FILE="$(mktemp "${TMPDIR:-/tmp}/finance-tracker-edit-body.XXXXXX")"
CREATE_FILE="$(mktemp "${TMPDIR:-/tmp}/finance-tracker-edit-create.XXXXXX")"
LIST_FILE="$(mktemp "${TMPDIR:-/tmp}/finance-tracker-edit-list.XXXXXX")"
DELETE_FILE="$(mktemp "${TMPDIR:-/tmp}/finance-tracker-edit-delete.XXXXXX")"
trap 'rm -f "$COOKIE_FILE" "$BODY_FILE" "$CREATE_FILE" "$LIST_FILE" "$DELETE_FILE"' EXIT

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

node -e '
  process.stdout.write(JSON.stringify({
    date: "2026-99-99",
    description: "Invalid hosted edit verification",
    amount: -0.01,
    bank: "ocbc",
    category: "Others"
  }))
' > "$BODY_FILE"

invalid_status="$(
  curl -sS -b "$COOKIE_FILE" -o "$CREATE_FILE" -w '%{http_code}' \
    -H 'Content-Type: application/json' \
    -d @"$BODY_FILE" \
    "$BASE_URL/api/transactions"
)"

if [ "$invalid_status" != "400" ]; then
  echo "FAIL invalid date guard: expected HTTP 400, got $invalid_status"
  cat "$CREATE_FILE"
  exit 1
fi
echo "ok reject invalid transaction date"

DESCRIPTION="Hosted edit verification $(date -u +%Y%m%d%H%M%S)"
APP_DESCRIPTION="$DESCRIPTION" node -e '
  const description = process.env.APP_DESCRIPTION
  process.stdout.write(JSON.stringify({
    date: new Date().toISOString().slice(0, 10),
    description,
    amount: -0.01,
    bank: "ocbc",
    category: "Others"
  }))
' > "$BODY_FILE"

create_status="$(
  curl -sS -b "$COOKIE_FILE" -o "$CREATE_FILE" -w '%{http_code}' \
    -H 'Content-Type: application/json' \
    -d @"$BODY_FILE" \
    "$BASE_URL/api/transactions"
)"

if [ "$create_status" != "201" ]; then
  echo "FAIL create transaction: expected HTTP 201, got $create_status"
  cat "$CREATE_FILE"
  exit 1
fi
echo "ok create manual transaction"

TRANSACTION_ID="$(
  node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(body.transaction?.id || "")' "$CREATE_FILE"
)"

if [ -z "$TRANSACTION_ID" ]; then
  echo "FAIL create transaction: response did not include transaction id"
  exit 1
fi

curl -sS -b "$COOKIE_FILE" "$BASE_URL/api/transactions?pageSize=100" > "$LIST_FILE"
FOUND="$(
  APP_DESCRIPTION="$DESCRIPTION" node -e '
    const fs=require("fs")
    const data=JSON.parse(fs.readFileSync(process.argv[1],"utf8"))
    const tx=(data.transactions || []).find(t => t.description === process.env.APP_DESCRIPTION && t.is_manual)
    process.stdout.write(tx ? "yes" : "no")
  ' "$LIST_FILE"
)"

if [ "$FOUND" != "yes" ]; then
  echo "FAIL verify create: transaction was not listed as manual"
  exit 1
fi
echo "ok verify create"

delete_status="$(
  curl -sS -b "$COOKIE_FILE" -o "$DELETE_FILE" -w '%{http_code}' \
    -X DELETE \
    "$BASE_URL/api/transactions/$TRANSACTION_ID"
)"

if [ "$delete_status" != "200" ]; then
  echo "FAIL delete transaction: expected HTTP 200, got $delete_status"
  cat "$DELETE_FILE"
  exit 1
fi
echo "ok delete manual transaction"

curl -sS -b "$COOKIE_FILE" "$BASE_URL/api/transactions?pageSize=100" > "$LIST_FILE"
FOUND_AFTER_DELETE="$(
  APP_DESCRIPTION="$DESCRIPTION" node -e '
    const fs=require("fs")
    const data=JSON.parse(fs.readFileSync(process.argv[1],"utf8"))
    const tx=(data.transactions || []).find(t => t.description === process.env.APP_DESCRIPTION)
    process.stdout.write(tx ? "yes" : "no")
  ' "$LIST_FILE"
)"

if [ "$FOUND_AFTER_DELETE" != "no" ]; then
  echo "FAIL verify delete: transaction is still listed"
  exit 1
fi
echo "ok verify delete"

echo "Hosted edit verified without leaving test data: $BASE_URL"
