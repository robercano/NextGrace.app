#!/usr/bin/env python3
"""
fetch_reqs.py — requisitos de atributos y escalado de armas, hechizos y encantamientos desde eldenring.wiki.gg.

Lee los nombres de data/items.json, pide el wikitexto de cada página (API MediaWiki, 50 títulos por petición),
extrae los parámetros del infobox y escribe data/reqs.json:
  { "weapons": { "<nombre base>": { "req": {"str":9,"dex":8,"int":0,"fai":0,"arc":0}, "scale": {"str":"D","dex":"D"}, "weight": 3.5, "somber": false } },
    "spells":  { "<nombre>": { "req": {"int":0,"fai":21,"arc":0}, "fp": 13, "slots": 1, "kind": "sorcery" } },
    "source": "...", "fetched": "...", "missing": [...] }

Cada ejecución conserva lo que ya había para las páginas que la wiki ya no devuelve (nunca borra) y aplica encima
data/overrides/reqs.json (correcciones manuales, campo a campo).

Uso: python tools/fetch_reqs.py [--probe N] [--apply-only]
  --probe N      imprime los parámetros crudos de N páginas y sale
  --apply-only   no descarga nada: solo vuelve a mezclar data/overrides/reqs.json sobre data/reqs.json
"""
import argparse, json, os, re, sys, time, datetime

try:
    import requests
except ImportError:
    sys.exit("pip install requests")

WIKI = os.environ.get("TL_WIKI", "https://eldenring.wiki.gg")
UA = "TarnishedLedgerReqsFetch/1.0 (personal use; python-requests)"
DELAY = float(os.environ.get("TL_DELAY", "1.5"))
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
INFUSIONS = ["Heavy", "Keen", "Quality", "Fire", "Flame Art", "Lightning", "Sacred", "Magic", "Cold", "Poison", "Blood", "Occult"]

session = requests.Session()
session.headers["User-Agent"] = UA
_last = [0.0]


def get(params):
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


def wikitext(titles):
    """title -> wikitext (resolviendo redirecciones)."""
    out = {}
    for i in range(0, len(titles), 50):
        chunk = titles[i:i + 50]
        data = get({"action": "query", "format": "json", "prop": "revisions", "rvslots": "main", "rvprop": "content",
                    "redirects": 1, "titles": "|".join(chunk), "formatversion": 2})
        q = data.get("query", {})
        redir = {r["from"]: r["to"] for r in q.get("redirects", [])}
        norm = {n["from"]: n["to"] for n in q.get("normalized", [])}
        by_title = {}
        for p in q.get("pages", []):
            if "missing" in p:
                continue
            try:
                by_title[p["title"]] = p["revisions"][0]["slots"]["main"]["content"]
            except (KeyError, IndexError):
                pass
        for t in chunk:
            t2 = norm.get(t, t)
            t2 = redir.get(t2, t2)
            if t2 in by_title:
                out[t] = by_title[t2]
        print(f"  {min(i + 50, len(titles))}/{len(titles)}", flush=True)
    return out


def templates(text):
    """Devuelve [(nombre, {param: valor})] de las plantillas de primer nivel."""
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
        # split on top-level pipes
        parts, depth, cur = [], 0, []
        k = 0
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


def num(v):
    m = re.search(r"-?\d+(?:\.\d+)?", v or "")
    return float(m.group()) if m and "." in m.group() else (int(m.group()) if m else None)


def base_weapon_name(n):
    for inf in INFUSIONS:
        if n.startswith(inf + " "):
            rest = n[len(inf) + 1:]
            if rest:
                return rest
    return n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--probe", type=int, default=0)
    ap.add_argument("--apply-only", action="store_true")
    args = ap.parse_args()
    path = os.path.join(ROOT, "data", "reqs.json")
    if args.apply_only:
        out = json.load(open(path, encoding="utf-8"))
        n = apply_overrides(out)
        json.dump(out, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
        print(f"{n} correcciones manuales aplicadas → {path}"); return
    db = json.load(open(os.path.join(ROOT, "data", "items.json"), encoding="utf-8"))["items"]
    weapons = sorted({base_weapon_name(re.sub(r"\s*\+\d+$", "", e["n"])) for e in db.values() if e.get("k") == "weapon" and e.get("c") != "arrows_and_bolts" and not e.get("f")})
    spells = sorted({e["n"] for e in db.values() if e.get("c") in ("sorceries", "incantations") and not e.get("f")})
    print(f"{len(weapons)} armas, {len(spells)} hechizos", flush=True)

    if args.probe:
        sample = weapons[:args.probe] + spells[:args.probe]
        wt = wikitext(sample)
        for t in sample:
            print("=" * 80); print(t)
            txt = wt.get(t)
            if not txt:
                print("  (sin página)"); continue
            for name, params in templates(txt)[:3]:
                print(f"  {{{{{name}}}}}")
                for k, v in params.items():
                    print(f"     {k} = {v[:80]!r}")
        return

    prev = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {"weapons": {}, "spells": {}}
    out = {"weapons": {}, "spells": {}, "source": WIKI, "license": "CC BY-SA 4.0", "fetched": datetime.datetime.utcnow().strftime("%Y-%m-%d"), "missing": []}
    wt = wikitext(weapons)
    for t in weapons:
        txt = wt.get(t)
        rec = parse_weapon(txt) if txt else None
        if rec:
            out["weapons"][t] = rec
        elif t in prev.get("weapons", {}):
            out["weapons"][t] = prev["weapons"][t]; out["missing"].append(t + " (conservado de una ejecución anterior)")
        else:
            out["missing"].append(t + ("" if not txt else " (sin infobox)"))
    wt = wikitext(spells)
    for t in spells:
        txt = wt.get(t)
        rec = parse_spell(txt) if txt else None
        if rec:
            out["spells"][t] = rec
        elif t in prev.get("spells", {}):
            out["spells"][t] = prev["spells"][t]; out["missing"].append(t + " (conservado de una ejecución anterior)")
        else:
            out["missing"].append(t + ("" if not txt else " (sin infobox)"))
    n = apply_overrides(out)
    json.dump(out, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"armas {len(out['weapons'])}, hechizos {len(out['spells'])}, sin datos {len(out['missing'])}, correcciones manuales {n} → {path}")


def apply_overrides(out):
    """Mezcla data/overrides/reqs.json campo a campo sobre out; devuelve cuántas entradas tocó."""
    p = os.path.join(ROOT, "data", "overrides", "reqs.json")
    if not os.path.exists(p):
        return 0
    ov = json.load(open(p, encoding="utf-8")); n = 0
    for sec in ("weapons", "spells"):
        for name, rec in (ov.get(sec) or {}).items():
            if not isinstance(rec, dict):
                continue
            cur = out.setdefault(sec, {}).setdefault(name, {})
            for k, v in rec.items():
                if isinstance(v, dict) and isinstance(cur.get(k), dict):
                    cur[k].update(v)
                else:
                    cur[k] = v
            n += 1
    return n


# --- parsers (se ajustan según lo que muestre --probe) --------------------------------------------
STAT_KEYS = {"str": ["str", "strength", "req_str", "str_req", "strreq"], "dex": ["dex", "dexterity", "req_dex", "dex_req", "dexreq"],
             "int": ["int", "intelligence", "req_int", "int_req", "intreq"], "fai": ["fai", "faith", "req_fai", "fai_req", "faireq", "fth"],
             "arc": ["arc", "arcane", "req_arc", "arc_req", "arcreq"]}


def pick(params, keys):
    for k in keys:
        if k in params and params[k] != "":
            return params[k]
    return None


def parse_weapon(txt):
    for name, p in templates(txt):
        low = {k: v for k, v in p.items()}
        if not any(k for k in low if "str" in k or "scal" in k or "req" in k):
            continue
        req, scale = {}, {}
        for s, keys in STAT_KEYS.items():
            v = pick(low, [k + "_req" for k in keys] + ["req_" + k for k in keys] + [k + "req" for k in keys] + keys)
            n = num(v) if v is not None else None
            req[s] = int(n) if n is not None else 0
            sv = pick(low, [k + "_scaling" for k in keys] + [k + "_scale" for k in keys] + ["scaling_" + k for k in keys] + [k + "scaling" for k in keys] + [k + "_sc" for k in keys])
            if sv:
                m = re.search(r"\b([SABCDE])\b", sv)
                if m:
                    scale[s] = m.group(1)
        w = num(pick(low, ["weight", "wt"]) or "")
        rec = {"req": req, "scale": scale, "weight": w, "type": re.sub(r"\[\[|\]\]", "", pick(low, ["type"]) or "")}
        for k in ("sorcery_scaling", "incant_scaling"):
            v = num(low.get(k) or "")
            if v:
                rec[k.split("_")[0]] = v
        sk = pick(low, ["skills", "skill"]) or ""
        m = re.search(r"\[\[(?:[^|\]]*\|)?([^\]]+)\]\]", sk)
        if m:
            rec["skill"] = m.group(1)
        if any(req.values()) or scale:
            return rec
    return None


def parse_spell(txt):
    for name, p in templates(txt):
        if not any(k for k in p if "int" in k or "fai" in k or "req" in k or "fp" in k or "cost" in k):
            continue
        req = {}
        for s in ("int", "fai", "arc"):
            keys = STAT_KEYS[s]
            v = pick(p, [k + "_req" for k in keys] + ["req_" + k for k in keys] + [k + "req" for k in keys] + keys)
            n = num(v) if v is not None else None
            req[s] = int(n) if n is not None else 0
        fp = num(pick(p, ["fp", "fp_cost", "cost", "fpcost"]) or "")
        slots = num(pick(p, ["slots_used", "slots", "slot", "memory", "memory_slots"]) or "")
        kind = "incantation" if "incant" in (name + " " + str(p.get("type", ""))).lower() else "sorcery"
        if any(req.values()) or fp is not None:
            return {"req": req, "fp": fp, "slots": slots, "kind": kind, "effect": re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]+)\]\]", r"\1", p.get("item_effect", ""))[:120]}
    return None


if __name__ == "__main__":
    main()
