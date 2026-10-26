#!/usr/bin/env bash
# Build the app and start it on a fresh demo database. Prints READY when usable.
set -euo pipefail
source "$(dirname "$0")/env.sh"
cd "$ROOT"

if [[ -f "$RUN_DIR/server.pid" ]] && kill -0 "$(cat "$RUN_DIR/server.pid")" 2>/dev/null; then
  echo "An instance is already running (pid $(cat "$RUN_DIR/server.pid")). Run cleanup.sh first." >&2
  exit 1
fi
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $PORT is taken by a process this skill did not start. Set VERIFY_PORT." >&2
  exit 1
fi

rm -rf "$RUN_DIR" && mkdir -p "$RUN_DIR/app" "$EVIDENCE_DIR"
# Build and run from a copy of the working tree, so the owner's .next build,
# finance.db and .env.local are never read or replaced. Uncommitted changes
# are included.
rsync -a --exclude node_modules --exclude .next --exclude .git --exclude output \
  --exclude test-results --exclude 'finance.db*' --exclude 'backups' --exclude 'logs' \
  --exclude '.env*' "$ROOT/" "$RUN_DIR/app/"
# Turbopack rejects a node_modules symlink, so clone it (copy-on-write on APFS, near instant).
cp -cR "$ROOT/node_modules" "$RUN_DIR/app/node_modules"
cd "$RUN_DIR/app"
safe_env npm run -s db:setup-demo >"$RUN_DIR/setup.log" 2>&1 || { echo "Demo setup failed, see $RUN_DIR/setup.log" >&2; exit 1; }
safe_env npm run -s build >"$RUN_DIR/build.log" 2>&1 || { echo "Build failed, see $RUN_DIR/build.log" >&2; exit 1; }

safe_env nohup ./node_modules/.bin/next start --port "$PORT" --hostname 127.0.0.1 >"$RUN_DIR/server.log" 2>&1 &
echo $! >"$RUN_DIR/server.pid"

for _ in $(seq 1 60); do
  if curl -fs -o /dev/null "$BASE_URL/login"; then echo "READY $BASE_URL (pid $(cat "$RUN_DIR/server.pid"))"; exit 0; fi
  sleep 1
done
echo "Server did not answer within 60s, see $RUN_DIR/server.log" >&2
exit 1
