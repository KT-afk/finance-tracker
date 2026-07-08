#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TSX="$ROOT/node_modules/.bin/tsx"
PASS=0
FAIL=0
ERRORS=()

run_test() {
  local name="$1"
  local file="$2"
  shift 2
  if env "$@" "$TSX" "$file"; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    ERRORS+=("$name")
  fi
}

run_test "calculations"            "$ROOT/tests/calculations.test.ts"
run_test "categorize-strict"       "$ROOT/tests/categorize-strict.test.ts"
run_test "login-attempt-store"     "$ROOT/tests/login-attempt-store.test.ts"
run_test "upload-fails-without-ai" "$ROOT/tests/upload-fails-without-ai.test.ts"
run_test "pdf-parser-may"          "$ROOT/tests/pdf-parser-may.test.ts"
run_test "balances-api-schema-compat" "$ROOT/tests/balances-api-schema-compat.test.ts"
run_test "uob-upload-confirm-flow" "$ROOT/tests/uob-upload-confirm-flow.test.ts" \
  "UOB_MAY_PDF=${UOB_MAY_PDF:-}" \
  "OCBC_MAY_PDF=${OCBC_MAY_PDF:-}"

echo ""
echo "Results: $PASS passed, $FAIL failed"

if [[ $FAIL -gt 0 ]]; then
  echo "Failed tests:"
  for name in "${ERRORS[@]}"; do
    echo "  - $name"
  done
  exit 1
fi
