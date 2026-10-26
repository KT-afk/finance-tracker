# Shared settings for the verify-finance-tracker helpers. Sourced, not run.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
PORT="${VERIFY_PORT:-3100}"
RUN_DIR="${VERIFY_RUN_DIR:-/tmp/verify-finance-tracker}"
EVIDENCE_DIR="$ROOT/output/verify"
APP_PASSWORD_TEST="verify-password"
BASE_URL="http://127.0.0.1:$PORT"
# The real app reads .env.local and finance.db. Every helper runs the app
# with these overrides so it can only see the throwaway database.
safe_env() {
  env -u TURSO_DATABASE_URL -u TURSO_AUTH_TOKEN -u DATABASE_URL -u DATABASE_AUTH_TOKEN \
    -u ANTHROPIC_BASE_URL \
    FINANCE_DB_PATH="$RUN_DIR/test.db" \
    APP_PASSWORD="$APP_PASSWORD_TEST" \
    ANTHROPIC_API_KEY="" \
    AUTH_TEST_CLIENT_KEYS=1 \
    "$@"
}
