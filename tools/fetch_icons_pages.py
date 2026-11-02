#!/usr/bin/env python3
"""
fetch_icons_pages.py — segunda pasada de iconos: para cada objeto de data/items.json sin icono en icons/,
abre su página en eldenring.wiki.gg, lee el parámetro `image=` del infobox y descarga ese fichero.
Guarda icons/<slug del nombre del objeto>.webp (el mismo nombre con el que la página lo busca).

Arte del juego: solo para el repo privado. Uso: python tools/fetch_icons_pages.py [--limit N] [--dry]
"""
import argparse, io, json, os, re, sys, time

try:
    import requests
    from PIL import Image
except ImportError:
    sys.exit("pip install requests pillow")

WIKI = os.environ.get("TL_WIKI", "https://eldenring.wiki.gg")
UA = "NextGraceIconFetch/3.0 (personal icon pack; python-requests)"
DELAY = float(os.environ.get("TL_DELAY", "1.5"))
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
ICONS = os.path.join(ROOT, "icons")
INF = ["Heavy", "Keen", "Quality", "Fire", "Flame Art", "Lightning", "Sacred", "Magic", "Cold", "Poison", "Blood", "Occult"]
INF_ANY = re.compile(r"\b(Heavy|Keen|Quality|Fire|Flame Art|Lightning|Sacred|Magic|Cold|Poison|Blood|Occult|Bloody)\s+")

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
            backoff = min(backoff * 2, 300)
            continue
        r.raise_for_status()
        return r
    raise RuntimeError("demasiados reintentos")


def api(**params):
    params.setdefault("format", "json"); params.setdefault("formatversion", 2)
    return get(WIKI + "/api.php", **params).json()


def slug(n):
    return re.sub(r"^_|_$", "", re.sub(r"[^a-z0-9]+", "_", n.lower()))


def base_name(n):
    return re.sub(r"\s*\+\s*\d+\s*$", "", n).strip()


def candidates(n):
    """slugs que la web probaría para este nombre (debe coincidir con iconCandidates en src/app.js)."""
    c = [slug(n)]
    for i in INF:
        if n.startswith(i + " "):
            c.append(slug(n[len(i) + 1:]))
    p = base_name(n)
    if p != n:
        c.append(slug(p))
    if ": " in n:
        c.append(slug(n.split(": ", 1)[1]))
    c.append(slug(INF_ANY.sub("", n).strip()))
    nb = re.sub(r"\s*\[\d+\]\s*$", "", n)
    if nb != n:
        c.append(slug(nb))
    return c


def missing_items():
    have = {os.path.splitext(f)[0] for f in os.listdir(ICONS)}
    have |= {re.sub(r"^(item|material|weapon|armor|spell|talisman|goods|key|gesture|info|tool|ash|spirit)_", "", h) for h in list(have)}  # same aliases as the web
    db = json.load(open(os.path.join(ROOT, "data", "items.json"), encoding="utf-8"))["items"]
    out = {}  # key (name without level/infusion words) -> set of real item names in the group
    for e in db.values():
        if e.get("f") or e["n"] in ("Unarmed", "Head", "Body", "Arms", "Legs"):
            continue
        if any(c in have for c in candidates(e["n"])):
            continue
        n = base_name(e["n"])
        key = INF_ANY.sub("", n).strip() or n
        out.setdefault(key, set()).add(n)
    return out


def title_variants(n):
    v = [n]
    if "[" in n:
        v.append(n.replace("[", "(").replace("]", ")"))
        v.append(re.sub(r"\s*\[\d+\]$", "", n))
    if n.startswith("Ash of War: "):
        v.append(n[len("Ash of War: "):])
    if n.startswith("Map: "):
        v.append(n[len("Map: "):] + " (map)")
    if n.startswith("Note: "):
        v.append(n[len("Note: "):])
    stripped = INF_ANY.sub("", n).strip()
    if stripped != n:
        v.append(stripped)
    return v


def wikitext(titles):
    out = {}
    for i in range(0, len(titles), 50):
        chunk = titles[i:i + 50]
        data = api(action="query", prop="revisions", rvslots="main", rvprop="content", redirects=1, titles="|".join(chunk))
        q = data.get("query", {})
        redir = {r["from"]: r["to"] for r in q.get("redirects", [])}
        norm = {x["from"]: x["to"] for x in q.get("normalized", [])}
        by = {}
        for p in q.get("pages", []):
            if "missing" in p:
                continue
            try:
                by[p["title"]] = p["revisions"][0]["slots"]["main"]["content"]
            except (KeyError, IndexError):
                pass
        for t in chunk:
            t2 = redir.get(norm.get(t, t), norm.get(t, t))
            if t2 in by:
                out[t] = by[t2]
    return out


IMG_RE = re.compile(r"\|\s*image\s*=\s*([^|\n}]+)", re.I)


def image_name(txt):
    m = IMG_RE.search(txt)
    if not m:
        return None
    v = m.group(1).strip()
    v = re.sub(r"^\[\[(?:File|Image):", "", v, flags=re.I).split("|")[0].rstrip("]").strip()
    v = re.sub(r"^(File|Image):", "", v, flags=re.I)
    return v or None


def image_urls(files):
    out = {}
    for i in range(0, len(files), 50):
        chunk = files[i:i + 50]
        data = api(action="query", titles="|".join("File:" + f for f in chunk), prop="imageinfo", iiprop="url", iiurlwidth=128)
        for p in data.get("query", {}).get("pages", []):
            ii = p.get("imageinfo")
            if not ii:
                continue
            name = re.sub(r"^File:", "", p["title"])
            out[name] = ii[0].get("thumburl") or ii[0]["url"]
        print(f"  urls {min(i + 50, len(files))}/{len(files)}", flush=True)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--size", type=int, default=64)
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    miss = missing_items()
    names = sorted(miss)
    print(f"{len(names)} objetos sin icono", flush=True)
    if a.limit:
        names = names[:a.limit]
    # 1) page → image file name (trying title variants)
    want = {}  # key -> [titles to try]: the real names of the group (shortest first), then variants of the key
    for n in names:
        group = sorted(miss[n], key=len)
        seen, vs = set(), []
        for t in group + title_variants(n):
            if t not in seen:
                seen.add(t); vs.append(t)
        want[n] = vs
    all_titles = sorted({t for v in want.values() for t in v})
    print(f"{len(all_titles)} títulos a consultar", flush=True)
    wt = wikitext(all_titles)
    found, nopage, noimg = {}, [], []  # found: save-name -> image file
    for n, vs in want.items():
        img, hit = None, None
        for t in vs:
            if t in wt:
                img = image_name(wt[t])
                if img:
                    hit = t; break
        if img:
            found[hit if hit in miss[n] else n] = img.replace("_", " ")
        elif any(t in wt for t in vs):
            noimg.append(n)
        else:
            nopage.append(n)
    print(f"con imagen {len(found)}, página sin imagen {len(noimg)}, sin página {len(nopage)}", flush=True)
    if a.dry:
        for n in nopage[:60]: print("  sin página:", n)
        for n in noimg[:30]: print("  sin imagen:", n)
        return
    # 2) file → url → webp
    urls = image_urls(sorted(set(found.values())))
    ok, failed = 0, []
    for i, (n, img) in enumerate(sorted(found.items()), 1):
        url = urls.get(img)
        if not url:
            failed.append(f"{n}: sin url para {img}"); continue
        try:
            data = get(url).content
            im = Image.open(io.BytesIO(data)).convert("RGBA")
            im.thumbnail((a.size, a.size))
            im.save(os.path.join(ICONS, slug(n) + ".webp"), "WEBP", quality=85, method=6)
            ok += 1
        except Exception as e:
            failed.append(f"{n}: {e}")
        if i % 25 == 0 or i == len(found):
            print(f"  {i}/{len(found)} ({len(failed)} fallos)", flush=True)
    print(f"descargados {ok}, fallos {len(failed)}")
    with open(os.path.join(ROOT, "tools", "icons_pages_log.txt"), "w", encoding="utf-8") as fh:
        fh.write(f"descargados {ok}\n\nSIN PÁGINA ({len(nopage)}):\n" + "\n".join(nopage) + f"\n\nPÁGINA SIN IMAGEN ({len(noimg)}):\n" + "\n".join(noimg) + f"\n\nFALLOS ({len(failed)}):\n" + "\n".join(failed) + "\n")


if __name__ == "__main__":
    main()
