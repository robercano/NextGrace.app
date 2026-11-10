# Tests

`tests/run.sh` starts the Worker locally (wrangler 4, local D1 + R2 under `tests/.state`, advisor in mock mode, the accounts of
`tests/seed.sql`) and runs:

- `api.test.mjs` (node:test, no dependencies): health, auth, character summaries, advisor gate and mock report (with its route
  block), routes, bucket serving, the whole OAuth + MCP flow, the unobtainable rules, and that every Spanish string used in
  the pages has an English translation. Runs in CI on every push (`.github/workflows/tests.yml`).
- `ui.test.mjs` (Playwright, Chromium): the sheet, the collection pane, the inventory and the map with a route. Needs a real
  save, which is private, so it runs locally only:

```
TEST_SAVE=/path/to/ER0000.sl2 TEST_STEAMID=<the save's SteamID64> tests/run.sh
```

`TEST_STEAMID` creates a moderator account that owns the save's characters (cookie `tl_session=test-save`). Playwright has
to be installed (`npm i -g playwright && npx playwright install chromium`).

Accounts: `test-admin` (moderator, advisor enabled), `test-user` (advisor approved by hand), `test-nobody` (no access).
Add a test next to the feature it covers; keep the data tests (`data:` / `i18n:`) green, they are the cheapest guard.
