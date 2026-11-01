#!/usr/bin/env python3
"""
fetch_locations.py — texto de ubicación ("dónde se consigue") de cada objeto desde eldenring.wiki.gg (CC BY-SA 4.0).

Lee los nombres de data/items.json (un nombre base por grupo: sin +N ni infusión), pide el wikitexto de cada
página (50 títulos por petición, probando variantes de título para los que no existen) y extrae la sección
"Location" / "Where to find" / "Acquisition" (o el parámetro equivalente del infobox).

Escribe data/locations.json, el almacén persistente:
  { "source": "...", "license": "CC BY-SA 4.0", "fetched": "YYYY-MM-DD",
    "entries": { "<nombre base>": { "text": "...", "page": "<título de la página>", "fetched": "YYYY-MM-DD" } },
    "missing": ["<nombre base>", ...] }
Cada ejecución RELLENA y ACTUALIZA: si la wiki tiene texto para un objeto, sustituye el anterior; si no lo tiene,
conserva lo que hubiera. Nunca borra. Las correcciones manuales van en data/overrides/locations.json (ver
tools/apply_locations.py), que gana siempre sobre este fichero.

Uso: python tools/fetch_locations.py [--probe N] [--only "Nombre"]
  --probe N   sondeo: imprime encabezados, parámetros del infobox y texto extraído de N páginas por tipo y sale
  --only X    solo ese nombre (para depurar un caso)
"""
import argparse, collections, datetime, json, re, sys, os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wikilib as W

PLACEHOLDERS = {"Unarmed", "Head", "Body", "Arms", "Legs"}
LOC_PARAMS = ["location", "locations", "where_to_find", "where to find", "acquisition", "acquired", "obtained", "obtain",
              "how_to_get", "found", "availability", "sold_by", "sold by", "dropped_by", "drop", "drops", "source"]
LOC_SECTION = re.compile(r"^(location|locations|where to (find|get|obtain|buy)|how to (get|obtain|acquire|find)|acquisition|acquiring|obtaining|obtained|availability|sources?)\b", re.I)
MAX_CHARS = 420
MAX_ITEMS = 4


def groups(db):
    """nombre base -> [ids] (excluye duplicados marcados con f y los marcadores de hueco)."""
    g = collections.OrderedDict()
    for sid, e in db.items():
        if e.get("f") or e["n"] in PLACEHOLDERS or e["n"].startswith("?"):
            continue
        g.setdefault(W.base_name(e["n"]), []).append(sid)
    return g


def clean_lines(body):
    """Cuerpo de sección → lista de frases limpias (viñetas y párrafos), sin tablas, galerías ni subencabezados."""
    out, in_table, in_gallery = [], False, False
    for raw in body.split("\n"):
        line = raw.strip()
        if not line:
            continue
        if line.startswith("{|"):
            in_table = True
        if in_table:
            if line.startswith("|}"):
                in_table = False
            continue
        if re.match(r"<gallery", line, re.I):
            in_gallery = True
        if in_gallery:
            if re.search(r"</gallery>", line, re.I):
                in_gallery = False
            continue
        if line.startswith(("{{", "[[File:", "[[Image:", "__", "<!--")) or re.match(r"^\{\{[^}]*\}\}$", line):
            # plantillas de aviso / imágenes sueltas; pero conservar viñetas que empiezan por plantilla con texto detrás
            if not line.startswith("{{") or not W.strip_markup(line):
                continue
        line = re.sub(r"^[*#:;]+\s*", "", line)
        txt = W.strip_markup(line)
        txt = re.sub(r"\s+([.,;:)])", r"\1", txt).strip(" -–—·")
        if len(txt) < 3:
            continue
        out.append(txt)
    return out


def squeeze(lines):
    """Une hasta MAX_ITEMS frases en un texto corto (MAX_CHARS), cortando en fin de frase."""
    parts = []
    for t in lines[:MAX_ITEMS]:
        if not re.search(r"[.!?]$", t):
            t += "."
        parts.append(t)
    s = " ".join(parts)
    if len(s) > MAX_CHARS:
        cut = s[:MAX_CHARS]
        m = re.search(r"^(.*[.!?])\s", cut)
        s = (m.group(1) if m and len(m.group(1)) > 80 else cut.rstrip() + "…")
    return s


def extract(txt):
    """(texto, de dónde salió) o (None, None)."""
    # 1) sección dedicada
    for level, title, body in W.sections(txt):
        if title and LOC_SECTION.match(title):
            lines = clean_lines(body)
            if lines:
                return squeeze(lines), "section:" + title
    # 2) parámetro del infobox
    for name, p in W.templates(txt):
        for k in LOC_PARAMS:
            v = p.get(k)
            if v:
                lines = clean_lines(v.replace("<br>", "\n").replace("<br/>", "\n").replace("<br />", "\n"))
                if lines:
                    return squeeze(lines), "param:" + k
    return None, None


def fetch_pages(names):
    """nombre -> (título real, wikitext) probando variantes de título para los que no existen."""
    found = W.wikitext(names)
    missing = [n for n in names if n not in found]
    if missing:
        alt = {}
        for n in missing:
            for v in W.title_variants(n)[1:]:
                alt.setdefault(v, []).append(n)
        if alt:
            print(f"  variantes para {len(missing)} sin página: {len(alt)} títulos", flush=True)
            got = W.wikitext(list(alt))
            for v, (title, txt) in got.items():
                for n in alt[v]:
                    found.setdefault(n, (title, txt))
    return found


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--probe", type=int, default=0)
    ap.add_argument("--only")
    a = ap.parse_args()
    db = W.load_json("data/items.json")["items"]
    g = groups(db)
    kind_of = {n: db[ids[0]].get("k") for n, ids in g.items()}
    names = list(g)
    if a.only:
        names = [n for n in names if n.lower() == a.only.lower()] or [a.only]
    print(f"{len(names)} nombres ({collections.Counter(kind_of.get(n) for n in names)})", flush=True)

    if a.probe:
        sample = []
        for k in ("weapon", "armor", "talisman", "goods", "aow", "ammo"):
            sample += [n for n in names if kind_of.get(n) == k][:a.probe]
        pages = fetch_pages(sample)
        for n in sample:
            print("=" * 78); print(f"{n}  [{kind_of.get(n)}]")
            if n not in pages:
                print("  (sin página; variantes probadas:", W.title_variants(n), ")"); continue
            title, txt = pages[n]
            print(f"  página: {title}")
            print("  encabezados:", [t for _, t, _ in W.sections(txt) if t])
            for tn, p in W.templates(txt)[:4]:
                hit = {k: v[:100] for k, v in p.items() if any(x in k for x in ("loc", "where", "acq", "obtain", "found", "sold", "drop", "source", "avail"))}
                print(f"  {{{{{tn}}}}} params: {len(p)}" + (f" → {hit}" if hit else ""))
            text, how = extract(txt)
            print(f"  extraído ({how}): {text!r}")
        return

    store = W.load_json("data/locations.json") or {"entries": {}}
    entries = store.get("entries", {})
    today = datetime.datetime.utcnow().strftime("%Y-%m-%d")
    pages = fetch_pages(names)
    stats = collections.Counter(); heads = collections.Counter(); hows = collections.Counter()
    nopage, notext = [], []
    for n in names:
        if n not in pages:
            stats["sin página"] += 1; nopage.append(n); continue
        title, txt = pages[n]
        for _, t, _ in W.sections(txt):
            if t:
                heads[t.lower()] += 1
        text, how = extract(txt)
        if text:
            if n in entries and entries[n].get("text") == text:
                stats["igual"] += 1
            elif n in entries:
                stats["actualizado"] += 1
            else:
                stats["nuevo"] += 1
            entries[n] = {"text": text, "page": title, "fetched": today}
            hows[how.split(":")[0]] += 1
        else:
            stats["página sin texto de ubicación"] += 1; notext.append(f"{n} ({title})")
    kept = [n for n in names if n in entries and entries[n].get("fetched") != today]
    missing = sorted(n for n in names if n not in entries)
    if not a.only:
        store = {"source": W.WIKI, "license": W.LICENSE, "fetched": today, "entries": dict(sorted(entries.items())), "missing": missing}
        W.save_json("data/locations.json", store, compact=False)
    print()
    print(f"resultado: {dict(stats)}; conservados de ejecuciones anteriores: {len(kept)}; origen del texto: {dict(hows)}")
    print(f"con texto: {len(names) - len(missing)}/{len(names)}; sin texto: {len(missing)} → data/locations.json")
    by_kind = collections.Counter(kind_of.get(n) for n in missing)
    print(f"sin texto por tipo: {dict(by_kind)}")
    print("\nencabezados más frecuentes (para ajustar LOC_SECTION):", heads.most_common(40))
    print(f"\nSIN PÁGINA ({len(nopage)}):"); print("\n".join(nopage))
    print(f"\nPÁGINA SIN TEXTO DE UBICACIÓN ({len(notext)}):"); print("\n".join(notext))


if __name__ == "__main__":
    main()
