#!/usr/bin/env bash
# Stop the instance launch.sh started and remove its scratch dir. Evidence in output/verify/ stays.
set -uo pipefail
source "$(dirname "$0")/env.sh"
if [[ -f "$RUN_DIR/server.pid" ]]; then
  PID="$(cat "$RUN_DIR/server.pid")"
  for C in $(pgrep -P "$PID"); do kill "$C" 2>/dev/null; done
  kill "$PID" 2>/dev/null
  sleep 1
fi
rm -rf "$RUN_DIR"
echo "Cleaned up. Evidence kept in $EVIDENCE_DIR"
