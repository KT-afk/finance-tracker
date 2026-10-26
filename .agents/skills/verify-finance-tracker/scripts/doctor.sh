#!/usr/bin/env bash
# Read-only check: is this instance ours, logged-in usable, and on the test database?
set -uo pipefail
source "$(dirname "$0")/env.sh"
fail() { echo "DOCTOR FAIL: $1" >&2; exit 1; }

[[ -f "$RUN_DIR/server.pid" ]] || fail "no instance started by launch.sh"
PID="$(cat "$RUN_DIR/server.pid")"
kill -0 "$PID" 2>/dev/null || fail "server pid $PID is not running"
OWNER="$(lsof -nP -t -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | head -1)"
[[ -n "$OWNER" ]] || fail "nothing listens on $PORT"
pgrep -P "$PID" | grep -qx "$OWNER" || [[ "$OWNER" == "$PID" ]] || fail "port $PORT is owned by pid $OWNER, not our server $PID"

JAR="$(mktemp)"
CODE="$(curl -s -o /dev/null -w '%{http_code}' -c "$JAR" -H 'content-type: application/json' \
  -H 'x-finance-tracker-test-client: doctor' -d "{\"password\":\"$APP_PASSWORD_TEST\"}" "$BASE_URL/api/login")"
[[ "$CODE" == "200" ]] || fail "login returned $CODE"
COUNT="$(curl -fsS -b "$JAR" "$BASE_URL/api/transactions" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log((Array.isArray(j)?j:j.transactions??[]).length)})')"
rm -f "$JAR"
[[ "$COUNT" -gt 0 ]] || fail "logged in but no demo transactions"
lsof -p "$OWNER" 2>/dev/null | grep -q "$RUN_DIR/test.db" || fail "server does not have $RUN_DIR/test.db open (wrong database?)"
echo "DOCTOR OK: pid $OWNER on $BASE_URL, test.db, $COUNT transactions"
