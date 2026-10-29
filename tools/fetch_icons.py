#!/usr/bin/env python3
"""
fetch_icons.py — builds an icon pack for Tarnished Ledger from eldenring.wiki.gg (MediaWiki API).

Usage (run on your own PC, Python 3.9+):
    pip install requests pillow
    python fetch_icons.py                      # weapons only (default)
    python fetch_icons.py --kinds weapon armor talisman aow goods
    python fetch_icons.py --size 64 --out icons

It needs items.json (from this project) next to it. Output: icons/<id>.webp plus er-icons.zip,
ready to load with "Cargar iconos" in the page. The pack stays on your devices; don't redistribute it:
the icons are FromSoftware's artwork, hosted on the wiki under fair use.

Be polite to the wiki: one request per second, identified User-Agent, resumable (already downloaded
ids are skipped), and robots.txt is checked before starting.
"""
import argparse, io, json, os, re, sys, time, zipfile
from urllib.parse import quote

try:
    import requests
    from PIL import Image
except ImportError:
    sys.exit("Instala las dependencias: pip install requests pillow")

WIKI = "https://eldenring.wiki.gg"
API = WIKI + "/api.php"
UA = "TarnishedLedgerIconFetch/1.0 (personal icon pack; python-requests)"
DELAY = 1.0  # seconds between requests

KINDS = {  # kind in items.json -> which ids to include
    "weapon": lambda i, e: i % 10000 == 0 and e["n"] != "Unarmed",
    "armor": lambda i, e: True,
    "talisman": lambda i, e: True,
    "aow": lambda i, e: True,
    "goods": lambda i, e: not re.search(r" \+\d+$", e["n"]),  # skip "Mimic Tear Ashes +3" style levels
    "ammo": lambda i, e: True,
}

session = requests.Session()
session.headers["User-Agent"] = UA
_last = [0.0]


def get(url, **params):
    wait = DELAY - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    _last[0] = time.time()
    r = session.get(url, params=params or None, timeout=30)
    r.raise_for_status()
    return r


def api(**params):
    params.update(format="json", formatversion="2")
    return get(API, **params).json()


def check_robots():
    try:
        txt = get(WIKI + "/robots.txt").text
    except Exception as e:
        print("No se pudo leer robots.txt:", e)
        return
    block = []
    agent_all = False
    for line in txt.splitlines():
        line = line.strip()
        if line.lower().startswith("user-agent:"):
            agent_all = line.split(":", 1)[1].strip() == "*"
        elif agent_all and line.lower().startswith("disallow:"):
            block.append(line.split(":", 1)[1].strip())
    for path in ("/api.php", "/images/"):
        if any(b and path.startswith(b) for b in block):
            sys.exit(f"robots.txt no permite {path}; no sigo.")


def chunks(seq, n):
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--kinds", nargs="+", default=["weapon"], choices=list(KINDS))
    ap.add_argument("--size", type=int, default=64, help="icon size in px (server-side thumbnail)")
    ap.add_argument("--out", default="icons")
    ap.add_argument("--items", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "items.json"))
    ap.add_argument("--aliases", default="aliases.json", help='optional {"DB name": "Wiki page title"} overrides')
    ap.add_argument("--limit", type=int, default=0, help="stop after N items (for testing)")
    a = ap.parse_args()

    db = json.load(open(a.items, encoding="utf-8"))["items"]
    aliases = json.load(open(a.aliases, encoding="utf-8")) if os.path.exists(a.aliases) else {}
    os.makedirs(a.out, exist_ok=True)

    # id -> page title (one per distinct name)
    wanted = {}
    for sid, e in db.items():
        i = int(sid)
        if e["k"] in a.kinds and KINDS[e["k"]](i, e):
            wanted[i] = aliases.get(e["n"], e["n"])
    done = {int(f.split(".")[0]) for f in os.listdir(a.out) if f.split(".")[0].isdigit()}
    todo = [(i, t) for i, t in wanted.items() if i not in done]
    if a.limit:
        todo = todo[:a.limit]
    print(f"{len(wanted)} objetos, {len(done)} ya descargados, {len(todo)} pendientes")
    if not todo:
        return pack(a.out)

    check_robots()
    missing = []
    by_title = {}
    for i, t in todo:
        by_title.setdefault(t, []).append(i)

    # 1) page -> ER_Icon_* image
    page_icon = {}
    titles = list(by_title)
    for batch in chunks(titles, 50):
        r = api(action="query", titles="|".join(batch), prop="images", imlimit=500, redirects=1)
        redirect_to = {x["from"]: x["to"] for x in r.get("query", {}).get("redirects", [])}
        normalized = {x["from"]: x["to"] for x in r.get("query", {}).get("normalized", [])}
        found = {}
        for p in r.get("query", {}).get("pages", []):
            imgs = [im["title"] for im in p.get("images", []) if re.match(r"File:ER[ _]Icon", im["title"], re.I)]
            if imgs:
                found[p["title"]] = imgs[0]
        for t in batch:
            key = redirect_to.get(normalized.get(t, t), normalized.get(t, t))
            if key in found:
                page_icon[t] = found[key]
            else:
                missing.append(t)
        print(f"  páginas {len(page_icon)}/{len(titles)}", end="\r")
    print()

    # 2) image -> thumbnail url
    files = sorted(set(page_icon.values()))
    url_of = {}
    for batch in chunks(files, 50):
        r = api(action="query", titles="|".join(batch), prop="imageinfo", iiprop="url", iiurlwidth=a.size)
        for p in r.get("query", {}).get("pages", []):
            ii = p.get("imageinfo")
            if ii:
                url_of[p["title"]] = ii[0].get("thumburl") or ii[0]["url"]

    # 3) download + convert
    n = 0
    for t, f in page_icon.items():
        url = url_of.get(f)
        if not url:
            missing.append(t)
            continue
        try:
            data = get(url).content
            im = Image.open(io.BytesIO(data)).convert("RGBA")
            im.thumbnail((a.size, a.size))
            for i in by_title[t]:
                im.save(os.path.join(a.out, f"{i}.webp"), "WEBP", quality=85, method=6)
            n += 1
            print(f"  {n}/{len(page_icon)} {t}", end="\r")
        except Exception as e:
            missing.append(f"{t} ({e})")
    print()
    if missing:
        with open("missing.txt", "w", encoding="utf-8") as fh:
            fh.write("\n".join(missing))
        print(f"{len(missing)} sin icono -> missing.txt (puedes mapearlos en aliases.json)")
    pack(a.out)


def pack(out):
    files = [f for f in os.listdir(out) if f.endswith(".webp")]
    with zipfile.ZipFile("er-icons.zip", "w", zipfile.ZIP_DEFLATED) as z:
        for f in files:
            z.write(os.path.join(out, f), f)
    print(f"er-icons.zip: {len(files)} iconos, {os.path.getsize('er-icons.zip') // 1024} KB")


if __name__ == "__main__":
    main()
