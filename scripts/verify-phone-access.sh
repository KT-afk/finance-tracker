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

if [ -z "${APP_PASSWORD:-}" ]; then
  echo "APP_PASSWORD is not set. Add it to .env.local before verifying phone access."
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to verify phone access."
  exit 1
fi

HOSTNAME_VALUE="${FINANCE_TRACKER_HOSTNAME:-}"
if [ -z "$HOSTNAME_VALUE" ] && command -v tailscale >/dev/null 2>&1; then
  CANDIDATE_HOSTNAME="$(tailscale ip -4 2>/dev/null | head -n 1 || true)"
  if [[ "$CANDIDATE_HOSTNAME" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
    HOSTNAME_VALUE="$CANDIDATE_HOSTNAME"
  fi
fi

if [ -z "$HOSTNAME_VALUE" ]; then
  echo "Could not find a Tailscale IP. Start Tailscale or set FINANCE_TRACKER_HOSTNAME in .env.local."
  exit 1
fi

PORT_VALUE="${FINANCE_TRACKER_PORT:-3000}"
if ! [[ "$PORT_VALUE" =~ ^[0-9]+$ ]] || [ "$PORT_VALUE" -lt 1 ] || [ "$PORT_VALUE" -gt 65535 ]; then
  echo "FINANCE_TRACKER_PORT must be a number from 1 to 65535."
  exit 1
fi

BASE_URL="http://$HOSTNAME_VALUE:$PORT_VALUE"
COOKIE_FILE="$(mktemp "${TMPDIR:-/tmp}/finance-tracker-cookie.XXXXXX")"
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

expect_status "auth redirect" "307" "$BASE_URL/"
expect_status "protected API" "401" "$BASE_URL/api/dashboard"

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
expect_status "manifest" "200" "$BASE_URL/manifest.webmanifest"

echo "Phone access is reachable from this Mac: $BASE_URL"
echo "Now open the same URL from your phone while Tailscale is connected."
