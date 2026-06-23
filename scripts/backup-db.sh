#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

if [ -f "$PROJECT_DIR/.env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$PROJECT_DIR/.env.local"
  set +a
fi

expand_path() {
  local value="$1"
  if [[ "$value" == "~/"* ]]; then
    printf '%s/%s' "$HOME" "${value#~/}"
  else
    printf '%s' "$value"
  fi
}

DB_PATH="$(expand_path "${FINANCE_DB_PATH:-$PROJECT_DIR/finance.db}")"
BACKUP_DIR="$(expand_path "${FINANCE_BACKUP_DIR:-$PROJECT_DIR/backups}")"

if [ ! -f "$DB_PATH" ]; then
  echo "Database not found: $DB_PATH"
  exit 1
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "sqlite3 is required to create a safe backup."
  exit 1
fi

mkdir -p "$BACKUP_DIR"

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_PATH="$BACKUP_DIR/finance-$STAMP.db"

sqlite3 "$DB_PATH" ".backup '$BACKUP_PATH'"

echo "Backup created: $BACKUP_PATH"
