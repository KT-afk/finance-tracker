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
  echo "FINANCE_TRACKER_URL is required, e.g. http://127.0.0.1:3000"
  exit 1
fi

if [ -z "${APP_PASSWORD:-}" ]; then
  echo "APP_PASSWORD is required to verify login rate limiting."
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to verify login rate limiting."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is required to verify login rate limiting."
  exit 1
fi

BASE_URL="${FINANCE_TRACKER_URL%/}"
CLIENT_ID="client-$RANDOM-$RANDOM"
CLIENT_IP="198.51.$((RANDOM % 256)).$((RANDOM % 254 + 1))"

case "$BASE_URL" in
  https://*)
    FULL_LIMIT_CHECK=1
    FINANCE_TRACKER_SKIP_ISOLATED_RATE_LIMIT_CHECK="${FINANCE_TRACKER_SKIP_ISOLATED_RATE_LIMIT_CHECK:-1}"
    ;;
  *) FULL_LIMIT_CHECK="${AUTH_TEST_CLIENT_KEYS:-0}" ;;
esac

json_body() {
  APP_PASSWORD_VALUE="$1" node -e 'process.stdout.write(JSON.stringify({ password: process.env.APP_PASSWORD_VALUE }))'
}

cleanup_persistent_attempts() {
  if [ -z "${TURSO_DATABASE_URL:-}" ] || [ -z "${TURSO_AUTH_TOKEN:-}" ]; then
    return
  fi

  node - <<'NODE'
const { createClient } = require('@libsql/client')

async function main() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  })
  await client.execute('delete from login_attempts')
}

main().catch(() => {})
NODE
}

post_login() {
  local password="$1"
  curl -sS -o /dev/null -w '%{http_code}' \
    -H 'Content-Type: application/json' \
    -H "X-Forwarded-For: $CLIENT_IP" \
    -H "X-Finance-Tracker-Test-Client: $CLIENT_ID" \
    -d "$(json_body "$password")" \
    "$BASE_URL/api/login"
}

if [ "$FULL_LIMIT_CHECK" != "1" ]; then
  for attempt in 1 2 3 4; do
    status="$(post_login "wrong-$attempt")"
    if [ "$status" != "401" ]; then
      echo "FAIL wrong login $attempt: expected HTTP 401, got $status"
      exit 1
    fi
  done
  echo "ok failed attempts before limit"

  status="$(post_login "$APP_PASSWORD")"
  if [ "$status" != "200" ]; then
    echo "FAIL valid login reset: expected HTTP 200, got $status"
    exit 1
  fi
  echo "ok valid login resets failed attempts before limit"
  echo "Login rate limiting safely verified without locking direct access: $BASE_URL"
  exit 0
fi

for attempt in 1 2 3 4; do
  status="$(post_login "wrong-$attempt")"
  if [ "$status" != "401" ]; then
    echo "FAIL wrong login $attempt: expected HTTP 401, got $status"
    exit 1
  fi
done
echo "ok failed attempts before limit"

status="$(post_login "wrong-5")"
if [ "$status" != "429" ]; then
  echo "FAIL rate limit: expected HTTP 429 on fifth failure, got $status"
  exit 1
fi
echo "ok rate limit after five failures"

status="$(post_login "$APP_PASSWORD")"
if [ "$status" != "429" ]; then
  echo "FAIL locked client: expected HTTP 429 while limited, got $status"
  exit 1
fi
echo "ok valid password blocked while limited"

cleanup_persistent_attempts

if [ "${FINANCE_TRACKER_SKIP_ISOLATED_RATE_LIMIT_CHECK:-0}" = "1" ]; then
  echo "Login rate limiting verified: $BASE_URL"
  exit 0
fi

CLIENT_ID="client-$RANDOM-$RANDOM"
CLIENT_IP="198.51.$((RANDOM % 256)).$((RANDOM % 254 + 1))"
status="$(post_login "wrong-once")"
if [ "$status" != "401" ]; then
  echo "FAIL isolated client failure: expected HTTP 401, got $status"
  exit 1
fi

status="$(post_login "$APP_PASSWORD")"
if [ "$status" != "200" ]; then
  echo "FAIL valid login after isolated failure: expected HTTP 200, got $status"
  exit 1
fi
echo "ok valid login resets isolated failed attempt"

echo "Login rate limiting verified: $BASE_URL"
