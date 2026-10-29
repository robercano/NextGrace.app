#!/usr/bin/env python3
"""build_places.py — cruza el texto de ubicación de cada objeto con los lugares del mapa de la wiki.
Salida: data/places.json  {places:[{id,name,x,y,layer,group,article}], items:{itemId:[placeId,...]}}
"""
import json, os, re
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DB = json.load(open(os.path.join(ROOT, "data", "items.json"), encoding="utf-8"))["items"]
M = json.load(open(os.path.join(ROOT, "data", "map.json"), encoding="utf-8"))

SKIP_PAGES = re.compile(r"NIGHTREIGN|Network Test|Ver\. 1\.00")
REGIONS = {"limgrave", "liurnia of the lakes", "caelid", "altus plateau", "mountaintops of the giants", "weeping peninsula", "dragonbarrow", "mt. gelmir", "siofra river", "ainsel river", "deeproot depths", "lake of rot", "consecrated snowfield", "leyndell, royal capital"}

# unique places (merge same name across pages; prefer markers with a layer / most specific page)
places, byname = [], {}
for m in M["markers"]:
    if SKIP_PAGES.search(m["page"]) or not m["name"]:
        continue
    k = m["name"].strip().lower()
    if k in byname:
        continue
    byname[k] = len(places)
    places.append({"id": len(places), "name": m["name"].strip(), "x": m["x"], "y": m["y"],
                   "layer": m["layer"] or ("Layer_GUGR" if m["page"] == "Item Location - Maps" and m["layer"] == "caves" else "Layer_TLB"),
                   "group": m["group"], "article": m["article"], "region": k in REGIONS})
# longest names first so "Church of Elleh" wins over "Elleh"
names = sorted(byname.items(), key=lambda kv: -len(kv[0]))
pat = [(re.compile(r"(?<![a-z])" + re.escape(n) + r"(?![a-z])"), i) for n, i in names if len(n) >= 4]

items, stats = {}, {"with_loc": 0, "matched": 0, "specific": 0}
for sid, e in DB.items():
    loc = (e.get("loc") or "").lower()
    if not loc:
        continue
    stats["with_loc"] += 1
    hits = []
    for rx, i in pat:
        if rx.search(loc):
            hits.append(i)
    if hits:
        stats["matched"] += 1
        spec = [i for i in hits if not places[i]["region"]]
        if spec:
            stats["specific"] += 1
        items[sid] = (spec or hits)[:4]
json.dump({"places": places, "items": items}, open(os.path.join(ROOT, "data", "places.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"{len(places)} lugares; objetos con texto de ubicación {stats['with_loc']}, con lugar {stats['matched']}, con lugar concreto (no solo región) {stats['specific']}")
