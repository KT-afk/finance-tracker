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
  echo "APP_PASSWORD is not set. Add it to .env.local before using phone access."
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

echo "Phone URL: http://$HOSTNAME_VALUE:$PORT_VALUE"
echo "Use APP_PASSWORD to log in."
