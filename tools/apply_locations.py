#!/usr/bin/env python3
"""
apply_locations.py — escribe el campo "loc" de data/items.json a partir de:
  1. data/overrides/locations.json  (manual; gana siempre)   { "<id>" | "<nombre base>": "texto" }
  2. data/locations.json            (descargado de la wiki por tools/fetch_locations.py)
Los objetos sin texto en ninguna de las dos fuentes se quedan sin "loc" (la web muestra solo el enlace a la wiki).
Después regenera data/places.json (tools/build_places.py) porque depende de esos textos.

Uso: python tools/apply_locations.py [--dry]
"""
import argparse, os, runpy, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wikilib as W


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    data = W.load_json("data/items.json")
    db = data["items"]
    store = (W.load_json("data/locations.json") or {}).get("entries", {})
    over = W.load_json("data/overrides/locations.json") or {}
    over = {k: v for k, v in over.items() if not k.startswith("_") and isinstance(v, str) and v.strip()}
    n_over = n_wiki = n_none = n_changed = 0
    for sid, e in db.items():
        base = W.base_name(e["n"], e.get("k"), sid)
        text = over.get(sid) or over.get(e["n"]) or over.get(base)
        if text:
            n_over += 1
        else:
            ent = store.get(base) or store.get(e["n"])
            text = ent["text"] if ent else None
            if text:
                n_wiki += 1
            else:
                n_none += 1
        if (e.get("loc") or None) != (text or None):
            n_changed += 1
        if text:
            e["loc"] = text
        else:
            e.pop("loc", None)
    print(f"objetos: {len(db)}; con texto manual {n_over}, de la wiki {n_wiki}, sin texto {n_none}; cambian {n_changed}")
    if a.dry:
        return
    W.save_json("data/items.json", data)
    runpy.run_path(os.path.join(os.path.dirname(os.path.abspath(__file__)), "build_places.py"), run_name="__main__")
    print("data/items.json y data/places.json regenerados")


if __name__ == "__main__":
    main()
