#!/usr/bin/env bash
# Runs the test suite against a local Worker (wrangler 4, local D1 + R2 under tests/.state):
#   tests/api.test.mjs   API, advisor (mock), routes, OAuth + MCP, data integrity  — always
#   tests/ui.test.mjs    the pages in a browser (Playwright)                        — only when a save is at hand:
#                        TEST_SAVE=path/to/ER0000.sl2 (saves are private: never committed) and TEST_STEAMID=<the save's
#                        SteamID64> so the test account owns its characters (cookie tl_session=test-save)
# Usage: tests/run.sh            (needs node 20+, npx; installs wrangler@4 on first use)
set -euo pipefail
cd "$(dirname "$0")/.."
STATE=tests/.state; rm -rf "$STATE"; mkdir -p "$STATE"
PORT=${PORT:-8797}
WR=${WRANGLER:-"npx --yes wrangler@4"}
export NO_D1_WARNING=true WRANGLER_SEND_METRICS=false
$WR d1 execute DB --local --persist-to "$STATE" --file db/schema.sql >/dev/null
$WR d1 execute DB --local --persist-to "$STATE" --file tests/seed.sql >/dev/null
if [ -n "${TEST_STEAMID:-}" ]; then
  H=$(node -e 'console.log(require("crypto").createHash("sha256").update("test-save").digest("hex"))')
  $WR d1 execute DB --local --persist-to "$STATE" --command "INSERT OR REPLACE INTO users (steamid, name, role, advisor) VALUES ('$TEST_STEAMID', 'Save owner', 'admin', 'owner'); INSERT OR REPLACE INTO sessions (id, steamid, expires_at) VALUES ('$H', '$TEST_STEAMID', datetime('now', '+1 day'));" >/dev/null
fi
$WR r2 object put nextgrace-assets/gamedata/graces_pos.json --file tests/fixtures/graces_pos.json --local --persist-to "$STATE" >/dev/null
$WR dev --local --port "$PORT" --persist-to "$STATE" --var ADVICE_MOCK:1 --var ADMIN_STEAMIDS:76561198000000001,${TEST_STEAMID:-0} --var ADVISOR_MODE:closed >"$STATE/wrangler.log" 2>&1 &
WPID=$!
trap 'kill $WPID 2>/dev/null; pkill -P $WPID 2>/dev/null || true' EXIT
for i in $(seq 1 90); do curl -sf -m 2 -o /dev/null "http://127.0.0.1:$PORT/api/health" && break; sleep 1; done
curl -sf -m 5 "http://127.0.0.1:$PORT/api/health" >/dev/null || { echo "worker did not start:"; tail -30 "$STATE/wrangler.log"; exit 1; }
export BASE="http://127.0.0.1:$PORT"
node --test tests/api.test.mjs
if [ -n "${TEST_SAVE:-}" ] && [ -f "$TEST_SAVE" ]; then node --test tests/ui.test.mjs; else echo "ui tests skipped (set TEST_SAVE=path/to/ER0000.sl2)"; fi
