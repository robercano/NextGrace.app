#!/usr/bin/env python3
"""
fetch_map.py — descarga los mapas interactivos (extensión DataMaps) de eldenring.wiki.gg.

Salida:
  data/map.json   marcadores fusionados: {crs, backgrounds, groups, markers:[{page, group, layer, x, y, name, desc, article, image}]}
  icons/map/      imágenes de fondo (arte del juego: solo para tu repo privado)

Uso: python tools/fetch_map.py [--no-images]
"""
import argparse, json, os, re, sys, time

try:
    import requests
except ImportError:
    sys.exit("pip install requests")

WIKI = os.environ.get("TL_WIKI", "https://eldenring.wiki.gg")
UA = "NextGraceMapFetch/1.0 (personal use; python-requests)"
DELAY = float(os.environ.get("TL_DELAY", "2.0"))
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")

session = requests.Session()
session.headers["User-Agent"] = UA
_last = [0.0]


def get(url, **params):
    backoff = 30
    for _ in range(8):
        wait = DELAY - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        r = session.get(url, params=params or None, timeout=120)
        if r.status_code in (429, 503):
            ra = r.headers.get("Retry-After")
            pause = int(ra) if ra and ra.isdigit() else backoff
            print(f"  {r.status_code}: espero {pause}s", flush=True)
            time.sleep(pause)
            backoff = min(backoff * 2, 600)
            continue
        r.raise_for_status()
        return r
    r.raise_for_status()


def api(**params):
    params.update(format="json", formatversion="2")
    return get(WIKI + "/api.php", **params).json()


def strip_links(s):
    s = re.sub(r"\[\[([^\]|]*\|)?([^\]]*)\]\]", r"\2", s or "")
    s = re.sub(r"'''?", "", s)
    return s.strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-images", action="store_true")
    a = ap.parse_args()

    # 1) namespace id of "Map"
    ns = api(action="query", meta="siteinfo", siprop="namespaces")["query"]["namespaces"]
    map_ns = next((int(k) for k, v in ns.items() if v.get("name") == "Map" or v.get("canonical") == "Map"), None)
    if map_ns is None:
        sys.exit("No encuentro el espacio de nombres Map: " + ", ".join(v.get("name", "") for v in ns.values()))

    # 2) list pages
    pages, cont = [], {}
    while True:
        r = api(action="query", list="allpages", apnamespace=map_ns, aplimit=500, **cont)
        pages += [p["title"] for p in r["query"]["allpages"]]
        cont = r.get("continue")
        if not cont:
            break
    print(f"{len(pages)} páginas Map:", ", ".join(pages[:40]) + (" …" if len(pages) > 40 else ""))

    # 3) fetch each page's JSON
    out = {"crs": None, "backgrounds": [], "groups": {}, "layers": {}, "pages": [], "markers": []}
    bg_files = {}
    for t in pages:
        try:
            r = api(action="query", prop="revisions", titles=t, rvprop="content", rvslots="main")
            content = r["query"]["pages"][0]["revisions"][0]["slots"]["main"]["content"]
            d = json.loads(content)
        except Exception as e:
            print("  FALLO", t, e, flush=True)
            continue
        if "include" in d:  # mixin pages reference shared config; keep going
            pass
        if d.get("crs") and not out["crs"]:
            out["crs"] = d["crs"]
        for b in d.get("backgrounds", []) or []:
            img = b.get("image")
            if img and img not in bg_files:
                bg_files[img] = {"name": b.get("name", img), "image": img, "layer": b.get("associatedLayer", "")}
        for gid, g in (d.get("groups") or {}).items():
            out["groups"].setdefault(gid, {"name": g.get("name", gid), "icon": g.get("icon"), "pages": []})
            out["groups"][gid]["pages"].append(t)
        for lid, l in (d.get("layers") or {}).items():
            out["layers"].setdefault(lid, l.get("name", lid) if isinstance(l, dict) else str(l))
        n = 0
        for key, lst in (d.get("markers") or {}).items():
            parts = key.split()
            group = parts[0]
            layer = next((p.split(":", 1)[1] for p in parts[1:] if p.startswith("bg:")), "")
            for m in lst or []:
                if "x" not in m or "y" not in m:
                    continue
                out["markers"].append({
                    "page": t.replace("Map:", ""), "group": group, "layer": layer,
                    "x": m["x"], "y": m["y"], "name": strip_links(m.get("name", "")),
                    "desc": strip_links(m.get("description", "")),
                    "article": (m.get("article") or "").split("|")[0], "image": m.get("image", ""),
                })
                n += 1
        out["pages"].append({"title": t, "markers": n})
        print(f"  {t}: {n} marcadores", flush=True)
    out["backgrounds"] = list(bg_files.values())
    os.makedirs(os.path.join(ROOT, "data"), exist_ok=True)
    with open(os.path.join(ROOT, "data", "map.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"total {len(out['markers'])} marcadores, {len(out['groups'])} grupos, fondos: {[b['image'] for b in out['backgrounds']]}")

    # 4) background images
    if a.no_images:
        return
    d = os.path.join(ROOT, "icons", "map")
    os.makedirs(d, exist_ok=True)
    for b in out["backgrounds"]:
        fn = re.sub(r"[^a-z0-9.]+", "_", b["image"].lower())
        path = os.path.join(d, fn)
        b["file"] = "icons/map/" + fn
        if os.path.exists(path):
            continue
        r = api(action="query", titles="File:" + b["image"], prop="imageinfo", iiprop="url|size")
        ii = r["query"]["pages"][0].get("imageinfo")
        if not ii:
            print("  sin imagen:", b["image"]); continue
        b["width"], b["height"] = ii[0].get("width"), ii[0].get("height")
        data = get(ii[0]["url"]).content
        open(path, "wb").write(data)
        print(f"  fondo {fn}: {len(data)//1024} KB {b.get('width')}x{b.get('height')}", flush=True)
    with open(os.path.join(ROOT, "data", "map.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main()
