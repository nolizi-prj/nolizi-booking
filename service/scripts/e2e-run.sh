#!/usr/bin/env bash
# Start a fresh local sharded stack, run the E2E, tear down cleanly.
set -u
cd "$(dirname "$0")/.."
PORT="${1:-8801}"
LOG="${TMPDIR:-/tmp}/pumasi-e2e-dev.log"

stop_all() {
  pkill -f "wrangler-dist/cli.js dev" 2>/dev/null; pkill -x workerd 2>/dev/null
  [ -f /tmp/pumasi-e2e.pid ] && kill "$(cat /tmp/pumasi-e2e.pid)" 2>/dev/null
  sleep 2
  pkill -9 -x workerd 2>/dev/null
  sleep 1
}

stop_all
rm -rf .wrangler/state
TK=$(head -c32 /dev/urandom | base64)
nohup npx wrangler dev --local --port "$PORT" \
  --var BASE_URL:"http://127.0.0.1:$PORT" \
  --var BOOTSTRAP_INVITE:inv-e2e-boot \
  --var TOKEN_KEY:"$TK" \
  --var PUBLIC_SIGNUP:true \
  --var GIT_COMMIT:e2e > "$LOG" 2>&1 &
echo $! > /tmp/pumasi-e2e.pid

for i in $(seq 1 40); do
  sleep 1
  if curl -sS -m 2 "http://127.0.0.1:$PORT/healthz" 2>/dev/null | grep -q sharded; then
    break
  fi
done

node scripts/e2e-sharded.mjs "http://127.0.0.1:$PORT"
EC=$?
stop_all
echo "dev log tail:"; tail -4 "$LOG"
exit $EC
