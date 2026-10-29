"""Extract Elden Ring item database from SaveForge Go sources into compact JSON."""
import re, json, sys, os

DATA = sys.argv[1]
OUT = sys.argv[2]

def read(name):
    with open(os.path.join(DATA, name), encoding="utf-8", errors="replace") as f:
        return f.read()

# --- subcategory constants ---------------------------------------------------
subcat_const = {}
for m in re.finditer(r'^\s*(Subcat\w+)\s*=\s*"([^"]*)"', read("subcategories.go"), re.M):
    subcat_const[m.group(1)] = m.group(2)

# --- wepType tables ----------------------------------------------------------
src = read("weapon_type_subcat.go")
weptype_sub = {}
for m in re.finditer(r'^\s*(\d+):\s*(Subcat\w+)', src, re.M):
    weptype_sub[int(m.group(1))] = subcat_const[m.group(2)]
weptype = {}
for m in re.finditer(r'(0x[0-9A-Fa-f]{8}):\s*(\d+)', read("weapon_weptype_generated.go")):
    weptype[int(m.group(1), 16)] = int(m.group(2))

# --- ItemData maps -----------------------------------------------------------
FILES = {
    "melee_armaments.go": "weapon",
    "ranged_and_catalysts.go": "weapon",
    "shields.go": "weapon",
    "arrows_and_bolts.go": "ammo",
    "head.go": "armor", "chest.go": "armor", "arms.go": "armor", "legs.go": "armor",
    "talismans.go": "talisman",
    "ashes_of_war.go": "aow",
    "tools.go": "goods", "key_items.go": "goods", "crafting_materials.go": "goods",
    "bolstering_materials.go": "goods", "info.go": "goods", "ashes.go": "goods",
    "sorceries.go": "goods", "incantations.go": "goods", "gestures.go": "goods",
}
entry_re = re.compile(r'(0x[0-9A-Fa-f]{8}):\s*\{([^\n]*?)\},?\s*$', re.M)
field_re = re.compile(r'(\w+):\s*("(?:[^"\\]|\\.)*"|\[\]string\{[^}]*\}|Subcat\w+|\w+)')

items = {}
for fname, kind in FILES.items():
    if not os.path.exists(os.path.join(DATA, fname)):
        continue
    for m in entry_re.finditer(read(fname)):
        iid = int(m.group(1), 16)
        fields = dict(field_re.findall(m.group(2)))
        name = json.loads(fields.get("Name", '""'))
        cat = json.loads(fields.get("Category", '""'))
        sub = fields.get("SubCategory", "")
        sub = subcat_const.get(sub, sub.strip('"') if sub.startswith('"') else "")
        if kind == "weapon" and iid in weptype:
            sub = weptype_sub.get(weptype[iid], sub)
        d = {"n": name, "k": kind, "c": cat}
        if sub: d["s"] = sub
        mu = int(fields.get("MaxUpgrade", "0") or 0)
        if mu: d["u"] = mu
        if "dlc" in fields.get("Flags", ""): d["dlc"] = 1
        if iid in items and items[iid]["n"] != name:
            # keep first, note duplicate
            continue
        items[iid] = d

# --- canonical names + location from ItemTexts -------------------------------
txt = read("item_text_generated.go")
loc_count = 0
for m in re.finditer(r'(0x[0-9A-Fa-f]{8}):\s*\{(.*?)\},\s*$', txt, re.M):
    iid = int(m.group(1), 16)
    body = m.group(2)
    cn = re.search(r'CanonicalName:\s*("(?:[^"\\]|\\.)*")', body)
    loc = re.search(r'Location:\s*("(?:[^"\\]|\\.)*")', body)
    dn = re.search(r'DisplayName:\s*("(?:[^"\\]|\\.)*")', body)
    if iid not in items:
        continue
    if cn:
        items[iid]["n"] = json.loads(cn.group(1))
    if loc:
        items[iid]["loc"] = json.loads(loc.group(1)); loc_count += 1

# --- infusions ---------------------------------------------------------------
infusions = ["Standard","Heavy","Keen","Quality","Fire","Flame Art","Lightning",
             "Sacred","Magic","Cold","Poison","Blood","Occult"]

# --- fallback names from ClayAmore ER-Save-Editor ---------------------------
CA = sys.argv[3] if len(sys.argv) > 3 else None
added = 0
if CA:
    def rs(name):
        with open(os.path.join(CA, name), encoding="utf-8", errors="replace") as f: return f.read()
    for fname, prefix, kind, cat in [("item_name.rs", 0x40000000, "goods", "tools"), ("armor_name.rs", 0x10000000, "armor", ""), ("accessory_name.rs", 0x20000000, "talisman", "talismans"), ("aow_name.rs", 0x80000000, "aow", "ashes_of_war"), ("weapon_name.rs", 0, "weapon", "melee_armaments")]:
        for m in re.finditer(r'\(\s*(\d+)\s*,\s*"([^"]*)"\s*\)', rs(fname)):
            iid, name = int(m.group(1)) | prefix, m.group(2)
            if not name or iid in items: continue
            c = cat
            if kind == "goods":
                if "Great Rune" in name or "Crystal Tear" in name or "Key" in name or "Medallion" in name: c = "key_items"
                elif "Flask" in name: c = "tools"
            d = {"n": name, "k": kind, "c": c}
            if kind == "weapon" and iid % 10000: continue
            items[iid] = d; added += 1
print("fallback added:", added)

out = {"items": {str(k): v for k, v in sorted(items.items())}, "infusions": infusions}
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

from collections import Counter
print("items:", len(items), "with location:", loc_count)
print(Counter(v["k"] for v in items.values()))
print(Counter(v["c"] for v in items.values()).most_common(30))
