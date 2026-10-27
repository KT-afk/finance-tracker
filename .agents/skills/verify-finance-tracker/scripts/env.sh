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

# Which pid listens on $PORT. lsof on macOS; on Linux (cloud sessions) lsof
# may not see sockets, so read /proc instead.
listen_owner() {
  local pid
  pid="$(lsof -nP -t -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | head -1)"
  if [[ -z "$pid" && -r /proc/net/tcp ]]; then
    local hex inode
    hex="$(printf '%04X' "$PORT")"
    for inode in $(awk -v p=":$hex" '$4 == "0A" && substr($2, length($2) - 4) == p { print $10 }' /proc/net/tcp /proc/net/tcp6 2>/dev/null); do
      pid="$(find /proc/[0-9]*/fd -lname "socket:\[$inode\]" 2>/dev/null | head -1 | cut -d/ -f3)"
      [[ -n "$pid" ]] && break
    done
  fi
  echo "$pid"
}

# Whether that pid has the throwaway database open
has_test_db() {
  lsof -p "$1" 2>/dev/null | grep -q "$RUN_DIR/test.db" ||
    ls -l "/proc/$1/fd" 2>/dev/null | grep -q "$RUN_DIR/test.db"
}
