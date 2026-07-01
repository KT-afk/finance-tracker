#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Ensure test password is set
export APP_PASSWORD="${APP_PASSWORD:-test}"

# Check if dev server is running, if not start it
if ! curl -s http://localhost:3000 > /dev/null 2>&1; then
  echo "Starting dev server..."
  cd "$ROOT"
  npm run dev &
  DEV_PID=$!
  
  # Wait for server to be ready
  echo "Waiting for server..."
  for i in {1..30}; do
    if curl -s http://localhost:3000 > /dev/null 2>&1; then
      echo "Server is ready!"
      break
    fi
    sleep 1
  done
  
  # Run the tests
  echo "Running Playwright tests..."
  cd "$ROOT"
  npx playwright test "$@"
  
  # Clean up dev server
  kill $DEV_PID 2>/dev/null || true
else
  echo "Dev server already running, running tests..."
  cd "$ROOT"
  npx playwright test "$@"
fi
