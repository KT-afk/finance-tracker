#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env.local"
ok=true

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

check() {
  local ok_label="$1"
  local fail_label="${2:-$1}"
  shift
  if [ "$#" -gt 0 ]; then
    shift
  fi

  if "$@"; then
    echo "ok $ok_label"
  else
    echo "needs attention: $fail_label"
    ok=false
  fi
}

has_app_password() {
  [ -n "${APP_PASSWORD:-}" ]
}

has_valid_port() {
  local port="${FINANCE_TRACKER_PORT:-3000}"
  [[ "$port" =~ ^[0-9]+$ ]] && [ "$port" -ge 1 ] && [ "$port" -le 65535 ]
}

tailscale_cli_available() {
  command -v tailscale >/dev/null 2>&1
}

tailscale_cli_ready() {
  local candidate
  candidate="$(tailscale ip -4 2>/dev/null | head -n 1 || true)"
  [[ "$candidate" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]
}

print_tailscale_hint() {
  local output="$1"

  if [[ "$output" == *"Failed to load preferences"* ]]; then
    echo "  Hint: open the Tailscale macOS app once and sign in, then rerun this command."
    echo "  If the app is already open, quit and reopen Tailscale before checking again."
    echo "  Manual fallback: copy this Mac's 100.x Tailscale IP from the app and run:"
    echo "    FINANCE_TRACKER_HOSTNAME=100.x.y.z npm run phone:configure"
    return
  fi

  echo "  Hint: start Tailscale and sign in, or set FINANCE_TRACKER_HOSTNAME in .env.local."
}

has_private_hostname() {
  [ -n "${FINANCE_TRACKER_HOSTNAME:-}" ] || tailscale_cli_ready
}

echo "==> Finance Tracker phone access diagnostics"
echo "    Env file: $ENV_FILE"
echo ""

check "APP_PASSWORD is set" "APP_PASSWORD is missing" has_app_password
check "FINANCE_TRACKER_PORT is valid" "FINANCE_TRACKER_PORT is invalid" has_valid_port
check "Tailscale CLI is installed" "Tailscale CLI is missing" tailscale_cli_available

if tailscale_cli_available; then
  if tailscale_cli_ready; then
    echo "ok Tailscale has an IPv4 address: $(tailscale ip -4 2>/dev/null | head -n 1)"
  else
    status_output="$(tailscale status 2>&1 || true)"
    echo "needs attention: Tailscale CLI is installed but not ready"
    printf '%s\n' "$status_output" | sed 's/^/  /'
    print_tailscale_hint "$status_output"
    ok=false
  fi
else
  echo "  Install Tailscale on this Mac, then sign in."
fi

check "private hostname is available" "private hostname is missing" has_private_hostname

if [ -n "${FINANCE_TRACKER_HOSTNAME:-}" ]; then
  host="$FINANCE_TRACKER_HOSTNAME"
elif tailscale_cli_ready; then
  host="$(tailscale ip -4 2>/dev/null | head -n 1)"
else
  host=""
fi

if [ -n "$host" ]; then
  echo "Phone URL candidate: http://$host:${FINANCE_TRACKER_PORT:-3000}"
fi

echo ""
if [ "$ok" = true ]; then
  echo "Phone diagnostics passed. Next: npm run phone:preflight"
else
  echo "Phone diagnostics found setup gaps."
  echo "Next:"
  echo "  1. Run npm run phone:configure if APP_PASSWORD or FINANCE_TRACKER_HOSTNAME is missing."
  echo "     If the Tailscale CLI cannot read preferences, pass FINANCE_TRACKER_HOSTNAME manually."
  echo "  2. Run npm run phone:setup-service after changing phone access settings."
  echo "  3. Run npm run phone:preflight once the URL is available."
fi

[ "$ok" = true ]
