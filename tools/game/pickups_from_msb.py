#!/usr/bin/env python3
"""
pickups_from_msb.py — every item lying in the world (chests, corpses, ground pickups) with its position and its item lot,
read from the game's map files with soulstruct. Run on the PC with the game unpacked by UXM.

  py -m pip install soulstruct
  py tools/game/pickups_from_msb.py "C:\\...\\ELDEN RING\\Game\\map\\mapstudio" path\\to\\ItemLotParam_map.csv

Inputs: the mapstudio folder (m*.msb.dcx; soulstruct decompresses DCX with the game's oo2core DLL, which it finds in the
game folder on Windows) and ItemLotParam_map exported from Smithbox as CSV (all rows).
Output: gamedata/pickups_world.json: [{ "map": "m60_42_36_00", "lot": 100230, "flag": 60100, "chest": true,
  "x": 1.2, "y": 3.4, "z": 5.6, "items": [{ "id": 1073742015, "n": 1 }] }]
Item ids use the site's convention (goods = 0x40000000 + id, weapons raw, armor 0x10000000 + id, accessories 0x20000000 + id,
ashes of war 0x80000000 + id), the same ids as data/items.json. Positions are local to the map file (tools/game/calibrate_map.py
turns them into map pixels).
"""
import csv, json, os, sys, glob

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
# Extracted game data stays out of the public repo: it goes to the private assets repo (NEXTGRACE_ASSETS or ../nextgrace-assets)/gamedata
OUT = os.path.join(os.environ.get("NEXTGRACE_ASSETS") or os.path.join(os.path.dirname(ROOT), "nextgrace-assets"), "gamedata")
CAT = {1: 0x00000000, 2: 0x10000000, 3: 0x20000000, 4: 0x40000000, 5: 0x80000000, 6: 0x80000000}  # lotItemCategory: 1 weapon, 2 protector, 3 accessory, 4 goods, 5/6 gem (ash of war)

def read_param_csv(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.reader(f))
    head = [h.strip() for h in rows[0]]
    return [{head[i]: (r[i].strip() if i < len(r) else "") for i in range(len(head))} for r in rows[1:] if r and r[0].strip()]

def lots_from_csv(path):
    lots = {}
    for r in read_param_csv(path):
        try: lid = int(r.get("ID") or r.get("Id") or r.get("id"))
        except (TypeError, ValueError): continue
        items = []
        for i in range(1, 9):
            iid = r.get(f"lotItemId{i:02d}", "0"); cat = r.get(f"lotItemCategory{i:02d}", "0"); n = r.get(f"lotItemNum{i:02d}", "0")
            try: iid, cat, n = int(float(iid)), int(float(cat)), int(float(n))
            except ValueError: continue
            if iid <= 0 or cat not in CAT: continue
            items.append({"id": CAT[cat] + iid, "n": n or 1})
        try: flag = int(float(r.get("getItemFlagId", "0") or 0))
        except ValueError: flag = 0
        lots[lid] = {"flag": flag, "items": items}
    return lots

def main():
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)
    from soulstruct.eldenring.maps.msb import MSB
    msb_dir, lot_csv = sys.argv[1], sys.argv[2]
    lots = lots_from_csv(lot_csv); print(f"{len(lots)} item lots")
    out, maps = [], 0
    for path in sorted(glob.glob(os.path.join(msb_dir, "m*.msb.dcx"))):
        map_id = os.path.basename(path).split(".")[0]
        try:
            msb = MSB.from_path(path)
        except Exception as e:
            print("skip", map_id, e); continue
        maps += 1
        for t in msb.treasures:
            part = t.treasure_part
            if part is None: continue
            lot = lots.get(int(t.item_lot)) if t.item_lot else None
            tr = part.translate
            out.append({"map": map_id, "lot": int(t.item_lot or 0), "flag": lot["flag"] if lot else 0, "chest": bool(t.is_in_chest),
                        "x": round(float(tr[0]), 3), "y": round(float(tr[1]), 3), "z": round(float(tr[2]), 3), "items": lot["items"] if lot else []})
    os.makedirs(OUT, exist_ok=True); dst = os.path.join(OUT, "pickups_world.json")
    json.dump(out, open(dst, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print(f"{maps} maps, {len(out)} treasures ({sum(1 for e in out if e['items'])} with a known lot) → {dst}")

if __name__ == "__main__":
    main()
