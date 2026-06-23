#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env.local"

ensure_env_file() {
  if [ ! -f "$ENV_FILE" ]; then
    if [ -f "$PROJECT_DIR/.env.local.example" ]; then
      cp "$PROJECT_DIR/.env.local.example" "$ENV_FILE"
    else
      touch "$ENV_FILE"
    fi
  fi
}

set_env_value() {
  local key="$1"
  local value="$2"
  local escaped_line tmp_file

  escaped_line="${key}=$(shell_quote "$value")"
  tmp_file="$(mktemp "${TMPDIR:-/tmp}/finance-tracker-env.XXXXXX")"

  awk -v key="$key" -v line="$escaped_line" '
    BEGIN { done = 0 }
    $0 ~ "^[#[:space:]]*" key "=" {
      if (!done) {
        print line
        done = 1
      }
      next
    }
    { print }
    END {
      if (!done) {
        print ""
        print line
      }
    }
  ' "$ENV_FILE" > "$tmp_file"

  mv "$tmp_file" "$ENV_FILE"
}

shell_quote() {
  local value="$1"
  printf "'%s'" "${value//\'/\'\\\'\'}"
}

detect_tailscale_ip() {
  if command -v tailscale >/dev/null 2>&1; then
    local candidate
    candidate="$(tailscale ip -4 2>/dev/null | head -n 1 || true)"
    if [[ "$candidate" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
      printf '%s\n' "$candidate"
    fi
  fi
}

ensure_env_file

echo "==> Configure Finance Tracker phone access"
echo "    Env file: $ENV_FILE"
echo ""

APP_PASSWORD_INPUT="${APP_PASSWORD:-}"
if [ -n "$APP_PASSWORD_INPUT" ]; then
  echo "Using APP_PASSWORD from the current shell environment."
else
  read -r -s -p "Choose an app password: " APP_PASSWORD_INPUT
  echo ""
fi

if [ -z "$APP_PASSWORD_INPUT" ]; then
  echo "ERROR: app password cannot be empty"
  exit 1
fi

if [[ "$APP_PASSWORD_INPUT" == *$'\n'* || "$APP_PASSWORD_INPUT" == *$'\r'* ]]; then
  echo "ERROR: app password cannot contain newlines"
  exit 1
fi

DETECTED_HOSTNAME="$(detect_tailscale_ip)"
DEFAULT_HOSTNAME="${DETECTED_HOSTNAME:-100.x.y.z}"

HOSTNAME_VALUE="${FINANCE_TRACKER_HOSTNAME:-}"
if [ -n "$HOSTNAME_VALUE" ]; then
  echo "Using FINANCE_TRACKER_HOSTNAME from the current shell environment."
else
  read -r -p "Tailscale IP [$DEFAULT_HOSTNAME]: " HOSTNAME_INPUT
  HOSTNAME_VALUE="${HOSTNAME_INPUT:-$DEFAULT_HOSTNAME}"
fi

if [ "$HOSTNAME_VALUE" = "100.x.y.z" ]; then
  echo "ERROR: set a real Tailscale IP or start Tailscale before continuing"
  exit 1
fi

PORT_VALUE="${FINANCE_TRACKER_PORT:-}"
if [ -n "$PORT_VALUE" ]; then
  echo "Using FINANCE_TRACKER_PORT from the current shell environment."
else
  read -r -p "Port [3000]: " PORT_INPUT
  PORT_VALUE="${PORT_INPUT:-3000}"
fi

if ! [[ "$PORT_VALUE" =~ ^[0-9]+$ ]] || [ "$PORT_VALUE" -lt 1 ] || [ "$PORT_VALUE" -gt 65535 ]; then
  echo "ERROR: port must be a number from 1 to 65535"
  exit 1
fi

set_env_value "APP_PASSWORD" "$APP_PASSWORD_INPUT"
set_env_value "ENABLE_TAILSCALE_ACCESS" "1"
set_env_value "FINANCE_TRACKER_HOSTNAME" "$HOSTNAME_VALUE"
set_env_value "FINANCE_TRACKER_PORT" "$PORT_VALUE"

echo ""
echo "==> Phone access settings saved."
echo "    URL: http://$HOSTNAME_VALUE:$PORT_VALUE"
echo ""
echo "Next:"
echo "  npm run phone:setup-service"
echo "  npm run phone:preflight"
