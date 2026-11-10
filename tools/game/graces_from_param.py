#!/usr/bin/env python3
"""
graces_from_param.py — every site of grace with its world position, from the game's BonfireWarpParam (Smithbox → Param
Editor → BonfireWarpParam → Export → CSV, all rows). Joined with data/flags.json (graces by event flag) for the names.

  python tools/game/graces_from_param.py path/to/BonfireWarpParam.csv  →  data/game/graces_world.json

Output: [{ "flag": 71000, "name": "Godrick the Grafted", "map": "m10_00_00_00", "x": 12.3, "y": 45.6, "z": -7.8 }]
"map" is the game map that owns the grace (m60_gx_gz_00 overworld tiles, m61 for the DLC, m12_* underground, legacy
dungeons m10/m11/m13/m14/m15/m16/m19…); x/y/z are the local coordinates inside that map, as the game stores them.
tools/game/calibrate_map.py turns them into pixels of the site's map images.
"""
import csv, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))

def read_param_csv(path):
    """Smithbox CSV: a header row with the field names (ID, Name, …); values may be quoted. Returns a list of dicts."""
    with open(path, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.reader(f))
    head = [h.strip() for h in rows[0]]
    out = []
    for r in rows[1:]:
        if not r or not r[0].strip():
            continue
        out.append({head[i]: (r[i].strip() if i < len(r) else "") for i in range(len(head))})
    return out

def num(v, default=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default

def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    rows = read_param_csv(sys.argv[1])
    flags = json.load(open(os.path.join(ROOT, "data", "flags.json"), encoding="utf-8"))
    by_flag = {g["id"]: g for g in flags["graces"]}
    # field names as Smithbox prints them (Paramdex); accept a few spellings
    def get(r, *names):
        for n in names:
            if n in r: return r[n]
        return ""
    out, unknown = [], 0
    for r in rows:
        flag = int(num(get(r, "eventflagId", "eventFlagId", "EventFlagId")))
        if not flag: continue
        area = int(num(get(r, "areaNo"))); gx = int(num(get(r, "gridXNo"))); gz = int(num(get(r, "gridZNo")))
        map_id = f"m{area:02d}_{gx:02d}_{gz:02d}_00"
        g = by_flag.get(flag)
        if not g: unknown += 1
        out.append({"flag": flag, "name": g["name"] if g else None, "region": g.get("region") if g else None, "map": map_id,
                    "x": round(num(get(r, "posX")), 3), "y": round(num(get(r, "posY")), 3), "z": round(num(get(r, "posZ")), 3)})
    out.sort(key=lambda e: e["flag"])
    dst = os.path.join(ROOT, "data", "game", "graces_world.json")
    json.dump(out, open(dst, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    named = sum(1 for e in out if e["name"])
    print(f"{len(out)} graces in the param; {named} matched a name in flags.json, {unknown} unknown flags (DLC/unused) → {dst}")

if __name__ == "__main__":
    main()
