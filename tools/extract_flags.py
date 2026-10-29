#!/usr/bin/env python3
"""extract_flags.py — genera data/flags.json a partir de SaveForge (BST, gracias, jefes) y ER-Save-Editor (jefes de campo).
Uso: python tools/extract_flags.py <SaveForge/backend/db/data> <ER-Save-Editor/src/db>
"""
import json, os, re, sys
SF, ER = sys.argv[1], sys.argv[2]
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
rd = lambda p: open(p, encoding="utf-8", errors="replace").read()

bst = {}
for line in rd(os.path.join(SF, "eventflag_bst.txt")).splitlines():
    if "," in line:
        a, b = line.strip().split(",", 1); bst[int(a)] = int(b)

# graces: "0x00012944: G("Church of Elleh (Limgrave West)")" grouped under "// --- Region ---" comments
graces, region = [], ""
for line in rd(os.path.join(SF, "graces.go")).splitlines():
    m = re.match(r"\s*// --- (.+?) ---", line)
    if m: region = m.group(1); continue
    m = re.match(r"\s*(0x[0-9A-Fa-f]+):\s*([GBD])\w*\(\"([^\"]+)\"", line)
    if m:
        name = re.sub(r"\s*\([^)]*\)\s*$", "", m.group(3))
        graces.append({"id": int(m.group(1), 16), "name": name, "region": region, "boss": m.group(2) == "B"})

bosses, seen = [], set()
for m in re.finditer(r"^\s*(\d+):\s*\{Name:\s*\"([^\"]+)\",\s*Region:\s*\"([^\"]*)\"(?:,\s*Type:\s*\"(\w+)\")?(?:,\s*Remembrance:\s*(true))?", rd(os.path.join(SF, "bosses.go")), re.M):
    key = m.group(2).lower()
    seen.add(key)
    bosses.append({"id": int(m.group(1)), "name": m.group(2), "region": m.group(3), "type": m.group(4) or "", "rem": bool(m.group(5))})
for m in re.finditer(r"\((\d+),\s*\"([^\"]+)\"\)", rd(os.path.join(ER, "bosses.rs"))):
    full = m.group(2); name = re.sub(r"\s*\([^)]*\)\s*$", "", full); place = (re.search(r"\(([^)]*)\)\s*$", full) or [None, ""])[1]
    if name.lower() in seen: continue
    seen.add(name.lower())
    bosses.append({"id": int(m.group(1)), "name": name, "region": place, "type": "field", "rem": False})

out = {"bst": bst, "graces": graces, "bosses": bosses}
json.dump(out, open(os.path.join(ROOT, "data", "flags.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(len(bst), "bloques;", len(graces), "gracias;", len(bosses), "jefes")
