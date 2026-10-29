#!/usr/bin/env python3
"""Regenera icons/index.json con la lista de imágenes de la carpeta icons/."""
import json, os, sys
d = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons")
names = sorted(f for f in os.listdir(d) if f.lower().endswith((".webp", ".png", ".jpg", ".jpeg", ".gif", ".svg")))
json.dump(names, open(os.path.join(d, "index.json"), "w"), separators=(",", ":"))
print(len(names), "iconos indexados")
