#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Load .env.test if present — only sets vars not already in the environment
if [[ -f "$ROOT/.env.test" ]]; then
  while IFS='=' read -r key value; do
    # Skip comments and blank lines
    [[ "$key" =~ ^#.*$ || -z "$key" ]] && continue
    # Strip surrounding quotes from value
    value="${value%\'}"
    value="${value#\'}"
    value="${value%\"}"
    value="${value#\"}"
    # Only export if not already set
    if [[ -z "${!key+x}" ]]; then
      export "$key"="$value"
    fi
  done < "$ROOT/.env.test"
fi

exec "$ROOT/node_modules/.bin/playwright" test "$@"
