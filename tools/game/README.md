# Game data extraction (positions of graces and items)

The game's own files give what the wiki map lacks: the position of every site of grace and of every item lying in the world.
Everything runs on the PC that has the game unpacked with UXM (see `tools/EXTRACT.md`). Like the icons, what comes out of the
game stays out of the public repo: the scripts write to the private assets repo (`../nextgrace-assets/gamedata/`, or the folder
in `NEXTGRACE_ASSETS`), its `sync-r2` workflow uploads `gamedata/` to the bucket, and the Worker serves `/gamedata/*.json` from
there (`functions/_icons.js`). Only `data/overrides/map_anchors.json` (hand-made anchors) lives here.

## 1. Graces (10 minutes)

1. Smithbox → *Param Editor* → `BonfireWarpParam` → *Export* → *CSV* → *All rows* → save as `BonfireWarpParam.csv`.
2. `py tools\game\graces_from_param.py BonfireWarpParam.csv` → `gamedata/graces_world.json` (positions in game coordinates).
3. `py tools\game\calibrate_map.py` → fits each map frame against the graces the wiki map already places and writes
   `gamedata/graces_pos.json` (pixels + layer). Read the report: a frame with fewer than 3 anchors is skipped; add anchors by
   hand in `data/overrides/map_anchors.json` (`{"Grace name": {"x": 1234, "y": 5678, "layer": "Layer_GUGR"}}`, pixels read
   off the map) and run it again. A mean error above ~60 px means a wrong anchor: check the worst one it prints.
4. In `nextgrace-assets`, commit and push `gamedata/` (the `sync-r2` workflow copies it to the bucket). The map uses
   `/gamedata/graces_pos.json` as soon as it is in the bucket (every grace gets a pin; routes can stop at any grace).

## 2. Items in the world (30 minutes, mostly the script running)

1. `py -m pip install soulstruct` (once; on Windows it finds the game's `oo2core_6_win64.dll` to read `.dcx`).
2. Smithbox → *Param Editor* → `ItemLotParam_map` → *Export* → *CSV* → *All rows* → `ItemLotParam_map.csv`.
3. `py tools\game\pickups_from_msb.py "C:\...\ELDEN RING\Game\map\mapstudio" ItemLotParam_map.csv` → `gamedata/pickups_world.json`
   (every treasure: map, position, lot, flag, items).
4. `py tools\game\calibrate_map.py` again → `gamedata/pickups_pos.json`.
5. Commit and push `gamedata/` in `nextgrace-assets`. The site then pins missing items at their exact spot and tells picked-up ones apart by their flag.

Underground rivers and legacy dungeons are separate frames: each needs 3 graces (or anchors) that the wiki map places; the
calibration report says which ones are still missing.
