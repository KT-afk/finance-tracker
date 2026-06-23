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
  echo "APP_PASSWORD is required to verify hosted access."
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to verify hosted access."
  exit 1
fi

BASE_URL="${FINANCE_TRACKER_URL%/}"
COOKIE_FILE="$(mktemp "${TMPDIR:-/tmp}/finance-tracker-hosted-cookie.XXXXXX")"
trap 'rm -f "$COOKIE_FILE"' EXIT

json_login_body() {
  if command -v node >/dev/null 2>&1; then
    APP_PASSWORD_VALUE="$APP_PASSWORD" node -e 'process.stdout.write(JSON.stringify({ password: process.env.APP_PASSWORD_VALUE }))'
    return
  fi

  local escaped
  escaped="$(printf '%s' "$APP_PASSWORD" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  printf '{"password":"%s"}' "$escaped"
}

expect_status() {
  local label="$1"
  local expected="$2"
  shift 2

  local status
  status="$(curl -sS -o /dev/null -w '%{http_code}' "$@")"
  if [ "$status" != "$expected" ]; then
    echo "FAIL $label: expected HTTP $expected, got $status"
    exit 1
  fi
  echo "ok $label"
}

expect_status "protected API requires auth" "401" "$BASE_URL/api/dashboard"

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

expect_status "authenticated dashboard" "200" -b "$COOKIE_FILE" "$BASE_URL/api/dashboard"
expect_status "transactions page" "200" -b "$COOKIE_FILE" "$BASE_URL/transactions"
expect_status "accounts page" "200" -b "$COOKIE_FILE" "$BASE_URL/accounts"
expect_status "manifest" "200" "$BASE_URL/manifest.webmanifest"

echo "Hosted access verified: $BASE_URL"
