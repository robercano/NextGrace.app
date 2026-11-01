"""
wikilib.py — acceso a eldenring.wiki.gg (API MediaWiki) compartido por los scripts tools/fetch_*.py.

Contenido de la wiki: CC BY-SA 4.0 (pie de página de la wiki). Lo que se deriva de aquí (reqs.json,
ubicaciones) se publica con esa licencia y atribución en la página de créditos de la web.
"""
import json, os, re, time

try:
    import requests
except ImportError:
    raise SystemExit("pip install requests")

WIKI = os.environ.get("TL_WIKI", "https://eldenring.wiki.gg")
LICENSE = "CC BY-SA 4.0"
UA = "TarnishedLedgerFetch/2.0 (https://github.com/robercano/TarnishedViewer; python-requests)"
DELAY = float(os.environ.get("TL_DELAY", "1.5"))
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
INFUSIONS = ["Heavy", "Keen", "Quality", "Fire", "Flame Art", "Lightning", "Sacred", "Magic", "Cold", "Poison", "Blood", "Occult"]
INF_ANY = re.compile(r"\b(" + "|".join(re.escape(i) for i in INFUSIONS) + r")\b\s*")

session = requests.Session()
session.headers["User-Agent"] = UA
_last = [0.0]


def get(params):
    """GET api.php con espera entre peticiones y reintentos ante 429/503."""
    backoff = 30
    for _ in range(8):
        wait = DELAY - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        r = session.get(WIKI + "/api.php", params=params, timeout=120)
        if r.status_code in (429, 503):
            ra = r.headers.get("Retry-After")
            pause = int(ra) if ra and ra.isdigit() else backoff
            print(f"  {r.status_code}: espero {pause}s", flush=True)
            time.sleep(pause)
            backoff = min(backoff * 2, 300)
            continue
        r.raise_for_status()
        return r.json()
    raise RuntimeError("demasiados reintentos")


def wikitext(titles, quiet=False):
    """title pedido -> (título real, wikitext), resolviendo redirecciones; 50 títulos por petición."""
    out = {}
    titles = list(dict.fromkeys(titles))
    for i in range(0, len(titles), 50):
        chunk = titles[i:i + 50]
        data = get({"action": "query", "format": "json", "prop": "revisions", "rvslots": "main", "rvprop": "content",
                    "redirects": 1, "titles": "|".join(chunk), "formatversion": 2})
        q = data.get("query", {})
        redir = {r["from"]: r["to"] for r in q.get("redirects", [])}
        norm = {n["from"]: n["to"] for n in q.get("normalized", [])}
        by_title = {}
        for p in q.get("pages", []):
            if "missing" in p or "invalid" in p:
                continue
            try:
                by_title[p["title"]] = p["revisions"][0]["slots"]["main"]["content"]
            except (KeyError, IndexError):
                pass
        for t in chunk:
            t2 = norm.get(t, t)
            t2 = redir.get(t2, t2)
            if t2 in by_title:
                out[t] = (t2, by_title[t2])
        if not quiet:
            print(f"  {min(i + 50, len(titles))}/{len(titles)}", flush=True)
    return out


def templates(text):
    """[(nombre, {param: valor})] de las plantillas de primer nivel del wikitexto."""
    res, i, n = [], 0, len(text)
    while True:
        s = text.find("{{", i)
        if s < 0:
            break
        depth, j = 0, s
        while j < n:
            if text.startswith("{{", j):
                depth += 1; j += 2
            elif text.startswith("}}", j):
                depth -= 1; j += 2
                if depth == 0:
                    break
            else:
                j += 1
        body = text[s + 2:j - 2]
        i = j
        parts, depth, cur, k = [], 0, [], 0
        while k < len(body):
            c = body[k]
            if body.startswith("{{", k) or body.startswith("[[", k):
                depth += 1; cur.append(body[k:k + 2]); k += 2; continue
            if body.startswith("}}", k) or body.startswith("]]", k):
                depth -= 1; cur.append(body[k:k + 2]); k += 2; continue
            if c == "|" and depth == 0:
                parts.append("".join(cur)); cur = []
            else:
                cur.append(c)
            k += 1
        parts.append("".join(cur))
        name = parts[0].strip()
        params = {}
        for idx, p in enumerate(parts[1:]):
            if "=" in p:
                k2, v = p.split("=", 1)
                params[k2.strip().lower()] = v.strip()
            else:
                params[str(idx + 1)] = p.strip()
        res.append((name, params))
    return res


def sections(text):
    """[(nivel, título, cuerpo)] por encabezados == ... ==; el primer elemento es el preámbulo (nivel 0, '')."""
    out, cur_title, cur_level, buf = [], "", 0, []
    for line in text.split("\n"):
        m = re.match(r"^(={2,6})\s*(.*?)\s*\1\s*$", line)
        if m:
            out.append((cur_level, cur_title, "\n".join(buf)))
            cur_level, cur_title, buf = len(m.group(1)), m.group(2).strip(), []
        else:
            buf.append(line)
    out.append((cur_level, cur_title, "\n".join(buf)))
    return out


def _tpl(m):
    parts = [x.strip() for x in m.group(1).split("|")]
    name, args = parts[0].lower(), [x for x in parts[1:] if "=" not in x]
    if name in ("runes", "rune", "r") and args:
        return args[0] + " Runes"
    if name in ("stub", "cleanup", "expand", "incomplete", "clear", "clr", "main", "see also", "verify", "citation needed", "cn"):
        return ""
    return args[-1] if args else ""


def strip_markup(s):
    """Wikitexto → texto plano corto (enlaces a su etiqueta, plantillas fuera, sin refs ni HTML)."""
    s = re.sub(r"<ref[^>]*/>", "", s)
    s = re.sub(r"<ref[^>]*>.*?</ref>", "", s, flags=re.S)
    s = re.sub(r"<!--.*?-->", "", s, flags=re.S)
    # plantillas, de dentro afuera: {{Runes|400}} → "400 Runes"; {{X|texto}} → "texto"; sin argumentos → nada
    for _ in range(6):
        s2 = re.sub(r"\{\{([^{}]*)\}\}", _tpl, s)
        if s2 == s:
            break
        s = s2
    s = re.sub(r"\[\[(?:File|Image|Category):[^\]]*\]\]", "", s, flags=re.I)
    s = re.sub(r"\[\[[^\]|]*\|([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"\[\[([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"\[https?://\S+\s+([^\]]*)\]", r"\1", s)
    s = re.sub(r"\[https?://\S+\]", "", s)
    s = re.sub(r"<br\s*/?>", " ", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    s = s.replace("'''", "").replace("''", "")
    s = re.sub(r"&nbsp;", " ", s)
    s = re.sub(r"[ \t]+", " ", s)
    return s.strip()


def base_name(n):
    """Nombre sin +N ni infusión (como wikiName en src/app.js)."""
    n = re.sub(r"\s*\+\s*\d+\s*$", "", n).strip()
    for inf in INFUSIONS:
        if n.startswith(inf + " ") and len(n) > len(inf) + 1:
            return n[len(inf) + 1:]
    return n


def title_variants(n):
    """Títulos que puede tener la página de un objeto, del más probable al menos."""
    v = [n]
    if "[" in n:
        v.append(n.replace("[", "(").replace("]", ")"))
        v.append(re.sub(r"\s*\[\d+\]$", "", n))
    for pre in ("Ash of War: ", "Note: ", "Map: "):
        if n.startswith(pre):
            v.append(n[len(pre):])
    if n.startswith("Map: "):
        v.append(n[len("Map: "):] + " (map)")
    stripped = INF_ANY.sub("", n).strip()
    if stripped and stripped != n:
        v.append(stripped)
    return list(dict.fromkeys(v))


def load_json(rel, default=None):
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        return default
    return json.load(open(p, encoding="utf-8"))


def save_json(rel, data, compact=True):
    p = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as fh:
        if compact:
            json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
        else:
            json.dump(data, fh, ensure_ascii=False, indent=1, sort_keys=True)
            fh.write("\n")
