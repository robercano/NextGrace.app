#!/usr/bin/env python3
"""
pickups_from_msb.py — every item lying in the world (chests, corpses, ground pickups) with its position and its item lot,
read from the game's map files. Run on the PC with the game unpacked by UXM.

  py -m pip install soulstruct      (Python 3.13: only its DCX decompression is used, see below)
  py tools/game/pickups_from_msb.py "C:\\...\\ELDEN RING\\Game\\map\\mapstudio" path\\to\\ItemLotParam_map.csv

Inputs: the mapstudio folder (m*.msb.dcx; soulstruct decompresses DCX with the game's oo2core DLL, which it finds in the
game folder on Windows) and ItemLotParam_map exported from Smithbox as CSV (all rows).
Output: gamedata/pickups_world.json: [{ "map": "m60_42_36_00", "lot": 100230, "flag": 60100, "chest": true,
  "x": 1.2, "y": 3.4, "z": 5.6, "items": [{ "id": 1073742015, "n": 1 }] }]
The MSB itself is read by a minimal reader of our own (read_msb below): soulstruct 2.6's Elden Ring MSB parser asserts list
version 73 and the current game files carry 74 (and 65 in some tiles), and it also breaks on map pieces. Layout taken from
SoulsFormats (Smithbox, src/Andre/SoulsFormats/.../MSB/MSBE: MSB.cs, EventParam.cs, PartsParam.cs), which does not assert the
list version. Only what we need is read: the treasure events and the positions of the parts they point to.
Item ids use the site's convention (goods = 0x40000000 + id, weapons raw, armor 0x10000000 + id, accessories 0x20000000 + id,
ashes of war 0x80000000 + id), the same ids as data/items.json. Positions are local to the map file (tools/game/calibrate_map.py
turns them into map pixels).
"""
import csv, json, os, sys, glob, struct, collections

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

# ---- minimal MSBE reader (Elden Ring map layout) ---------------------------------------------------------------------------
# File: "MSB " header (0x10 bytes), then six param lists chained by offset: MODEL, EVENT, POINT, ROUTE, LAYER, PARTS.
# List header: int32 version (not checked: 73/74/65 seen), int32 count (entries + 1), int64 name offset, int64 entry offsets
# [count - 1], int64 next list offset (0 after PARTS). All offsets are absolute, except those inside an entry (relative to it).
EVENT_TREASURE = 4

def _utf16(b, off):
    end = off
    while b[end:end + 2] != b"\0\0": end += 2
    return b[off:end].decode("utf-16-le")

def read_msb(b):
    """→ (treasures, parts). treasures: [{name, part, treasure_part, lot, chest}]; parts: [{name, x, y, z}] in file order
    (the order event part indices refer to)."""
    if b[:4] != b"MSB " or struct.unpack_from("<ii", b, 4) != (1, 0x10): raise ValueError("not an MSB file")
    lists, pos = {}, 0x10
    while pos:
        _ver, count, name_off = struct.unpack_from("<iiq", b, pos)
        offs = struct.unpack_from(f"<{count - 1}q", b, pos + 16) if count > 1 else ()
        lists[_utf16(b, name_off)] = offs
        pos = struct.unpack_from("<q", b, pos + 16 + 8 * (count - 1))[0]
    treasures = []
    for e in lists.get("EVENT_PARAM_ST", ()):
        name_off, _eid, etype = struct.unpack_from("<qiI", b, e)
        if etype != EVENT_TREASURE: continue
        base_off, type_off = struct.unpack_from("<qq", b, e + 0x18)
        part_idx = struct.unpack_from("<i", b, e + base_off)[0]
        t = e + type_off  # treasure data: 0, 0, treasure part index, 0, item lot, 0x24 × FF, action button, pickup anim, in chest
        tpart, lot = struct.unpack_from("<i", b, t + 8)[0], struct.unpack_from("<i", b, t + 0x10)[0]
        chest = b[t + 0x40] if len(b) > t + 0x40 else 0
        treasures.append({"name": _utf16(b, e + name_off), "part": part_idx, "treasure_part": tpart, "lot": lot, "chest": bool(chest)})
    parts = []
    for p in lists.get("PARTS_PARAM_ST", ()):
        name_off = struct.unpack_from("<q", b, p)[0]
        x, y, z = struct.unpack_from("<fff", b, p + 0x20)  # after name, instance id, type, id, model index, sib offset
        parts.append({"name": _utf16(b, p + name_off), "x": x, "y": y, "z": z})
    return treasures, parts

def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) < 2:
        print(__doc__); sys.exit(1)
    from soulstruct.dcx import decompress  # light import: does not touch soulstruct's (broken) Elden Ring MSB classes
    msb_dir, lot_csv = args[0], args[1]
    lots = lots_from_csv(lot_csv); print(f"{len(lots)} item lots")
    out, maps, failed, empty_lot = [], 0, collections.Counter(), 0
    for path in sorted(glob.glob(os.path.join(msb_dir, "m*.msb.dcx"))):
        map_id = os.path.basename(path).split(".")[0]
        try:
            raw, _ = decompress(path)
            treasures, parts = read_msb(raw)
        except Exception as e:
            failed[f"{type(e).__name__}: {str(e)[:80]}"] += 1; print("skip", map_id, type(e).__name__, str(e)[:80]); continue
        maps += 1
        for t in treasures:
            idx = t["treasure_part"] if 0 <= t["treasure_part"] < len(parts) else t["part"]
            if not (0 <= idx < len(parts)): continue
            if t["lot"] <= 0: empty_lot += 1; continue
            p, lot = parts[idx], lots.get(t["lot"])
            out.append({"map": map_id, "lot": t["lot"], "flag": lot["flag"] if lot else 0, "chest": t["chest"],
                        "x": round(p["x"], 3), "y": round(p["y"], 3), "z": round(p["z"], 3), "items": lot["items"] if lot else []})
    os.makedirs(OUT, exist_ok=True); dst = os.path.join(OUT, "pickups_world.json")
    json.dump(out, open(dst, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    if failed:
        print(f"{sum(failed.values())} maps could not be read:")
        for reason, n in failed.most_common(): print(f"  {n:4d}  {reason}")
    print(f"{maps} maps, {len(out)} treasures ({sum(1 for e in out if e['items'])} with a known lot, {empty_lot} events without a lot skipped) → {dst}")

if __name__ == "__main__":
    main()
