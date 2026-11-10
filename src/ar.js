/* ar.js — attack rating from the game's own numbers (gamedata/ar.json, extracted with tools/game/equip_from_params.py from
 * EquipParamWeapon, ReinforceParamWeapon, CalcCorrectGraph and AttackElementCorrectParam; served from R2, never in this repo).
 *
 *   AR.load()                                    → Promise<bool>  fetches gamedata/ar.json once; false when it is not published
 *   AR.ready                                     → bool
 *   AR.compute(weaponId, level, stats, twoHand)  → null | { total, types: [{k, base, bonus, total}], scaling: {str:"C",…}, unmet: ["str"], level }
 *       weaponId: the save's item id (base + 100·infusion + level) or the param row; level: upgrade level to evaluate
 *       stats: { strength, dexterity, intelligence, faith, arcane } (effective values, soft caps included)
 *   AR.letter(pct)                               → "S" | "A" | "B" | "C" | "D" | "E" | "-"
 *
 * The formula is the community one (per damage type: base × reinforce rate, plus for every stat the element lets scale:
 * base × scaling × curve(stat); a stat under the requirement contributes −40 % of the base instead; two-handing uses
 * floor(1.5 × strength)). Status build-up (bleed, poison…) is not computed yet — it lives in SpEffectParam.
 */
(function (root) {
  "use strict";
  const TYPES = [["phys", "Physics"], ["mag", "Magic"], ["fire", "Fire"], ["ltn", "Thunder"], ["holy", "Dark"]];
  const STATS = [["str", "strength", "Strength", "Strength"], ["dex", "dexterity", "Agility", "Dexterity"], ["int", "intelligence", "Magic", "Magic"], ["fai", "faith", "Faith", "Faith"], ["arc", "arcane", "Luck", "Luck"]];
  // [key, character stat, EquipParamWeapon suffix (correct*/proper*), AttackElementCorrectParam name (is*Correct_by*)]
  const D = { data: null, ready: false };
  const num = (v, dflt) => v === undefined || v === null || v === "" ? dflt : +v;

  function curve(g, x) { // CalcCorrectGraph row → value in [stageMaxGrowVal0, stageMaxGrowVal4] (percent)
    const V = i => +g["stageMaxVal" + i], G = i => +g["stageMaxGrowVal" + i], A = i => +g["adjPt_maxGrowVal" + i];
    if (x <= V(0)) return G(0);
    for (let i = 0; i < 4; i++) {
      if (x <= V(i + 1)) {
        const span = V(i + 1) - V(i), r = span > 0 ? (x - V(i)) / span : 1, a = A(i);
        const grow = a > 0 ? Math.pow(r, a) : a < 0 ? 1 - Math.pow(1 - r, -a) : r;
        return G(i) + (G(i + 1) - G(i)) * grow;
      }
    }
    return G(4);
  }

  function letter(p) { return p >= 175 ? "S" : p >= 140 ? "A" : p >= 90 ? "B" : p >= 60 ? "C" : p >= 25 ? "D" : p > 0 ? "E" : "-"; }

  function compute(weaponId, level, stats, twoHand) {
    const d = D.data; if (!d || !d.weapons) return null;
    const rowId = weaponId - (weaponId % 100), w = d.weapons[rowId]; if (!w) return null;
    const lv = Math.max(0, level | 0), rf = d.reinforce[(+w.reinforceTypeId || 0) + lv]; if (!rf) return null;
    const aec = d.aec[+w.attackElementCorrectId] || {};
    const S = Object.assign({}, stats || {}); if (twoHand) S.strength = Math.floor((S.strength | 0) * 1.5);
    const unmet = STATS.filter(([k, cs, suf]) => (S[cs] | 0) < (+w["proper" + suf] || 0)).map(([k]) => k);
    const scaling = {}, types = [];
    for (const [tk, tn] of TYPES) {
      const base = (+w["attackBase" + tn] || 0) * num(rf[tn.toLowerCase() + "AtkRate"], 1);
      if (!base) continue;
      const g = d.graphs[+w["correctType_" + tn]];
      let bonus = 0;
      for (const [sk, cs, suf, an] of STATS) {
        if (+aec["is" + an + "Correct_by" + tn] !== 1) continue;
        const ow = aec["overwrite" + an + "CorrectRate_by" + tn], inf = aec["Influence" + an + "CorrectRate_by" + tn];
        let pct = ow !== undefined && +ow >= 0 ? +ow : (+w["correct" + suf] || 0) * num(rf["correct" + suf + "Rate"], 1);
        if (inf !== undefined && +inf !== 100) pct *= +inf / 100;
        if (pct > (scaling[sk] || 0)) scaling[sk] = pct;
        if (unmet.includes(sk)) bonus -= base * 0.4;
        else if (g) bonus += base * (pct / 100) * (curve(g, S[cs] | 0) / 100);
      }
      types.push({ k: tk, base: Math.floor(base), bonus: Math.floor(bonus), total: Math.floor(base) + Math.floor(bonus) });
    }
    const letters = {}; for (const [sk] of STATS) letters[sk] = letter(scaling[sk] || 0);
    return { total: types.reduce((a, t) => a + t.total, 0), types, scaling: letters, unmet, level: lv, maxLevel: +rf.maxReinforceLevel || null };
  }

  function load() {
    if (D.p) return D.p;
    return (D.p = fetch("gamedata/ar.json").then(r => r.ok ? r.json() : null).then(j => {
      if (!j || !j.weapons) return false;
      D.data = j; D.ready = true; return true;
    }).catch(() => false));
  }

  root.AR = { load, compute, letter, curve, TYPES, STATS, get ready() { return D.ready; }, get data() { return D.data; } };
})(typeof self !== "undefined" ? self : this);
