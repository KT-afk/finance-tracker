#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Verifying hosted app access"
bash "$PROJECT_DIR/scripts/verify-hosted-access.sh"

echo ""
echo "==> Verifying hosted login rate limiting"
bash "$PROJECT_DIR/scripts/verify-login-rate-limit.sh"

echo ""
echo "==> Verifying reversible hosted edit"
bash "$PROJECT_DIR/scripts/verify-hosted-edit.sh"

echo ""
echo "Hosted preflight passed."
echo "Next: open the same URL from your phone and make a real edit."
