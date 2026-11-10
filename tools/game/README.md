# Game data extraction (positions of graces and items)

The game's own files give what the wiki map lacks: the position of every site of grace and of every item lying in the world.
Everything runs on the PC that has the game unpacked with UXM (see `tools/EXTRACT.md`); the outputs are plain data (numbers
and names), so they live in this repo under `data/game/` and `data/*_pos.json`.

## 1. Graces (10 minutes)

1. Smithbox → *Param Editor* → `BonfireWarpParam` → *Export* → *CSV* → *All rows* → save as `BonfireWarpParam.csv`.
2. `py tools\game\graces_from_param.py BonfireWarpParam.csv` → `data/game/graces_world.json` (positions in game coordinates).
3. `py tools\game\calibrate_map.py` → fits each map frame against the graces the wiki map already places and writes
   `data/graces_pos.json` (pixels + layer). Read the report: a frame with fewer than 3 anchors is skipped; add anchors by
   hand in `data/overrides/map_anchors.json` (`{"Grace name": {"x": 1234, "y": 5678, "layer": "Layer_GUGR"}}`, pixels read
   off the map) and run it again. A mean error above ~60 px means a wrong anchor: check the worst one it prints.
4. Commit `data/game/graces_world.json`, `data/game/map_calibration.json` and `data/graces_pos.json`. The map uses the
   file as soon as it is deployed (every grace gets a pin; routes can stop at any grace).

## 2. Items in the world (30 minutes, mostly the script running)

1. `py -m pip install soulstruct` (once; on Windows it finds the game's `oo2core_6_win64.dll` to read `.dcx`).
2. Smithbox → *Param Editor* → `ItemLotParam_map` → *Export* → *CSV* → *All rows* → `ItemLotParam_map.csv`.
3. `py tools\game\pickups_from_msb.py "C:\...\ELDEN RING\Game\map\mapstudio" ItemLotParam_map.csv` → `data/game/pickups_world.json`
   (every treasure: map, position, lot, flag, items).
4. `py tools\game\calibrate_map.py` again → `data/pickups_pos.json`.
5. Commit both. The site then pins missing items at their exact spot and tells picked-up ones apart by their flag.

Underground rivers and legacy dungeons are separate frames: each needs 3 graces (or anchors) that the wiki map places; the
calibration report says which ones are still missing.
