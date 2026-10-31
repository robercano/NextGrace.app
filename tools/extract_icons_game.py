#!/usr/bin/env python3
"""
extract_icons_game.py — iconos de objetos a partir de TU copia de Elden Ring (sin pasar por ninguna wiki).

Entrada (ver tools/EXTRACT.md para obtenerla):
  --menu    carpeta con los atlas de iconos ya convertidos a PNG (SB_ItemIcon_*.png, etc.) y los .layout (XML) del
            sprite bank (menu/hi/01_common.sblytbnd.dcx + 01_common.tpf.dcx, desempaquetados con WitchyBND y
            convertidos con texconv). Se buscan recursivamente.
  --params  carpeta con los params exportados a CSV desde Smithbox: EquipParamWeapon, EquipParamProtector,
            EquipParamAccessory, EquipParamGoods, EquipParamGem (al menos las columnas ID e iconId).
  --out     carpeta de salida (por defecto icons/). Escribe <id de la web>.webp y, además, por nombre de icono.
Opciones: --size 64 (lado máximo), --dry (solo informa), --keep-png.

Cómo casa cada objeto con su icono: la web usa como id el ID del param más un prefijo por tipo
(armas: ID tal cual; armaduras: 0x10000000 + ID; talismanes: 0x20000000 + ID; cenizas de guerra: 0x80000000 + ID;
bienes/hechizos/materiales: 0x40000000 + ID). Cada fila del param tiene un iconId; el .layout dice en qué atlas y
en qué rectángulo está el sprite MENU_ItemIcon_<iconId>.
"""
import argparse, csv, glob, io, json, os, re, sys, xml.etree.ElementTree as ET

try:
    from PIL import Image
except ImportError:
    sys.exit("pip install pillow")

PREFIX = {"EquipParamWeapon": 0, "EquipParamProtector": 0x10000000, "EquipParamAccessory": 0x20000000, "EquipParamGoods": 0x40000000, "EquipParamGem": 0x80000000}
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")


def load_layouts(menu_dir):
    """name (p. ej. 'MENU_ItemIcon_00123') -> (atlas basename sin extensión, x, y, w, h)."""
    sprites = {}
    for path in glob.glob(os.path.join(menu_dir, "**", "*.layout"), recursive=True) + glob.glob(os.path.join(menu_dir, "**", "*.xml"), recursive=True):
        try:
            tree = ET.parse(path)
        except ET.ParseError:
            continue
        root = tree.getroot()
        # formato típico: <TextureAtlas imagePath="SB_ItemIcon_01.png"><SubTexture name="MENU_ItemIcon_00001.png" x=".." y=".." width=".." height=".."/>...
        atlas = root.get("imagePath") or root.get("texture") or os.path.splitext(os.path.basename(path))[0]
        atlas = os.path.splitext(os.path.basename(atlas))[0]
        for st in root.iter():
            name = st.get("name")
            if not name or st.get("x") is None:
                continue
            key = os.path.splitext(name)[0]
            try:
                sprites[key] = (atlas, int(float(st.get("x"))), int(float(st.get("y"))), int(float(st.get("width") or st.get("w"))), int(float(st.get("height") or st.get("h"))))
            except (TypeError, ValueError):
                pass
    return sprites


def load_atlases(menu_dir):
    """basename sin extensión -> ruta PNG (o DDS si Pillow sabe abrirlo)."""
    out = {}
    for ext in ("png", "PNG", "dds", "DDS", "tga"):
        for path in glob.glob(os.path.join(menu_dir, "**", "*." + ext), recursive=True):
            out.setdefault(os.path.splitext(os.path.basename(path))[0], path)
    return out


def load_params(params_dir):
    """[(web_id, iconId, nombre, param)]"""
    rows = []
    for path in glob.glob(os.path.join(params_dir, "**", "*.csv"), recursive=True):
        base = os.path.splitext(os.path.basename(path))[0]
        param = next((p for p in PREFIX if base.lower().startswith(p.lower())), None)
        if not param:
            continue
        with open(path, encoding="utf-8-sig", newline="") as fh:
            rd = csv.reader(fh)
            header = next(rd)
            cols = {h.strip().lower(): i for i, h in enumerate(header)}
            id_col = cols.get("id", 0)
            icon_col = next((i for h, i in cols.items() if h.replace("_", "") == "iconid"), None)
            name_col = cols.get("name")
            if icon_col is None:
                print(f"  {base}: sin columna iconId (cabecera: {header[:6]}…)"); continue
            n = 0
            for r in rd:
                try:
                    pid, icon = int(r[id_col]), int(r[icon_col])
                except (ValueError, IndexError):
                    continue
                if icon <= 0:
                    continue
                rows.append((PREFIX[param] + pid, icon, r[name_col] if name_col is not None and name_col < len(r) else "", param))
                n += 1
            print(f"  {base}: {n} filas con icono")
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--menu", required=True)
    ap.add_argument("--params", required=True)
    ap.add_argument("--out", default=os.path.join(ROOT, "icons"))
    ap.add_argument("--size", type=int, default=64)
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--keep-png", action="store_true")
    a = ap.parse_args()

    sprites = load_layouts(a.menu)
    atlases = load_atlases(a.menu)
    icons = {k: v for k, v in sprites.items() if re.search(r"ItemIcon", k, re.I)}
    print(f"{len(sprites)} sprites en los layouts, {len(icons)} de objetos; {len(atlases)} atlas encontrados")
    if not icons:
        print("No encuentro sprites 'ItemIcon' en los .layout. Mira tools/EXTRACT.md (paso WitchyBND) y revisa que la carpeta tenga los .layout XML."); return
    rows = load_params(a.params)
    print(f"{len(rows)} objetos con iconId en los params")
    # iconId -> sprite key (acepta MENU_ItemIcon_00123, ItemIcon_123, etc.)
    by_num = {}
    for k in icons:
        m = re.search(r"ItemIcon_?(\d+)", k, re.I)
        if m:
            by_num.setdefault(int(m.group(1)), k)
    cache, done, missing_sprite, missing_atlas = {}, 0, set(), set()
    os.makedirs(a.out, exist_ok=True)
    for web_id, icon, name, param in rows:
        key = by_num.get(icon)
        if not key:
            missing_sprite.add(icon); continue
        atlas, x, y, w, h = icons[key]
        if atlas not in atlases:
            missing_atlas.add(atlas); continue
        if a.dry:
            done += 1; continue
        if atlas not in cache:
            try:
                cache[atlas] = Image.open(atlases[atlas]).convert("RGBA")
            except Exception as e:
                print(f"  no puedo abrir el atlas {atlases[atlas]}: {e} (convierte los DDS a PNG con texconv)"); missing_atlas.add(atlas); continue
        im = cache[atlas].crop((x, y, x + w, y + h))
        im.thumbnail((a.size, a.size))
        im.save(os.path.join(a.out, f"{web_id}.webp"), "WEBP", quality=85, method=6)
        if a.keep_png:
            im.save(os.path.join(a.out, f"{web_id}.png"))
        done += 1
    print(f"{'habría' if a.dry else 'he'} escrito {done} iconos; iconId sin sprite: {len(missing_sprite)}; atlas que faltan: {sorted(missing_atlas)[:10]}")
    if missing_sprite:
        print("  ejemplos de iconId sin sprite:", sorted(missing_sprite)[:20])
    if not a.dry:
        names = sorted(f for f in os.listdir(a.out) if f.lower().endswith((".webp", ".png")))
        json.dump(names, open(os.path.join(a.out, "index.json"), "w"), separators=(",", ":"))
        print(f"icons/index.json: {len(names)} entradas")


if __name__ == "__main__":
    main()
