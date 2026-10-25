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
run_test "finance-agent"           "$ROOT/tests/finance-agent.test.ts"
run_test "agent-spending"          "$ROOT/tests/agent-spending.test.ts"
run_test "transaction-search"      "$ROOT/tests/transaction-search.test.ts"
run_test "conversation-history"    "$ROOT/tests/conversation-history.test.ts"
run_test "demo-setup-guard"        "$ROOT/tests/demo-setup-guard.test.ts"
run_test "cash-flow-semantics"     "$ROOT/tests/cash-flow-semantics.test.ts"
run_test "categorize-strict"       "$ROOT/tests/categorize-strict.test.ts"
run_test "login-attempt-store"     "$ROOT/tests/login-attempt-store.test.ts"
run_test "upload-fails-without-ai" "$ROOT/tests/upload-fails-without-ai.test.ts"
run_test "pdf-parser-may"          "$ROOT/tests/pdf-parser-may.test.ts"
run_test "trust-pdf"               "$ROOT/tests/trust-pdf.test.ts"
run_test "describe-transaction"    "$ROOT/tests/describe-transaction.test.ts"
run_test "paynow"                  "$ROOT/tests/paynow.test.ts"
run_test "wise-csv"                "$ROOT/tests/wise-csv.test.ts"
run_test "chocolate-pdf"           "$ROOT/tests/chocolate-pdf.test.ts"
run_test "incoming-transfer-recategorize" "$ROOT/tests/incoming-transfer-recategorize.test.ts"
run_test "balances-api-schema-compat" "$ROOT/tests/balances-api-schema-compat.test.ts"
run_test "owed"                    "$ROOT/tests/owed.test.ts"
run_test "insight-cache"           "$ROOT/tests/insight-cache.test.ts"
run_test "payment-alerts"          "$ROOT/tests/payment-alerts.test.ts"
run_test "payment-alert-ingest"    "$ROOT/tests/payment-alert-ingest.test.ts"
run_test "alert-reconcile"         "$ROOT/tests/alert-reconcile.test.ts"
run_test "daily-message"           "$ROOT/tests/daily-message.test.ts"
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
