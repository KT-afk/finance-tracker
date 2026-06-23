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

HOSTNAME_VALUE="${FINANCE_TRACKER_HOSTNAME:-}"
if [ -z "$HOSTNAME_VALUE" ] && command -v tailscale >/dev/null 2>&1; then
  CANDIDATE_HOSTNAME="$(tailscale ip -4 2>/dev/null | head -n 1 || true)"
  if [[ "$CANDIDATE_HOSTNAME" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
    HOSTNAME_VALUE="$CANDIDATE_HOSTNAME"
  fi
fi

PORT_VALUE="${FINANCE_TRACKER_PORT:-3000}"
if [ -n "$HOSTNAME_VALUE" ]; then
  export FINANCE_TRACKER_URL="http://$HOSTNAME_VALUE:$PORT_VALUE"
fi

echo "==> Checking phone URL"
bash "$PROJECT_DIR/scripts/check-phone-access.sh"

echo ""
echo "==> Verifying private app access"
bash "$PROJECT_DIR/scripts/verify-phone-access.sh"

echo ""
echo "==> Verifying login rate limiting"
bash "$PROJECT_DIR/scripts/verify-login-rate-limit.sh"

echo ""
echo "==> Verifying reversible private edit"
bash "$PROJECT_DIR/scripts/verify-phone-edit.sh"

echo ""
echo "Phone preflight passed."
echo "Next: open the same URL from your phone while Tailscale is connected."
