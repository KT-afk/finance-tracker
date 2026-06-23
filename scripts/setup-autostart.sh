#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PLIST_NAME="com.financetracker.app.plist"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
PLIST_DEST="$LAUNCH_AGENTS_DIR/$PLIST_NAME"

echo "==> Finance Tracker Auto-start Setup"
echo "    Project: $PROJECT_DIR"

HOSTNAME_VALUE="127.0.0.1"
PORT_VALUE="3000"
NPM_BIN="${FINANCE_TRACKER_NPM_BIN:-}"
if [ -f "$PROJECT_DIR/.env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$PROJECT_DIR/.env.local"
  set +a
fi
NPM_BIN="${FINANCE_TRACKER_NPM_BIN:-$NPM_BIN}"

if [ -z "$NPM_BIN" ]; then
  if [ -x "/opt/homebrew/opt/node@24/bin/npm" ]; then
    NPM_BIN="/opt/homebrew/opt/node@24/bin/npm"
  elif command -v npm >/dev/null 2>&1; then
    NPM_BIN="$(command -v npm)"
  else
    echo "ERROR: npm not found. Install Node 24 or set FINANCE_TRACKER_NPM_BIN in .env.local."
    exit 1
  fi
fi

if [ ! -x "$NPM_BIN" ]; then
  echo "ERROR: FINANCE_TRACKER_NPM_BIN is not executable: $NPM_BIN"
  exit 1
fi
export PATH="$(dirname "$NPM_BIN"):$PATH"

if [ -n "${FINANCE_TRACKER_PORT:-}" ]; then
  PORT_VALUE="$FINANCE_TRACKER_PORT"
fi

if ! [[ "$PORT_VALUE" =~ ^[0-9]+$ ]] || [ "$PORT_VALUE" -lt 1 ] || [ "$PORT_VALUE" -gt 65535 ]; then
  echo "ERROR: FINANCE_TRACKER_PORT must be a number from 1 to 65535"
  exit 1
fi

if [ "${ENABLE_TAILSCALE_ACCESS:-}" = "1" ]; then
  if [ -z "${APP_PASSWORD:-}" ]; then
    echo "ERROR: ENABLE_TAILSCALE_ACCESS=1 requires APP_PASSWORD in .env.local"
    exit 1
  fi

  if [ -n "${FINANCE_TRACKER_HOSTNAME:-}" ]; then
    HOSTNAME_VALUE="$FINANCE_TRACKER_HOSTNAME"
  elif command -v tailscale >/dev/null 2>&1; then
    CANDIDATE_HOSTNAME="$(tailscale ip -4 2>/dev/null | head -n 1 || true)"
    if [[ "$CANDIDATE_HOSTNAME" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
      HOSTNAME_VALUE="$CANDIDATE_HOSTNAME"
    fi
  fi

  if [ -z "$HOSTNAME_VALUE" ] || [ "$HOSTNAME_VALUE" = "127.0.0.1" ]; then
    echo "ERROR: ENABLE_TAILSCALE_ACCESS=1 requires Tailscale to be running or FINANCE_TRACKER_HOSTNAME to be set"
    exit 1
  fi
fi

# 1. Build the app so launchd runs the current source.
if [ "${FINANCE_TRACKER_SKIP_BUILD:-}" = "1" ]; then
  echo "==> Skipping production build because FINANCE_TRACKER_SKIP_BUILD=1"
else
  echo "==> Building production bundle..."
  cd "$PROJECT_DIR"
  "$NPM_BIN" run build
fi

# 2. Create logs directory
mkdir -p "$PROJECT_DIR/logs"

# 3. Substitute the real project path into the plist
mkdir -p "$LAUNCH_AGENTS_DIR"
sed \
  -e "s|FINANCE_TRACKER_PATH|$PROJECT_DIR|g" \
  -e "s|FINANCE_TRACKER_NPM_BIN|$NPM_BIN|g" \
  -e "s|FINANCE_TRACKER_HOSTNAME|$HOSTNAME_VALUE|g" \
  -e "s|FINANCE_TRACKER_PORT|$PORT_VALUE|g" \
  "$PROJECT_DIR/$PLIST_NAME" > "$PLIST_DEST"

echo "==> Plist installed to: $PLIST_DEST"
echo "    npm:  $NPM_BIN"
echo "    Host: $HOSTNAME_VALUE"
echo "    Port: $PORT_VALUE"

# 4. Unload if already loaded (ignore errors)
if [ "${FINANCE_TRACKER_SKIP_LAUNCHCTL:-}" = "1" ]; then
  echo "==> Skipping launchctl load because FINANCE_TRACKER_SKIP_LAUNCHCTL=1"
else
  launchctl unload "$PLIST_DEST" 2>/dev/null || true

  # 5. Load the agent. Some launchctl failures are printed even when the command
  # exits successfully, so inspect the output as well as the status.
  LOAD_OUTPUT="$(launchctl load "$PLIST_DEST" 2>&1)" || {
    printf '%s\n' "$LOAD_OUTPUT"
    exit 1
  }
  if [ -n "$LOAD_OUTPUT" ]; then
    printf '%s\n' "$LOAD_OUTPUT"
  fi
  if [[ "$LOAD_OUTPUT" == *"Load failed"* ]]; then
    exit 1
  fi
fi

echo ""
if [ "${FINANCE_TRACKER_SKIP_LAUNCHCTL:-}" = "1" ]; then
  echo "==> Done! Launch agent plist rendered but not loaded."
else
  echo "==> Done! Finance Tracker will start at login."
fi
echo "    Open http://$HOSTNAME_VALUE:$PORT_VALUE in your browser."
echo ""
echo "    To stop:  launchctl unload ~/Library/LaunchAgents/$PLIST_NAME"
echo "    To start: launchctl load  ~/Library/LaunchAgents/$PLIST_NAME"
echo "    Logs:     $PROJECT_DIR/logs/"
