#!/usr/bin/env bash
# Run the Playwright suite (or one spec/grep) against the running instance.
# Usage: e2e.sh [playwright args], e.g. e2e.sh tests/e2e/dashboard.spec.ts
set -uo pipefail
source "$(dirname "$0")/env.sh"
cd "$ROOT"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$EVIDENCE_DIR/$STAMP"
mkdir -p "$OUT"
BASE_URL="$BASE_URL" APP_PASSWORD="$APP_PASSWORD_TEST" \
  "$ROOT/node_modules/.bin/playwright" test --output "$OUT/artifacts" "$@" 2>&1 | tee "$OUT/report.txt"
STATUS="${PIPESTATUS[0]}"
echo "Evidence: $OUT"
exit "$STATUS"
