#!/usr/bin/env python3
"""
equip_from_params.py — the game's equipment numbers, from Smithbox CSV exports (Param Editor → <param> → Export → CSV → All rows):

  EquipParamWeapon.csv            base attack per damage type, scaling (correct*), requirements (proper*), reinforce type,
                                  attack-element-correct id, graph ids (correctType_*), weight, category, infusability
  ReinforceParamWeapon.csv        per upgrade level: attack and scaling multipliers (rows = reinforceTypeId + level)
  CalcCorrectGraph.csv            the stat → bonus curves (stageMaxVal*, stageMaxGrowVal*, adjPt_maxGrowVal*)
  AttackElementCorrectParam.csv   which stat scales which damage type (is*Correct_by*), optional overwrite rates
  EquipParamProtector.csv         armor: weight, damage cut rates, resistances, poise
  EquipParamAccessory.csv         talismans: weight (effects live in SpEffectParam; not extracted yet)
  Magic.csv                       spells: requirements, FP, stamina, slots, type
  EquipMtrlSetParam.csv           upgrade materials per set (materialId*, itemNum*)

  python tools/game/equip_from_params.py C:\\trabajo         (the folder with the CSVs; missing ones are skipped)
  → <assets repo>/gamedata/ar.json     weapons + reinforce + graphs + aec, lean: what src/ar.js needs for the attack rating
  → <assets repo>/gamedata/equip.json  everything else (armor, talismans, spells, materials, and the weapon rows with names)

Field names are kept as Smithbox prints them (Paramdex), filtered by the patterns below, so the browser code can refer to
them by name; if a name differs between Paramdex versions, src/ar.js prints what it misses.
"""
import csv, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(os.environ.get("NEXTGRACE_ASSETS") or os.path.join(os.path.dirname(ROOT), "nextgrace-assets"), "gamedata")

# which fields to keep per param (regex on the field name; ID and Name always)
KEEP = {
    "EquipParamWeapon": r"^(attackBase|correct(Strength|Agility|Magic|Faith|Luck)$|correctType_|proper|reinforceTypeId|attackElementCorrectId|weight|wepType|gemMountType|materialSetId|reinforcePrice|isDualBlade|wepmotionCategory|attackBaseStamina|saWeaponDamage|spEffectBehaviorId|enableGuard|physGuardCutRate|guard|disableGemAttr|sortId|iconId)",
    "ReinforceParamWeapon": r"^(physicsAtkRate|magicAtkRate|fireAtkRate|thunderAtkRate|darkAtkRate|staminaAtkRate|saWeaponAtkRate|correct(Strength|Agility|Magic|Faith|Luck)Rate|.*GuardCutRate|maxReinforceLevel|reinforcePriceRate|spEffectId|residentSpEffectId)",
    "CalcCorrectGraph": r"^(stageMaxVal|stageMaxGrowVal|adjPt_maxGrowVal)",
    "AttackElementCorrectParam": r"^(is(Strength|Dexterity|Magic|Faith|Luck)Correct_by|overwrite.*CorrectRate_by|Influence.*CorrectRate_by)",
    "EquipParamProtector": r"^(weight|.*DamageCutRate|resist|toughnessCorrectRate|protectorCategory|equipModelCategory|sortId|iconId|poise|residentSpEffectId)",
    "EquipParamAccessory": r"^(weight|refId|accessoryGroup|sortId|iconId)",
    "Magic": r"^(requirement|slotLength|mp$|stamina$|spellType|ezStateBehaviorType|sortId|iconId|castSpeed|refCategory|isHallow|enableOffline)",
    "EquipMtrlSetParam": r"^(materialId|itemNum|materialCate|isDisableDispNum)",
}

def read_csv(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.reader(f))
    head = [h.strip() for h in rows[0]]
    return head, [r for r in rows[1:] if r and r[0].strip()]

def num(v):
    try:
        f = float(v); return int(f) if f.is_integer() else round(f, 4)
    except (TypeError, ValueError):
        return v

def extract(folder, name):
    path = os.path.join(folder, name + ".csv")
    if not os.path.exists(path):
        print(f"  {name}.csv not found, skipped"); return None
    head, rows = read_csv(path)
    pat = re.compile(KEEP[name])
    keep = [i for i, h in enumerate(head) if pat.search(h)]
    idcol = next((i for i, h in enumerate(head) if h.lower() == "id"), 0)
    namecol = next((i for i, h in enumerate(head) if h.lower() == "name"), None)
    out = {}
    for r in rows:
        try: rid = int(float(r[idcol]))
        except ValueError: continue
        e = {head[i]: num(r[i]) for i in keep if i < len(r)}
        if namecol is not None and namecol < len(r) and r[namecol]: e["Name"] = r[namecol]
        out[rid] = e
    print(f"  {name}: {len(out)} rows, {len(keep)} fields kept: {', '.join(head[i] for i in keep[:8])}{'…' if len(keep) > 8 else ''}")
    return out

def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    folder = sys.argv[1]
    data = {"_source": "Elden Ring params via Smithbox (tools/game/equip_from_params.py)", "fields": {}}
    for name in KEEP:
        d = extract(folder, name)
        if d is not None:
            data[name] = d
            data["fields"][name] = sorted({k for e in d.values() for k in e.keys()})
    os.makedirs(OUT, exist_ok=True)
    # ar.json: only the fields the calculator reads, no names (the site has them), so the browser downloads as little as possible
    AR_W = re.compile(r"^(attackBase(Physics|Magic|Fire|Thunder|Dark)|correct(Strength|Agility|Magic|Faith|Luck)$|correctType_|proper(Strength|Agility|Magic|Faith|Luck)|reinforceTypeId|attackElementCorrectId|wepType|gemMountType)")
    AR_R = re.compile(r"^((physics|magic|fire|thunder|dark)AtkRate|correct(Strength|Agility|Magic|Faith|Luck)Rate|maxReinforceLevel)")
    def pick(d, pat): return {k: {f: v for f, v in e.items() if pat.search(f)} for k, e in d.items()} if d else {}
    if all(k in data for k in ("EquipParamWeapon", "ReinforceParamWeapon", "CalcCorrectGraph", "AttackElementCorrectParam")):
        ar = {"_source": data["_source"], "weapons": pick(data["EquipParamWeapon"], AR_W), "reinforce": pick(data["ReinforceParamWeapon"], AR_R),
              "graphs": data["CalcCorrectGraph"], "aec": data["AttackElementCorrectParam"]}
        dst = os.path.join(OUT, "ar.json")
        json.dump(ar, open(dst, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
        print(f"→ {dst} ({os.path.getsize(dst) // 1024} KB)")
    else:
        print("  ar.json not written: it needs EquipParamWeapon, ReinforceParamWeapon, CalcCorrectGraph and AttackElementCorrectParam")
    dst = os.path.join(OUT, "equip.json")
    json.dump(data, open(dst, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"→ {dst} ({os.path.getsize(dst) // 1024} KB)")

if __name__ == "__main__":
    main()
