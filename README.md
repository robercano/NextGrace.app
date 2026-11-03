# Next Grace

**https://nextgrace.app** (private beta behind Cloudflare Access for now). Formerly "Tarnished Ledger".

A reader for Elden Ring PC saves (`ER0000.sl2`) that runs entirely in the browser: character status, equipment, inventory, smithing planner, progress tracker, interactive map and an AI "advisor" for your next session. Built to be used from a phone between sessions.

The save is parsed in the browser and **never uploaded, never modified**. Optionally you can sign in with Steam to keep your manual marks and a per-character summary in your account (Cloudflare D1), propose markers to the community map (moderated) and get the advisor's report.

Interface in Spanish and English (ES/EN button in the header, or `?lang=en`). Item, boss and place names stay in English, as on the wiki.

*¿Prefieres leerlo en español? Hay un resumen en [README.es.md](README.es.md).*

## Layout

```
index.html            the sheet (UI + styles)        map.html   interactive map       about.html / privacy.html  legal
src/ersave.js         .sl2 parser (BND4 header, 10 slots, GaItem map, inventory, storage, equipment)
src/rules.js          game rules: level cost, requirements & stat bonuses, equip load, stone costs…
src/icons.js          item pictures (site pack + user pack in IndexedDB)
src/app.js            UI of the sheet                src/i18n.js   T() and the English table
src/marks.js          manual marks (localStorage)    src/cloud.js  optional account layer
src/glossary.js       the "i" tips                   src/site.js   contact address
functions/api/        the API (Pages-Functions style handlers): Steam OpenID, characters, marks, markers, advisor, history
worker/index.js       Worker entry: /api/* → functions, everything else → static assets
db/schema.sql         D1 schema (+ db/migrations/)
wrangler.toml         Worker config (assets, D1 binding `DB`, var `ADMIN_STEAMIDS`); .assetsignore keeps code and docs out
data/                 game data (see docs/ARCHITECTURE.md): items, flags, requirements, locations, map, progression
icons/                no art here: served from R2 (see icons/README.md)
tools/                scripts that build data/ (wiki fetchers, extractors) and the icon tools
sw.js, manifest.*     PWA: "add to home screen", works offline
```

`docs/ARCHITECTURE.md` explains how the pieces fit and has recipes for extending them. `ROADMAP.md` has the project history, the save format notes and the open items.

## Deploy (Cloudflare Worker + static assets)

The site is deployed as a **Cloudflare Worker with static assets** (`wrangler.toml`): `worker/index.js` routes `/api/*` to the handlers in `functions/api/**` and serves the rest as files. The site works without an account; to enable Steam login and the database:

1. **Create the database**: Cloudflare dashboard → *Storage & Databases → D1 SQL Database → Create* → name `tarnished-ledger`. In the *Console* tab paste `db/schema.sql` and run it.
2. **Put its id in `wrangler.toml`**: the database page shows *Database ID* (a UUID); replace `REPLACE_WITH_D1_DATABASE_ID`. Bindings live in `wrangler.toml` (not in the dashboard): every deploy applies them.
3. **Moderators**: `ADMIN_STEAMIDS` in `wrangler.toml` (SteamID64, comma-separated). Their markers are published directly and they see the queue under *Account → Moderation*.
4. **Deploy**: push to `main` (Workers Builds runs `npx wrangler deploy`) or run `npx wrangler deploy` locally. Check `https://<worker>.workers.dev/api/health` → `{"ok":true,"db":true,"admins":true,…}`.
5. **Private preview** (optional): *Zero Trust → Access → Applications → Add → Self-hosted* with your e-mail and a one-time PIN. Steam login is independent of Access; remove the Access application to open the site.

What the account stores: public Steam identity (SteamID, name, avatar), a summary per character (level, class, playtime, attributes, gear, progress, ids of the items you own; never the `.sl2`), your manual marks, the markers you propose and the advisor's reports. A character belongs to the Steam account that owns the save (`char_key = <steamid>:<slot>`), so nobody can sync marks of someone else's character. Users can delete their account and all its data from the account sheet.

API: `GET|DELETE /api/me`, `PUT /api/characters`, `GET|PUT /api/marks/:char_key`, `GET|POST /api/markers`, `DELETE /api/markers/:id`, `GET|POST /api/admin/markers`, `GET|POST /api/advice/:char_key`, `GET /api/history/:char_key`, `GET /api/auth/steam` → `/api/auth/callback`, `POST /api/auth/logout`, `GET /api/health`. Session: cookie `tl_session` (HttpOnly, 30 days; only its hash is stored). Handlers follow the Pages Functions shape, so the same code works if the project is deployed as Pages (`functions/` folder).

Local development with the API (local D1 under `.wrangler/`):

```
npx wrangler d1 execute DB --local --file db/schema.sql
npx wrangler dev --port 8791
```

Without the API any static server works (`python -m http.server 8080`). When you change served files, bump `VERSION` in `sw.js` so installed clients refresh their cache.

## Advisor (report written by Claude)

*Advisor* tab of the sheet: the Worker calls the Claude API with the character summary (the same thing the account stores: attributes, weapons and stones, bosses and graces, never the `.sl2`) plus `data/progression.json` (an indicative table of zones, levels and stones), and stores the report in D1 (`advice`). The report is generated automatically when you open a newer save while signed in (as soon as the summary is saved; you can keep browsing meanwhile). If the save hasn't changed, *Another opinion* asks for a new version (with a confirmation: same context, only the wording changes). Limits: 1 h between reports and 5 per day per user (moderators are unlimited). When the prompt changes, bump `PROMPT_VERSION` in the handler so stored reports count as stale. Code: `functions/api/advice/[char_key].js`.

Enable it:
1. Run `db/migrations/002_advice.sql` in the D1 *Console* (the full `schema.sql` includes it too).
2. *Worker → Settings → Variables and secrets → Add → Secret*: `ANTHROPIC_API_KEY` with a key from [console.anthropic.com](https://console.anthropic.com/). Optional: variable `ADVICE_MODEL` (default `claude-opus-5-5`; Sonnet 5.5 needs a 16k token budget and often returns nothing, see `tools/lab/results`).
3. **Who may use it**: only Steam accounts that own Elden Ring (checked at login with the Steam Web API) or accounts a moderator activates by hand. Create a key at https://steamcommunity.com/dev/apikey (domain: your site) and add it as the secret `STEAM_API_KEY`; without it everybody gets the manual-request screen. Optional secret `ADMIN_EMAIL` (a verified Email Routing destination) to be e-mailed about activation requests (binding `EMAIL` in `wrangler.toml`). Caps: 1 h per character, 5 reports/day per user, 60/day for everybody (`functions/api/advice/[char_key].js`). Set a monthly spend limit in the Anthropic console and a rate-limiting rule on `/api/advice*` in Cloudflare as backstops.
4. Locally, `npx wrangler dev --var ADVICE_MOCK:1` returns a fake report with the context that would be sent to the model (field `ctx`), handy to review the prompt without spending.

## Map

`map.html` uses the markers of the [eldenring.wiki.gg](https://eldenring.wiki.gg) interactive map (`tools/fetch_map.py` → `data/map.json`, CC BY-SA 4.0) and places every item you are missing at the place named in its location text (`tools/build_places.py` → `data/places.json`). Markers you add are kept in your browser and, when signed in, sent to the community map (visible to everyone once a moderator approves them). The map backgrounds (`icons/map/*.webp`) are game art, served from R2 like the icons (never committed).

## Game data from the wiki

`data/reqs.json` (requirements, scaling, weights) and the item location texts (`data/locations.json` → `loc` in `data/items.json`) come from eldenring.wiki.gg through the `reqs` and `locations` workflows (Actions → *Run workflow*; `locations` also runs monthly). Each run fills gaps and updates texts but never deletes what the wiki no longer returns; manual corrections go in `data/overrides/` and always win. The run logs are committed to `tools/*_log.txt`.

## Icons

See `icons/README.md`. The pictures are extracted from the owner's copy of the game (`tools/EXTRACT.md`), kept in the private repo `nextgrace-assets` and served by the Worker from the R2 bucket (`icons/index.json` is built from the bucket). The page can also use a pack loaded with the *Load icons* button (kept in the browser's IndexedDB).

## Language

Spanish strings are the translation keys: write new text in Spanish inside `T()` (or with `data-i18n` in the HTML) and add the English to the `EN` table in `src/i18n.js`.

## Licence and credits

Code under GPL-3.0 (`LICENSE`). Data derived from [eldenring.wiki.gg](https://eldenring.wiki.gg) (`data/reqs.json`, `data/locations.json`, `data/map.json`, `data/places.json`) under CC BY-SA 4.0. Item names, ids and event flags extracted with [oisis/EldenRing-SaveForge](https://github.com/oisis/EldenRing-SaveForge) (GPL-3.0); the save format was also studied with [ClayAmore/ER-Save-Editor](https://github.com/ClayAmore/ER-Save-Editor) and [Ariescyn/EldenRing-Save-Manager](https://github.com/Ariescyn/EldenRing-Save-Manager). `about.html` carries every attribution, the not-affiliated notice and the read-only notice; the contact address for takedowns and privacy requests is set in `src/site.js`. Fan project, not affiliated with FromSoftware or Bandai Namco; ELDEN RING is their trademark.
