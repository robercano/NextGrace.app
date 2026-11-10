# Next Grace — project status and roadmap

Domain: **nextgrace.app** (Cloudflare Registrar; custom domain of the Worker; Email Routing `admin@nextgrace.app` → Rob's Gmail). The project was called "Tarnished Ledger" until 2 Nov 2026; the GitHub repo was renamed to NextGrace.app on 2 Nov 2026.

Continuity document: what exists, why it is the way it is, and what is left. Read it whole before changing anything; `README.md` covers setup and `docs/ARCHITECTURE.md` the code layout and the recipes for extending it.

## What it is

A reader for Elden Ring PC saves (`ER0000.sl2`) to prepare the next session from a phone: a character sheet in the style of the game's menus, inventory with icons, smithing planner, progress (graces, bosses, unique items), a map with what is pending, an optional Steam account to sync marks, and an "advisor" that writes a report with Claude. Private for now (Cloudflare Access); goal: public, with a community-editable map.

Owner: Rob (moderator). Developed against two of his characters: a high-level Astrologer with almost everything done and a mid-game Prophet. Interface language: Spanish or English (ES/EN toggle in the header; `?lang=en`, stored in `localStorage` `tl.lang`); item names always in English (the wiki's).

## Architecture

- **Everything in the browser** to read the save: `src/ersave.js` (parser), `src/rules.js` (game rules, pure), `src/icons.js` (item pictures), `src/app.js` (sheet UI), `map.html` (map), `src/marks.js` (manual marks, localStorage), `src/cloud.js` (account layer), `src/glossary.js` (explanations + wiki links, `es`/`en`), `src/i18n.js` (translation: Spanish strings are the keys, `T("text", …args)` with `{0}`; in HTML `data-i18n`, `data-i18n-ph`, `data-i18n-title`; `I18N.apply()` on load, `I18N.locale()` for numbers and dates). PWA (`sw.js`; bump `VERSION` on every change; currently `tl-v66`).
- **Deployment**: Cloudflare **Worker with static assets** (not Pages): `wrangler.toml` + `worker/index.js`, which routes `/api/*` to the handlers in `functions/api/**` (written in the Pages Functions shape, in case it goes back to Pages) and serves the rest as files (`html_handling = "none"`, `/` → `index.html` in the worker). `.assetsignore` excludes code, tools and docs. Automatic deploy on every push to `main` (Workers Builds, `npx wrangler deploy`). Bindings live in `wrangler.toml`: D1 `DB` (`tarnished-ledger`), R2 `ICONS`, e-mail `EMAIL`. Secrets in the dashboard: `ANTHROPIC_API_KEY`, `STEAM_API_KEY`, `ADMIN_EMAIL`, `ADMIN_STEAMIDS`.
- **Database (D1)**: `db/schema.sql` (+ `db/migrations/`). Tables: `users`, `sessions` (hashed token, cookie `tl_session` 30 days), `characters` (`char_key = <steamid>:<slot>`, JSON summary; never the .sl2), `marks` (manual marks per character), `markers` (community; `pending|approved|rejected`), `advice` and `advice_log` (advisor), `history` and `advice_jobs` (created lazily by the Worker).
- **Auth**: Steam OpenID (public identity only; name and avatar from the public profile XML, no Web API key). A character can only be synced by the Steam account that owns the save.
- **Game data**: `data/reqs.json` (requirements/scaling from the wiki; workflow `reqs`), `data/locations.json` (where-to-find texts from the wiki; workflow `locations`, monthly; applied to `items.json` `loc` by `tools/apply_locations.py`), `data/overrides/` (manual corrections that always win), `data/items.json` (4184 items, from SaveForge + ER-Save-Editor), `data/flags.json` (event-flag BST; 396 graces, 173 bosses, 318 unique items, 271 map regions), `data/places.json` + `data/map.json` (markers of the eldenring.wiki.gg interactive map, CC BY-SA 4.0), `data/progression.json` (curated table: zones, levels, soft caps, stones, bell bearings), `data/user_markers.json` (legacy static markers). Workflow logs are committed (`tools/*_log.txt`) because Actions logs cannot be read from every environment.
- **Art**: `icons/*.webp` (2858 icons from the wiki) and `icons/map/*.webp` (4K backgrounds). FromSoftware's art: private repo only; the icon workflows refuse to run on a public repo. Must be purged from the history before opening the repo.

## Save format (what was hard to find)

- BND4, header 0x300; 10 slots × (MD5 0x10 + 0x280000); UserData10 after them (active slots +0x1954, profiles +0x195E stride 0x24C: name, level +34, playtime +38; SteamID +4).
- Slot: GaItem map (0x1400 entries), PlayerGameData 0x1B0 (attributes, runes, UTF-16 name, class, keepsake, +0xBE talisman pouches, +0xBF a spirit-ash level (it went 0→3→4 while Godrick's rune stayed equipped; it was misread as the Great Rune until 2026-11-04). The equipped Great Rune is NOT in the equipment tables (slot 10 reads 0xFFFFFFFF with a rune on): it is one of the event flags 9800–9807, found by diffing a save with and without it (9800 = Godrick's, 9803 = none; 9801 seen on a character with another rune, to be identified; `src/app.js`), +0xF7 rune active, +0xF9/+0xFA flasks), equipment blocks, inventory (12-byte records), spells, quick slots and pouch (as GaItem handles), storage, 29 bytes of scalars (deaths, last grace), event flags 0x1BF99F.
- Event flags: `block = id/1000 → pos` (SaveForge's BST table); byte = pos·125 + (id%1000)/8; bit = 7 − (id%1000)%8.
- Weapon id = base·10000 + affinity·100 + level; somber max +10, normal +25.

## Decisions

- The save is never uploaded: only a summary per character (level, attributes, gear, weapons with level, stones, spells, talismans, ashes, key items, progress). `Cloud.summarize` is the complete list.
- Steam Cloud: there is no download API for third parties (ICloudService only works for your own AppID; download ids are opaque). Solution: a button that opens `store.steampowered.com/account/remotestorageapp/?appid=1245620` plus "Open .sl2". No credentials, no scraping.
- Map: MapGenie's idea (glyphs by type, filters, states), never its icons or data.
- Moderation: proposals stay pending until a moderator approves; moderators publish directly (with a checkbox to send as pending, for testing).
- Advisor: not an MCP that queries Claude, but a report the Worker generates with the API and caches in D1 (1 h between reports, 5/day; moderators unlimited). Default model `claude-opus-5-5` (`ADVICE_MODEL`; lab of 2 Nov: Opus finishes in 2.5–4.3k output tokens with clearly better reports, Sonnet 5.5 burns 8k+ thinking and often returns nothing). `ADVICE_MOCK=1` locally returns the context without spending.
- Advisor, when it runs: automatically after uploading a save whose summary changed (the browser starts it after saving the summary, only for the character on screen; switching character meanwhile queues it). Cache key = hash of summary + language + `PROMPT_VERSION` (bump it when the prompt or the context changes and the next save regenerates by itself). With the same save the button becomes "Another opinion" (asks for confirmation and sends `force: true`). One job per character at a time (`advice_jobs`; another tab sees "generating…" and polls every 5 s).
- Advisor access, mode: `ADVISOR_MODE` in `wrangler.toml`. **`closed`** (current, closed beta): only accounts a moderator approves; the gate screen asks for access (e-mail + note) and the Steam library check is shown to the moderator as a hint (`users.owns`). `owners`: every account that owns Elden Ring on Steam is enabled automatically, manual activation for the rest. The rest of the site is open to everyone once Cloudflare Access is removed.
- Advisor access (2 Nov 2026): a Steam login is free, so the right to spend the Claude key is tied to **owning Elden Ring on Steam** (Steam Web API at login) with **manual activation** as the fallback (private game list / false negative: e-mail + note, moderator queue, mail to the admin). Plus caps: global 60/day, 5/day per user, 1 h per character, `max_tokens` 8000, sanitized summaries; outside the code, an Anthropic monthly spend limit and a Cloudflare rate-limiting rule. The advisor never works without a Steam login (Elden Ring on PC is Steam-only, so nobody is excluded).
- Icons: today from the wiki (13 without a page). For the public site they are replaced by icons extracted from Rob's copy of the game (see "Public beta").

## Done (chronological)

1. Parser + sheet (status, equipment, inventory, smithing) and character picker.
2. Wiki icons (PC script + workflow), wiki links, have / don't-have filter.
3. Progress from event flags; map with graces, bosses, places, pending items by place, marker editor.
4. Redesign in the style of the game's menus; hierarchy save → character → Sheet/Map → tabs.
5. Glyphs by type on the map, place filters, visited/pending states, manual marks per character.
6. Equipped Great Rune (offset +0xBF).
7. Alpha with account: Steam OpenID, D1, marks sync, character summaries, community markers with moderation; conversion to Worker with assets.
8. Glossary with explanations and links on the sheet; moderation with the "send as pending" checkbox.
9. Progress with tappable tiles → pending/done/all lists by region and link to the filtered map (`map.html#l=boss&t=main&s=todo`); All/Pending/Done selector on the map.
10. Advisor (tab + API + migration 002); streamed answer with heartbeats; report links to the map (`#focus=`).
11. Status: "Unused upgrades" (seeds, unconsumed runes, remembrances, books/scrolls, bell bearings, gloveworts, dragon stones) and level planner (real cost per level, soft caps, runes in items). Smithing: spirit ashes with gloveworts. Progress: session diary (`history` table; snapshot per distinct playtime).
12. "Can I use it?": `tools/fetch_reqs.py` + workflow `reqs` → `data/reqs.json` (requirements, scaling, type, skill, FP/slots; 740/748 weapons). Red/yellow/orange marks (not met / two-handed only / only with equipment bonuses) in inventory, equipment and smithing, usability filter, requirements in the detail, and the advisor receives per-weapon requirements, scaling and usability.
13. English translation of the whole site (sheet, map, glossary, error messages) and of the advisor's report (`SYSTEM_EN`; cache per language).
14. Automatic advisor after uploading a new save, prompt version in the hash, "Another opinion" with confirmation, "generating" state shared between tabs.
15. Public-beta groundwork (see below): location texts from the wiki replacing Fextralife's, manual overrides, GPL-3.0 + credits/legal page, read-only notice, privacy policy and community-marker terms, account deletion, `src/rules.js`/`src/icons.js` split, `docs/ARCHITECTURE.md`, documentation in English.

## Public beta: legal review and plan (1 Nov 2026)

Inventory of what the repo contains and what Rob decided about each item. Not legal advice.

| Material | Origin and situation | Decision |
|---|---|---|
| `icons/*.webp` (2858) and `icons/map/*.webp` (4K backgrounds) | FromSoftware/Bandai Namco art, downloaded from the wiki. Realistic risk: a takedown notice (DMCA), not a lawsuit. | Extract from Rob's own copy of the game (`tools/extract_icons_game.py`, `tools/EXTRACT.md`), keep them in a **separate private repo** and serve them from the server (R2 bucket behind the Worker, fed by a workflow of the private repo). Risk accepted by Rob. "Not affiliated" notice + takedown contact. Never in the public repo or its history; the site works without icons (shows the name). |
| `items.json → loc` (3629 location texts) and `places.json` (derived) | **Fextralife** prose copied by SaveForge (`item_text_generated.go`, betrayed by "[Map Link]"). Fextralife does not license its content. | Replaced by the Location/Acquisition section of eldenring.wiki.gg (MediaWiki API, batches of 50), accepting gaps: 2599 of 2886 names (90 %) → 3765 of 4184 items with text. Repeatable workflow `locations` (fills gaps on later runs, never deletes) + manual `data/overrides/locations.json` that always wins. `reqs` uses the same scheme. Log in `tools/locations_log.txt`. |
| `reqs.json`, `map.json`, new location texts | eldenring.wiki.gg: **CC BY-SA 4.0** (checked in the wiki footer; the README used to say BY-NC-SA, a mistake). The figures are facts about the game. | Attribution on the credits page with a link to the licence; those data files are CC BY-SA 4.0. Does not affect the code or the reports. |
| `src/ersave.js`, `flags.json`, `items.json` (ids/names) | Written/extracted with SaveForge (GPL-3.0), ER-Save-Editor and EldenRing-Save-Manager as references. Leaflet BSD-2. Cinzel and EB Garamond (Google Fonts, free). | Project under **GPL-3.0** (`LICENSE`), credits to the three projects with their licences, Leaflet and fonts notices. Reading the save format by reverse engineering: risk accepted; **read-only** disclaimer (the save is never modified, the game and anti-cheat are never touched) on the start screen and on the legal page. No Elden Ring logo or typefaces. |
| User data: SteamID, name and avatar, character summaries, markers, Cloudflare logs | Rob becomes the data controller (GDPR). The character summary is sent to Anthropic for the report (never the save or the Steam identity). | Privacy page (what, why, how long, processors: Cloudflare and Anthropic, how to delete), **account and data deletion from the site**, minimal terms for community markers + takedown contact. **No analytics** → no cookie banner (session and localStorage are strictly necessary). Contact address to be chosen by Rob (`src/site.js`). Steam login uses OpenID + the public profile, not the Web API, so no "Powered by Steam" requirement. |
| `progression.json`, glossary, advisor reports, the name "Next Grace" | Our own / allowed by the API terms. | No change. |

### Tasks (one commit each, so they can be tested one by one)

1. [x] `tools/fetch_locations.py` + workflow `locations` (manual and monthly): location texts from wiki.gg into `data/locations.json`, gap log, fetch date in the file. Never deletes what exists if the wiki has no text.
2. [x] `data/overrides/locations.json` (and `reqs`): manual corrections that win over the wiki; `reqs` keeps previous entries and merges overrides (`--apply-only`).
3. [x] Run `locations` in Actions, review the log, regenerate `places.json` and retire the Fextralife texts (`apply=1` run; 0 "[Map Link]" left).
4. [x] `LICENSE` GPL-3.0 + credits/legal page (`about.html`) linked from the sheet and the map; README fixed (CC BY-SA).
5. [x] Read-only notice on the start screen.
6. [x] Privacy page (ES/EN) and community-marker terms (`privacy.html`); contact in `src/site.js`.
7. [x] Account and data deletion (`DELETE /api/me`: users, sessions, characters + history, marks, advice, advice_log; approved markers re-attributed to the placeholder user `deleted`, pending ones removed) from the account sheet.
8. [x] "Powered by Steam": not required (OpenID + public profile only); Valve trademark cited on the credits page.
9. [x] Own icons: extracted with `extract_icons_game.py` from Rob's game files (6,838 icons) → private repo `nextgrace-assets` (workflow `sync-r2`) → R2 bucket `nextgrace-assets` → served by the Worker (`functions/_icons.js`, edge cache in front; `api/admin/icons.js` for one-off uploads).
10. [x] Art purged from the whole history (`git filter-repo`, 2026-11-03: `icons/*.webp`, `icons/map/`, stray screenshots), icon workflows removed, `.gitignore` + `guard` workflow against images in `icons/`. Still to do: remove Cloudflare Access to open the site.
11. [x] All Markdown in English (`README.md`, `ROADMAP.md`, `docs/ARCHITECTURE.md`, `tools/EXTRACT.md`, `icons/README.md`; Spanish summary in `README.es.md`).
12. [x] Code structure pass for maintainers: `src/rules.js` (pure game rules, sources noted), `src/icons.js`, section index in `app.js`, file headers, `docs/ARCHITECTURE.md` with recipes.

Rob still has to: set the Anthropic spend limit and the Cloudflare rate-limiting rule on `/api/advice*`, turn on Hotlink Protection, and remove Cloudflare Access when opening. Secrets, contact address, icons: done.

## Game data extraction plan (decided 2026-11-10)

What the game's own files can give the site, in order of value (all extracted on the owner's PC from the UXM-unpacked game
with Smithbox / soulstruct; see `tools/game/README.md`; everything extracted stays in the private assets repo and is served
from R2 under `/gamedata/`, like the icons):

1. [ ] **Graces with coordinates** (`BonfireWarpParam`): every site of grace, DLC included, pinned on the map → routes can
   stop at any grace. Site side done (map merges `gamedata/graces_pos.json`, MCP `find_places` marks them pinned); waiting for the CSV.
2. [ ] **Item positions** (map `.msb` treasures + `ItemLotParam_map`): exact pin for ~2,900 items instead of the wiki's
   location text, and "picked up" by flag per item. Site side done: the map draws one marker per treasure that still holds something the character lacks (chest / ground) from `gamedata/pickups_pos.json`, skipping looted spots by flag (`progress.pickedFlags`); the places-based markers remain the fallback. Waiting for the extraction.
3. [ ] **Full equipment params** (`EquipParamWeapon`, `ReinforceParamWeapon`, `CalcCorrectGraph`, `EquipParamProtector`,
   `EquipParamAccessory`, `Magic`): exact requirements and scaling for everything incl. DLC, and a real attack-rating
   calculator for the smithing planner and the advisor.
4. [ ] **Smithing costs** (`EquipMtrlSetParam`): exact stones and runes per level and weapon type.
5. [ ] **Shops and bell bearings** (`ShopLineupParam`): where each item is bought and what each bearing unlocks.
6. [ ] **Crafting** (`EquipMtrlSetParam` + cookbooks): what the character can craft with what it carries.
7. [ ] **Game text** (`.fmg`): official Spanish names (full Spanish UI, English kept as alias for the wiki) and item
   descriptions; served from R2 like the icons.
8. [ ] **Bosses and enemies with positions** (`.msb`), DLC Scadutree / Revered Spirit Ash fragment positions.
9. [ ] **NPC quests** (`.esd` talk scripts + `.emevd` events, decompiled): per-NPC state chains from flag checks, labelled by
   hand with the dialogue text → a real quest tracker. A project of its own; after 1–3.

## Pending / ideas

- Collection / checklist (decided 2026-11-05, inspired by CyberGiant's Automatic Checklist; no new tab, no checkboxes — the save decides):
  - [x] Progress tab: "Colección" pane, one bar per collectible category (weapons, shields, armor, talismans, ashes of war, spirit ashes, sorceries, incantations) with owned / total, DLC counted apart once the save has the DLC; tapping a row opens the inventory in "No tengo" for that group.
  - [x] Inventory "No tengo": items that can no longer be obtained in this playthrough are marked ✕ (grey) with the reason in the detail and a link to hide/show them; rules in `data/unobtainable.json` (`{"boss": name}` = closed once that boss is dead, `{"owns": item}` = exclusive reward). Seeded with the documented cases (Volcano Manor contracts after Rykard, Seluvis's puppets after Astel, Bolt of Gransax after Maliketh, Millicent's choice, Alexander's shard); the Sellen/Jerren rewards were checked against a finished save and are NOT exclusive. Grow the table as cases are confirmed (DLC: Leda/Ansbach/Thiollier/Jolán choices).
  - [ ] Inventory "No tengo": collapse the big groups (armor, materials) by default and a toggle to ignore consumables.
- [x] MCP server (2026-11-07): `/mcp` with OAuth 2.1 over the Steam login (`functions/_oauth.js`, `functions/mcp.js`); read tools + route-writing tools; connections listed/revoked in the account sheet; moderators only (`MCP_BETA`). Ideas: resources (the report as a resource), prompts ("plan my hour"), per-connection scopes chosen on the consent page.
- [x] Routes on the map (2026-11-07): per-character ordered stops in D1 (`routes`), the advisor's report ends with a ```route block (PROMPT_VERSION 4) that becomes the route; map panel with numbered pins, dashed line, tick/delete, 30 s refresh; advisor tab links to it. Next: MCP tools `set_route` / `add_stop` / `mark_done` so a chat with Claude can draw it.
- [x] "Ask an AI yourself" (2026-11-06): the advisor context + report packed for the user's own chat (Open in Claude / copy); moderators only. Next: an MCP server on the Worker (OAuth via Steam login, tools: character summary, report, missing items by region, pending bosses, smithing) so claude.ai can query the live data on the user's subscription.
- [x] Google Drive sync (2026-11-05): the browser downloads the save from the user's Drive (`src/drive.js`, scope `drive.file`, Picker), checks every minute while open; moderators only (`DRIVE_BETA`) until the OAuth consent screen is verified. Roadmap: Dropbox/OneDrive the same way; a "live" badge in the header.
- [ ] DLC: Scadutree Blessing / Revered Spirit Ash levels on the sheet (they live in PlayerGameData; Elden Ring Compass reads them).
- [ ] Advisor, paid tier / bring-your-own-key: let a user paste their own Anthropic key (kept in their browser, calling Anthropic directly) to use the advisor free of charge for the site, and/or charge for the service using the site's key. Decided as the future model if the advisor is to be monetised; not now.
- [ ] Advisor: if it bothers that it is cut when the site is closed right away, move to a D1 queue + Worker cron. Wiki tool (check scaling/requirements before recommending weapons); maybe "what to do today in 1 hour".
- [ ] Confirm the Great Rune id table (values other than 0, 3 and 10).
- [ ] Map: more coordinates (only 17 of 35 main bosses have a pin; via community markers); per-item icons on community markers; boss-type filter visible in the UI (today only through the hash).
- [ ] Missing icons (name aliases) until the game-extracted pack replaces them.
- [ ] Account management: let a user withdraw an approved marker of their own.
- [ ] Location gaps: 287 names without text after the wiki runs; Claude drafts exist for 275 of them in `data/locations_draft.json` but 263 are marked "(unsure)" and are vague or wrong (e.g. Dragon Cult Prayerbook "possibly Fort Faroth"), so only the 12 sure ones are published; review the rest by hand into `data/overrides/locations.json`. Names without text after that (mostly goods: golden runes, pots, altered armor, DLC stubs); fill through monthly runs and `data/overrides/locations.json`.
- [ ] Python tools (`tools/*.py`): docstrings and log messages are still in Spanish; translate when touched.
- [ ] Optional: self-host the fonts (today they load from Google Fonts, which the privacy policy mentions).
- [ ] Public: OAuth of our own if an MCP is exposed.
- [ ] Remote MCP (`/mcp/<token>`) with the same tools, to use from the Claude app or Claude Code.
- [ ] Optional on PC: watch the .sl2 with the File System Access API to refresh without opening the file by hand.

## How to work

- Locally (`wrangler.toml` is in the repo): `npx wrangler d1 execute DB --local --file db/schema.sql` and `npx wrangler dev --port 8791 [--var ADVICE_MOCK:1]`. To test with a session, insert a user and a session into the local D1 (`sessions.id` = SHA-256 of the cookie token).
- Test saves (outside the repo, `.gitignore`): one from October with Arcano 35 and another with Arcano 44 and Godrick's rune equipped.
- Sources consulted: oisis/EldenRing-SaveForge (Go), ClayAmore/ER-Save-Editor (Rust), Ariescyn/EldenRing-Save-Manager, eldenring.wiki.gg (MediaWiki API and DataMaps).
- Commits in Spanish so far, signed as Rob; bump the service worker `VERSION` with every change to served files.
