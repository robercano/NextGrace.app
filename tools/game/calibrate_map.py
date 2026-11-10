#!/usr/bin/env python3
"""
calibrate_map.py — turns the game's world positions (gamedata/graces_world.json, gamedata/pickups_world.json) into pixels of
the site's map images, and writes gamedata/graces_pos.json and gamedata/pickups_pos.json.

How: the wiki map already places some graces (data/places.json). Each game map frame (the overworld m60 tiles as one frame,
the DLC m61 tiles as one frame, and every other map file — underground rivers, legacy dungeons — as its own frame) gets an
affine fit  px = a·X + b·Z + c,  py = d·X + e·Z + f  from the graces that exist on both sides (≥ 3 anchors, least squares).
Frames without enough anchors are reported and skipped (add anchors to data/overrides/map_anchors.json: name → {x, y, layer}).

  python tools/game/calibrate_map.py            # prints the fit quality per frame and writes the outputs
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
# Extracted game data stays out of the public repo: it goes to the private assets repo (NEXTGRACE_ASSETS or ../nextgrace-assets)/gamedata
OUT = os.path.join(os.environ.get("NEXTGRACE_ASSETS") or os.path.join(os.path.dirname(ROOT), "nextgrace-assets"), "gamedata")
TILE = 256.0  # metres per overworld tile (m60_gx_gz_00, m61_gx_gz_00)

def load(p, default=None):
    """p under the public repo (data/…) or under the assets repo (gamedata/…)."""
    base = OUT if p.startswith("gamedata/") else ROOT; p = p.split("/", 1)[1] if p.startswith("gamedata/") else p
    try: return json.load(open(os.path.join(base, p), encoding="utf-8"))
    except FileNotFoundError: return default

def frame_of(map_id, x, z):
    """(frame key, X, Z) in that frame's coordinates."""
    area, gx, gz = map_id[1:3], int(map_id[4:6]), int(map_id[7:9])
    if area in ("60", "61"):
        return "m" + area, gx * TILE + x, gz * TILE + z
    return map_id, x, z

def layer_of_frame(frame):
    if frame == "m61": return "Layer_SOTE"
    if frame.startswith("m12_"): return "Layer_GUGR"
    return "Layer_TLB"

def lstsq3(rows, ys):
    """Least squares for y = a·x0 + b·x1 + c; rows = [(x0, x1)], returns (a, b, c)."""
    import itertools
    n = len(rows); A = [[r[0], r[1], 1.0] for r in rows]
    # normal equations AtA p = Aty
    ata = [[sum(A[k][i] * A[k][j] for k in range(n)) for j in range(3)] for i in range(3)]
    aty = [sum(A[k][i] * ys[k] for k in range(n)) for i in range(3)]
    # solve 3x3 by Gaussian elimination
    m = [ata[i] + [aty[i]] for i in range(3)]
    for c in range(3):
        piv = max(range(c, 3), key=lambda r: abs(m[r][c])); m[c], m[piv] = m[piv], m[c]
        if abs(m[c][c]) < 1e-12: raise ValueError("degenerate")
        for r in range(3):
            if r != c:
                f = m[r][c] / m[c][c]; m[r] = [m[r][k] - f * m[c][k] for k in range(4)]
    return [m[i][3] / m[i][i] for i in range(3)]

def main():
    graces = load("gamedata/graces_world.json"); pickups = load("gamedata/pickups_world.json", [])
    if not graces: print("gamedata/graces_world.json missing: run graces_from_param.py first"); sys.exit(1)
    places = load("data/places.json")["places"]
    anchors = {}
    for p in places:
        if p.get("region") or not p.get("layer"): continue
        anchors.setdefault(p["name"].lower(), (p["x"], p["y"], p["layer"]))
    for name, a in (load("data/overrides/map_anchors.json", {}) or {}).items():
        if isinstance(a, dict): anchors[name.lower()] = (a["x"], a["y"], a.get("layer", "Layer_TLB"))
    # anchors per frame
    per = {}
    for g in graces:
        if not g.get("name"): continue
        a = anchors.get(g["name"].lower())
        if not a: continue
        fr, X, Z = frame_of(g["map"], g["x"], g["z"])
        if a[2] != layer_of_frame(fr): continue
        per.setdefault(fr, []).append((X, Z, a[0], a[1], g["name"]))
    fits = {}
    for fr, pts in sorted(per.items()):
        if len(pts) < 3: print(f"{fr}: only {len(pts)} anchor(s), skipped ({', '.join(p[4] for p in pts)})"); continue
        rows = [(p[0], p[1]) for p in pts]
        try: ax = lstsq3(rows, [p[2] for p in pts]); ay = lstsq3(rows, [p[3] for p in pts])
        except ValueError: print(f"{fr}: degenerate anchors, skipped"); continue
        errs = []
        for X, Z, px, py, nm in pts:
            ex = ax[0] * X + ax[1] * Z + ax[2] - px; ey = ay[0] * X + ay[1] * Z + ay[2] - py; errs.append(((ex * ex + ey * ey) ** 0.5, nm))
        errs.sort(reverse=True); mean = sum(e for e, _ in errs) / len(errs)
        print(f"{fr}: {len(pts)} anchors, mean error {mean:.0f} px, worst {errs[0][0]:.0f} px ({errs[0][1]})")
        fits[fr] = {"ax": ax, "ay": ay, "anchors": len(pts), "mean_px": round(mean, 1), "worst_px": round(errs[0][0], 1), "layer": layer_of_frame(fr)}
    os.makedirs(OUT, exist_ok=True); json.dump(fits, open(os.path.join(OUT, "map_calibration.json"), "w"), indent=1)
    def to_px(map_id, x, z):
        fr, X, Z = frame_of(map_id, x, z); f = fits.get(fr)
        if not f: return None
        return round(f["ax"][0] * X + f["ax"][1] * Z + f["ax"][2], 1), round(f["ay"][0] * X + f["ay"][1] * Z + f["ay"][2], 1), f["layer"]
    gout, miss = [], 0
    for g in graces:
        if not g.get("name"): continue
        r = to_px(g["map"], g["x"], g["z"])
        if not r: miss += 1; continue
        gout.append({"flag": g["flag"], "name": g["name"], "x": r[0], "y": r[1], "layer": r[2]})
    json.dump({"_source": "BonfireWarpParam of the game, calibrated against the wiki map (tools/game/calibrate_map.py)", "graces": gout}, open(os.path.join(OUT, "graces_pos.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print(f"graces: {len(gout)} placed, {miss} in frames without calibration → gamedata/graces_pos.json")
    if pickups:
        pout, pmiss = [], 0
        for p in pickups:
            if not p.get("items"): continue
            r = to_px(p["map"], p["x"], p["z"])
            if not r: pmiss += 1; continue
            pout.append({"lot": p["lot"], "flag": p["flag"], "chest": p["chest"], "x": r[0], "y": r[1], "layer": r[2], "items": p["items"]})
        json.dump({"_source": "map files of the game (treasures) + ItemLotParam_map, calibrated like the graces", "pickups": pout}, open(os.path.join(OUT, "pickups_pos.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
        print(f"pickups: {len(pout)} placed, {pmiss} in frames without calibration → gamedata/pickups_pos.json")

if __name__ == "__main__":
    main()
