#!/usr/bin/env python3
"""
fetch_icons.py — descarga el pack de iconos para Tarnished Ledger desde eldenring.wiki.gg (API MediaWiki).

Lista todos los ficheros "ER Icon <grupo> <nombre>.png" de la wiki, los descarga (miniatura 64 px),
los convierte a WebP y los guarda como icons/<slug>.webp (el mismo nombre que usa la página).

Uso:
    pip install requests pillow
    python tools/fetch_icons.py                       # todos los grupos
    python tools/fetch_icons.py --kinds weapon Armor  # solo algunos (ver --list)
    python tools/fetch_icons.py --list                # muestra grupos y cantidades

Reanudable: los que ya están en icons/ se saltan. Ritmo: 1 petición/segundo, User-Agent identificado.
Los iconos son arte de FromSoftware alojado en la wiki; son para tu uso personal, no los redistribuyas.
"""
import argparse, io, json, os, re, sys, time

try:
    import requests
    from PIL import Image
except ImportError:
    sys.exit("Instala las dependencias: pip install requests pillow")

WIKI = os.environ.get("TL_WIKI", "https://eldenring.wiki.gg")
UA = "TarnishedLedgerIconFetch/2.0 (personal icon pack; python-requests)"
DELAY = float(os.environ.get("TL_DELAY", "2.0"))
NAME_RE = re.compile(r"^ER Icon ([^ ]+) (.+)\.(png|webp|jpe?g)$", re.I)
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
try:
    DB_NAMES = set()
    for e in json.load(open(os.path.join(ROOT, "data", "items.json"), encoding="utf-8"))["items"].values():
        n = e["n"].lower(); DB_NAMES.add(n)
        if ": " in n: DB_NAMES.add(n.split(": ", 1)[1])  # "Ash of War: X" -> "X", "Map: Limgrave, West" -> "Limgrave, West"
except Exception:
    DB_NAMES = set()


def split_name(stem):
    """'Ash of War Bloodhound's Step' -> ('Ash of War', "Bloodhound's Step") using the item DB when possible."""
    words = stem.split(" ")
    for i in range(1, len(words)):  # longest suffix that is a known item name
        cand = " ".join(words[i:])
        if cand.lower() in DB_NAMES:
            return " ".join(words[:i]), cand
    return words[0], " ".join(words[1:])

session = requests.Session()
session.headers["User-Agent"] = UA
_last = [0.0]


def get(url, **params):
    backoff = 30
    for attempt in range(8):
        wait = DELAY - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        r = session.get(url, params=params or None, timeout=60)
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
    return r


def api(**params):
    params.update(format="json", formatversion="2")
    return get(WIKI + "/api.php", **params).json()


def slug(n):
    return re.sub(r"^_|_$", "", re.sub(r"[^a-z0-9]+", "_", n.lower()))


def list_icons():
    files, cont = [], {}
    while True:
        r = api(action="query", list="allimages", aiprefix="ER Icon ", ailimit=500, aiprop="url", **cont)
        for f in r["query"]["allimages"]:
            name = f["name"].replace("_", " ")
            m = re.match(r"^ER Icon (.+)\.(png|webp|jpe?g)$", name, re.I)
            if m:
                kind, item = split_name(m.group(1))
                files.append({"kind": kind, "item": item, "url": f["url"], "name": name})
        cont = r.get("continue")
        if not cont:
            return files


def main():
    root = ROOT
    ap = argparse.ArgumentParser()
    ap.add_argument("--kinds", nargs="*", default=None, help="grupos a bajar (por defecto todos)")
    ap.add_argument("--size", type=int, default=64)
    ap.add_argument("--out", default=os.path.join(root, "icons"))
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()

    files = list_icons()
    groups = {}
    for f in files:
        groups.setdefault(f["kind"], []).append(f)
    print(f"{len(files)} iconos en la wiki:", ", ".join(f"{k} ({len(v)})" for k, v in sorted(groups.items(), key=lambda kv: -len(kv[1]))))
    if a.list:
        return
    if a.kinds:
        want = {k.lower() for k in a.kinds}
        files = [f for f in files if f["kind"].lower() in want]

    os.makedirs(a.out, exist_ok=True)
    have = {os.path.splitext(n)[0] for n in os.listdir(a.out)}
    todo = [f for f in files if slug(f["item"]) not in have]
    if a.limit:
        todo = todo[:a.limit]
    print(f"{len(files)} seleccionados, {len(files) - len(todo)} ya descargados, {len(todo)} pendientes")

    failed = []
    for i, f in enumerate(todo, 1):
        try:
            # thumbnail via the standard MediaWiki thumb path keeps bandwidth low; fall back to full file
            data = get(f["url"]).content
            im = Image.open(io.BytesIO(data)).convert("RGBA")
            im.thumbnail((a.size, a.size))
            im.save(os.path.join(a.out, slug(f["item"]) + ".webp"), "WEBP", quality=85, method=6)
        except Exception as e:
            failed.append(f"{f['name']} ({e})")
            if len(failed) <= 15:
                print("  FALLO", f["name"], "->", e, flush=True)
        if i % 25 == 0 or i == len(todo):
            print(f"  {i}/{len(todo)}  ({len(failed)} fallos)", flush=True)
    if failed:
        with open(os.path.join(a.out, "missing.txt"), "w", encoding="utf-8") as fh:
            fh.write("\n".join(failed))
        print(f"{len(failed)} fallos -> icons/missing.txt")
    elif os.path.exists(os.path.join(a.out, "missing.txt")):
        os.remove(os.path.join(a.out, "missing.txt"))


if __name__ == "__main__":
    main()
