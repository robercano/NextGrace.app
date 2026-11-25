#!/usr/bin/env python3
"""
params_from_regulation.py — the game's params straight from `regulation.bin`, as the CSVs Smithbox would export, so the other
scripts here (graces_from_param.py, pickups_from_msb.py, equip_from_params.py) run unchanged and nobody has to click through
the Param Editor. Needs `soulstruct` (pip install soulstruct) and, outside Windows, `pyooz` for the Oodle decompression
(pip install pyooz); the AES key is the public one every modding tool uses.

  python tools/game/params_from_regulation.py "C:/.../ELDEN RING/Game/regulation.bin" OUT_DIR [Param ...]

Writes OUT_DIR/<Param>.csv (header: ID, Name, then the Paramdex field names, bit fields without the ':N'). Booleans as 1/0.
Default params: the ones the extraction plan uses. The CSVs are game data: keep them out of every repo.
"""
import csv, dataclasses, ntpath, os, sys, tempfile

DEFAULT = ["BonfireWarpParam", "ItemLotParam_map", "ItemLotParam_enemy", "EquipParamWeapon", "ReinforceParamWeapon", "CalcCorrectGraph",
           "AttackElementCorrectParam", "EquipParamProtector", "EquipParamAccessory", "Magic", "EquipMtrlSetParam", "EquipParamGem", "EquipParamGoods"]
KEY = bytes([0x99, 0xBF, 0xFC, 0x36, 0x6A, 0x6B, 0xC8, 0xC6, 0xF5, 0x82, 0x7D, 0x09, 0x36, 0x02, 0xD6, 0x76,
             0xC4, 0x28, 0x92, 0xA0, 0x1C, 0x20, 0x7F, 0xB0, 0x24, 0xD3, 0xAF, 0x4E, 0x49, 0x3F, 0xEF, 0x99])  # Elden Ring regulation key (SoulsFormats)

def decrypt(path):
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    d = open(path, "rb").read()
    dec = Cipher(algorithms.AES(KEY), modes.CBC(d[:16])).decryptor()
    out = dec.update(d[16:]) + dec.finalize()
    if out[:4] != b"DCX\0": raise SystemExit("decryption failed: not a DCX (wrong key or not a regulation.bin)")
    return out

def load(path):
    import logging; logging.disable(logging.WARNING)
    if os.name != "nt":
        import ooz
        import soulstruct.dcx.oodle as oodle
        oodle.decompress = lambda data, size: ooz.decompress(bytes(data), size)
    from soulstruct.eldenring.params import GameParamBND
    g = GameParamBND.from_bytes(decrypt(path))
    return {ntpath.basename(k): v for k, v in g.params.items()}

def cell(v):
    if isinstance(v, bool): return "1" if v else "0"
    if isinstance(v, float): return repr(v) if v != int(v) else str(int(v))
    if hasattr(v, "value"): return str(v.value)  # enums
    return str(v)

def export(params, name, out_dir):
    p = params.get(name)
    if p is None: print(f"  {name}: not in the regulation, skipped"); return
    fields = [(f.name, f.metadata["param"].internal_name.split(":")[0]) for f in dataclasses.fields(next(iter(p.values())))
              if "param" in f.metadata and not f.metadata["param"].is_pad and not f.name.startswith("_")]
    dst = os.path.join(out_dir, name + ".csv")
    with open(dst, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(["ID", "Name"] + [n for _, n in fields])
        for rid, row in p.items():
            w.writerow([rid, getattr(row, "Name", "") or ""] + [cell(getattr(row, a)) for a, _ in fields])
    print(f"  {name}: {len(p)} rows, {len(fields)} fields → {dst}")

def main():
    if len(sys.argv) < 3: print(__doc__); sys.exit(1)
    reg, out_dir, names = sys.argv[1], sys.argv[2], sys.argv[3:] or DEFAULT
    os.makedirs(out_dir, exist_ok=True)
    params = load(reg)
    print(f"{len(params)} params in {reg}")
    for n in names: export(params, n, out_dir)

if __name__ == "__main__":
    main()
