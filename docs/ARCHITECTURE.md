# Architecture

How Next Grace (nextgrace.app, formerly Tarnished Ledger) is put together and how to extend it. Read this before touching the code; `ROADMAP.md` has the history and the open items, `README.md` the setup.

## In one paragraph

A static web app (no build step, plain scripts) reads an Elden Ring PC save (`ER0000.sl2`) **entirely in the browser** and renders a character sheet, inventory, smithing planner, progress tracker and an interactive map. An optional account (Steam OpenID) stores a per-character *summary* (never the save) in Cloudflare D1 so marks sync between devices, the community can propose map markers, and an "advisor" report is generated server-side with Claude. The backend is one Cloudflare Worker that serves the static files and routes `/api/*` to small handlers.

```
browser                                  Cloudflare Worker (worker/index.js)
┌──────────────────────────────┐         ┌──────────────────────────────────────┐
│ index.html  src/app.js       │  /api   │ functions/api/**  (Pages-Functions    │
│   ersave.js → parse .sl2     │ ──────▶ │   style handlers, D1 binding "DB")    │
│   rules.js  → game rules     │         │   auth (Steam OpenID) · characters    │
│   icons.js  → item pictures  │         │   marks · markers · advice · history  │
│   cloud.js  → account API    │         └───────────────┬──────────────────────┘
│ map.html   (Leaflet)         │                         │ ANTHROPIC_API_KEY
│ about.html  privacy.html     │                         ▼
│ sw.js (offline shell)        │                 Claude API (advisor report)
└──────────────────────────────┘
          ▲ data/*.json (items, flags, reqs, locations, map, places, progression)
          │ produced offline by tools/*.py, some via GitHub Actions workflows
```

## Front end

| File | Role |
|---|---|
| `index.html` | The sheet: onboarding, character picker, tabs (Status, Equipment, Inventory, Smithing, Progress, Advisor), account sheet. All CSS is inline (game-menu look). Static strings carry `data-i18n`. |
| `src/ersave.js` | Save parser (`ERSave.parse(ArrayBuffer)` → `{steamId, chars[]}`) and `ERSave.enrich(char, DB)` which resolves item ids to names/categories and builds `equipped`, `inventory`, `storage`, `spells`, `quick`, `pouch`. Also `makeFlagReader` for event flags. Read-only; works in Node too (used by tools). The save layout is documented in `ROADMAP.md`. |
| `src/rules.js` | Game knowledge as pure functions: level cost, soft caps, equipment stat bonuses, "can I use this" (`canUse`), equip load, smithing-stone costs, spirit-ash levels, rune values. Each block says where its numbers come from. **If a number on screen looks wrong, start here.** |
| `src/icons.js` | Item pictures: site icons (`icons/index.json`) plus a user-imported pack (IndexedDB). `Icons.find(item)` tries several keys (id, name slug, without affinity/level…); add a candidate there if a new naming scheme appears. |
| `src/app.js` | All UI of the sheet. `main(DB, FLAGS, REQS)` is called once the data files are loaded. Organised by tab (see the index comment at the top). State: `SAVE` (parsed file), `CUR` (character on screen), `TAB`. |
| `src/shell.js`, `src/shell.css` | The header both pages share, as one component: `Shell.mount({current, openFile, onPick, onAccount})` renders title + Steam account + menu button + the Sheet/Map row into `<div id="shell">` and appends the drawer (characters, save, language, legal) to the body; `Shell.setChars`, `Shell.setUser`, `Shell.showSaveItems`. Tokens come from each page's `:root`. |
| `src/i18n.js` | `T("Spanish text", …args)` returns the English translation when the language is `en`; the Spanish string is the key. `I18N.apply()` translates static markup. See *Adding a string*. |
| `src/glossary.js` | The "i" tips: `{ w: wiki page, es, en }` per key, used by `kvr(label, value, sub, key)` in `app.js`. |
| `src/marks.js` | Manual progress marks per character in `localStorage` (`Marks.toggle/has/all/export/import`). Synced by `cloud.js` when logged in. |
| `src/cloud.js` | Thin client for `/api/*`: `Cloud.init/user/login/logout`, `pushCharacters` (builds the **summary** with `Cloud.summarize`), `syncMarks`, `markers/proposeMarker`, `advice/adviceRefresh` (streams), `history`, `deleteAccount`. Everything works without a session; this only adds sync. |
| `map.html` | Interactive map (Leaflet over the wiki map backgrounds in `icons/map/`). Reads the last parsed save from `localStorage` (`tl.last`, `tl.cur`), shows graces/bosses/places/missing items, community markers and the user's own. Filters live in the URL hash (`#l=boss&t=main&s=todo`, `#focus=<name>`). |
| `about.html`, `privacy.html` | Credits/licences/legal and the privacy policy. Contact address in `src/site.js`. |
| `sw.js` | Service worker: caches the app shell (network-first). **Bump `VERSION` on every change to a served file**, and add new files to `SHELL`. |

The sheet and the map share state only through `localStorage`: `tl.last` (slimmed parsed save), `tl.cur` (selected slot), `tl.tab`, `tl.lang`, `tl.marks.*`.

### Data flow when a save is opened

`loadFile` → `ERSave.parse` → `prep` (enrich, resolve event flags into `c.progress`) → `showSave`/`pick` → `renderChar` (which renders every tab) → `Cloud.pushCharacters` (summary to the account) → `autoAdvice` (starts a report if the stored one is stale).

## Back end (Cloudflare Worker)

`wrangler.toml` declares the Worker (`main = worker/index.js`), the static assets (`[assets]`, with `.assetsignore` excluding code and docs), the D1 binding `DB`, the R2 binding `ICONS` and the vars (`ADVISOR_MODE`). Secrets (`ANTHROPIC_API_KEY`, `STEAM_API_KEY`, `ADMIN_EMAIL`, `ADMIN_STEAMIDS` — the moderators' SteamID64s) are set in the dashboard. Pushes to `main` deploy automatically (Workers Builds).

`worker/index.js` maps routes to modules written in the Pages Functions style (`onRequestGet/Post/Put/Delete(context)` with `context.env`, `context.params`), so they could move back to Pages unchanged:

| Route | Module | What |
|---|---|---|
| `GET /api/health` | `health.js` | bindings check |
| `GET/DELETE /api/me` | `me.js` | current user + characters / delete account |
| `GET /api/auth/steam`, `/callback`, `POST /logout` | `auth/*` | Steam OpenID; session cookie `tl_session` (token hashed in `sessions`) |
| `PUT /api/characters` | `characters.js` | upsert summaries (+ a `history` snapshot per distinct playtime) |
| `GET/PUT /api/marks/:char_key` | `marks/[char_key].js` | manual marks sync |
| `GET/POST /api/markers`, `DELETE /api/markers/:id`, `GET/POST /api/admin/markers` | `markers/*`, `admin/markers.js` | community markers with moderation (`pending/approved/rejected`) |
| `GET/POST /api/advice/:char_key` | `advice/[char_key].js` | advisor report: cached by hash(summary + lang + PROMPT_VERSION); POST streams ndjson (`{beat}`, `{progress}`, then `{advice}` or `{error}`); one job per character (`advice_jobs`, heartbeat `beat_at` every 10 s: a job silent for 40 s is dead — the Worker died with the browser that started it — and the page watching it starts a new run) |
| `GET /api/history/:char_key` | `history/[char_key].js` | snapshots for the session diary |

`GET/POST /api/advisor` and `GET/POST /api/admin/advisor` (`advisor.js`, `admin/advisor.js`) manage **advisor access** (below).

`functions/_lib.js` has `handler` (error wrapper), `json/bad`, `getUser/requireUser`, cookies and hashing. The schema is in `db/schema.sql` (+ `db/migrations/`); `history` and `advice_jobs` are created lazily by the Worker. A character belongs to the Steam account whose id is in the save (`char_key = <steamid>:<slot>`), so only that account can upload or read it.

### Advisor access (who may spend the Claude key)

Signing in with Steam is free, so a session alone must not be enough to spend the site's Anthropic key. `users.advisor` holds the state:

| state | meaning |
|---|---|
| `owner` | the Steam Web API (`IPlayerService/GetOwnedGames`, secret `STEAM_API_KEY`) says the account owns Elden Ring → enabled |
| `private` | the account's "game details" are not public, so Steam answers nothing → the tab explains how to make them public, with a re-check button and a manual request |
| `none` | public list without the game → same screen, different wording |
| `requested` / `manual` / `denied` | manual activation flow: the user leaves an e-mail (`users.contact`) and a note, a mail goes to `ADMIN_EMAIL` (binding `EMAIL`, Email Routing), moderators approve or deny from the account sheet |
| `unknown` / `unavailable` / `error` | not checked yet / no API key / Steam down → re-checked on the next `GET /api/advisor` |

`ADVISOR_MODE` (`wrangler.toml`): `closed` = only `manual` (and admins), the Steam result (`users.owns`) is just a hint for the moderator; `owners` = `owner` is enabled too. `advisorEnabled(user, env)` (`_lib.js`) is the single gate used by `/api/advice`; admins always pass. The check runs at login (`auth/callback.js`) and on demand (`functions/_steam.js`). On top of that, `advice/[char_key].js` bounds the cost: 1 h between reports per character, `DAILY_CAP` per user, `GLOBAL_DAILY_CAP` for everybody, `MAX_TOKENS`, and `characters.js` sanitizes the uploaded summary (array and string caps, 64 KB) so a fabricated character cannot inflate the prompt. Outside the code: a monthly spend limit in the Anthropic console and a Cloudflare rate-limiting rule on `/api/advice*` are the backstops.

## Data files (`data/`)

| File | Source | Regenerated by |
|---|---|---|
| `items.json` | item ids, names, categories, weights (from SaveForge's tables) + `loc` (where to find, from the wiki) | `tools/extract_db.py` (one-off), `tools/apply_locations.py` |
| `flags.json` | event-flag table (BST), graces, bosses, unique pickups, map regions | `tools/extract_flags.py` (one-off) |
| `reqs.json` | weapon/spell requirements, scaling, weight, type, skill, FP | workflow `reqs` (`tools/fetch_reqs.py`) |
| `locations.json` | where-to-find texts per item name (persistent store; fills gaps, never deletes) | workflow `locations` (`tools/fetch_locations.py`), monthly + manual |
| `overrides/*.json` | manual corrections that always win over the wiki (`locations.json`, `reqs.json`) | by hand; applied by the same tools |
| `map.json`, `places.json` | wiki map markers; item → place links derived from the location texts | workflow `map` (`tools/fetch_map.py`), `tools/build_places.py` |
| `progression.json` | curated progression table for the advisor (zones, levels, stones, bell bearings) | by hand |
| `unobtainable.json` | rules for items a playthrough can no longer obtain (`{boss}` closed after that boss, `{owns}` exclusive reward); the inventory's "No tengo" marks them (`computeGone` in `app.js`) | by hand, only documented cases |
| `user_markers.json` | legacy static community markers | by hand (superseded by D1 `markers`) |

Everything taken from eldenring.wiki.gg is CC BY-SA 4.0 (see `about.html`). `tools/wikilib.py` is the shared MediaWiki client (rate-limited, batched, with title variants and wikitext helpers). Workflow logs are committed (`tools/*_log.txt`) because Actions logs are not readable from every environment.

## Recipes

**Add a user-visible string.** Write it in Spanish inside `T("…")` (or with `data-i18n="…"` on static markup, where the key is the Spanish text) and add the English to the `EN` table in `src/i18n.js`. Placeholders are `{0}`, `{1}`. Nothing else is needed; untranslated keys fall back to Spanish.

**Add a value to the Status tab.** In `renderChar` (`src/app.js`) add a `kvr(T("Label"), value, sub, "glossaryKey")`; add `glossaryKey` to `src/glossary.js` with `w` (wiki page), `es` and `en`.

**Add a game rule or fix a number.** `src/rules.js`. Keep functions pure (character/item in, numbers out) and note the source of the value in the comment above it.

**Add a tab.** A `<button class="tab" data-t="x">` in `#tabs` and a `<section class="screen" id="s-x">` in `index.html`; a `renderX(c)` in `app.js` called from `renderChar`; `showTab` already handles the switching and the URL hash.

**Add an API route.** A module in `functions/api/…` exporting `onRequestGet`/`onRequestPost`…, registered in `ROUTES` in `worker/index.js`; a method in `src/cloud.js`. Use `requireUser` and check ownership (`char_key` prefix = steamid) for anything per character. If it needs a table, add it to `db/schema.sql` and a migration under `db/migrations/`.

**Add something to the advisor's context.** `Cloud.summarize` (what the browser uploads) → `buildContext` in `functions/api/advice/[char_key].js` (what the model sees) → bump `PROMPT_VERSION` so cached reports are regenerated.

**Refresh data from the wiki.** Actions → `reqs` / `locations` / `map` → *Run workflow* (with the repo private while it writes game art). To correct a single item, edit `data/overrides/*.json` and run `python tools/apply_locations.py` or `python tools/fetch_reqs.py --apply-only`.

**Ship a change.** Bump `VERSION` in `sw.js` if a served file changed, commit (Spanish commit messages are the convention so far), push to `main`; Workers Builds deploys.

## Local development

```
npx wrangler d1 execute DB --local --file db/schema.sql
npx wrangler dev --port 8791 --var ADVICE_MOCK:1      # ADVICE_MOCK returns the prompt context instead of calling Claude
```
To test with a logged-in user, insert a row in the local `users` table and one in `sessions` with `id = sha256(<cookie value>)`, then send `tl_session=<cookie value>`. Test saves live outside the repo (`*.sl2` is git-ignored). A quick smoke test is to open the sheet with Playwright, load a save, click through every tab in `?lang=es` and `?lang=en` and check for page errors.

## Things to know before going public

- `icons/` and `icons/map/` are FromSoftware art: never in the repo (purged from its history on 2026-11-03; `.gitignore` and the `guard` workflow keep it out). The pack lives in the private repo `nextgrace-assets`, which syncs to R2. With the `ICONS` R2 binding (`wrangler.toml`, `run_worker_first = ["/icons/*"]`) the Worker serves `/icons/*` from the bucket (`functions/_icons.js`: edge cache first, then the bucket, then the static files — `x-source: edge|r2|assets`; index built from the listing); moderators upload the pack extracted from the game from the account sheet (`PUT /api/admin/icons/<name>`), see `tools/EXTRACT.md`.
- Nothing in the save is uploaded; `Cloud.summarize` is the complete list of what leaves the browser.
- Licences and attributions are in `about.html` and `README.md`; the privacy policy in `privacy.html`; the contact address in `src/site.js`.
