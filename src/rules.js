/*
 * rules.js — game knowledge used by the UI, as pure functions (no DOM, no i18n).
 *
 * Everything here is derived from the game or the community wiki and is the first place to look when a number
 * on screen seems wrong. Each block says where its values come from and how sure we are. Usage:
 *
 *   const R = Rules.create(DB, REQS);   // DB = data/items.json, REQS = data/reqs.json (may be null)
 *   R.canUse(character, item)           // → null | { ok, twoHand, boosted, missing, via, req, scale, info }
 *
 * Characters come from ERSave.parse + ERSave.enrich (src/ersave.js): `c.stats` (base attributes by full name:
 * strength, dexterity…), `c.enriched.equipped` (head/chest/arms/legs/rh[]/lh[]/talismans[]/greatRune),
 * `c.all` (every inventory + storage item: {id, name, kind, cat, sub, infusion, level, maxLevel, qty…}).
 */
(function (root) {
  "use strict";

  // ---- names -------------------------------------------------------------------------------------------
  const INFUSION_WORDS = /\b(Heavy|Keen|Quality|Fire|Flame Art|Lightning|Sacred|Magic|Cold|Poison|Blood|Occult|Bloody)\s+/g;
  /** Wiki page title for an item: no affinity prefix, no +N (talismans keep +N: "Crimson Amber Medallion +1" is its own item). */
  function wikiName(i) {
    let n = i.name || "";
    if (i.kind === "weapon" && i.infusion && i.infusion !== "Standard" && n.startsWith(i.infusion + " ")) n = n.slice(i.infusion.length + 1);
    if (i.kind !== "talisman") n = n.replace(/\s*\+\d+$/, "");
    return n;
  }
  /** Lower-case wikiName: two items are "the same thing" for the collection catalogue when their baseKey matches. */
  const baseKey = i => wikiName(i).toLowerCase();

  // ---- attributes ---------------------------------------------------------------------------------------
  /** Requirement keys (reqs.json) → attribute names used by the save parser. */
  const STAT_KEY = { str: "strength", dex: "dexterity", int: "intelligence", fai: "faith", arc: "arcane" };
  const STAT_ORDER = ["vigor", "mind", "endurance", "strength", "dexterity", "intelligence", "faith", "arcane"];
  /** Soft caps [first, second] per attribute (community consensus; the planner colours values past them). */
  const SOFT_CAPS = { vigor: [40, 60], mind: [40, 60], endurance: [50, 60], strength: [55, 80], dexterity: [55, 80], intelligence: [60, 80], faith: [60, 80], arcane: [60, 80] };

  /** Runes needed to go from level x to x+1. Fixed table up to 11; from 12, with y = x+1: 0.02y³ + 3.06y² + 105.6y − 895.
   *  Checked against the wiki: 12→1038, 44→11876, 100→61591. */
  const LEVEL_COST_LOW = [673, 689, 706, 723, 740, 757, 775, 793, 811, 829, 847];
  const levelCost = x => { if (x < 12) return LEVEL_COST_LOW[x - 1]; const y = x + 1; return Math.floor(0.02 * y ** 3 + 3.06 * y ** 2 + 105.6 * y - 895); };

  /** Equipment that raises attributes (counts for weapon/spell requirements). Talisman values are from the wiki;
   *  the helmet list is the well-known set, not exhaustive, and the glintstone crown values are the least certain. */
  const STAT_BOOST = {
    "Radagon's Scarseal": { vigor: 3, endurance: 3, strength: 3, dexterity: 3 }, "Radagon's Soreseal": { vigor: 5, endurance: 5, strength: 5, dexterity: 5 },
    "Marika's Scarseal": { mind: 3, intelligence: 3, faith: 3, arcane: 3 }, "Marika's Soreseal": { mind: 5, intelligence: 5, faith: 5, arcane: 5 },
    "Starscourge Heirloom": { strength: 5 }, "Prosthesis-Wearer Heirloom": { dexterity: 5 }, "Stargazer Heirloom": { intelligence: 5 }, "Two Fingers Heirloom": { faith: 5 },
    "Albinauric Mask": { arcane: 4 }, "Marais Mask": { arcane: 1 }, "Imp Head (Cat)": { arcane: 1 }, "Queen's Crescent Crown": { intelligence: 3 }, "Twinsage Glintstone Crown": { intelligence: 6 },
    "Olivinus Glintstone Crown": { intelligence: 2 }, "Lazuli Glintstone Crown": { intelligence: 2 }, "Karolos Glintstone Crown": { intelligence: 3 }, "Hierodas Glintstone Crown": { intelligence: 2, faith: 2 }, "Haima Glintstone Crown": { strength: 2, intelligence: 2 }, "Haligtree Knight Helm": { faith: 1 },
  };
  const GODRICK_RUNE = { vigor: 5, mind: 5, endurance: 5, strength: 5, dexterity: 5, intelligence: 5, faith: 5, arcane: 5 };
  /** {attribute: [{src, v}]} from worn armor, talismans and an active Godrick's Great Rune. */
  function statBonuses(c) {
    const out = {}; const E = c.enriched && c.enriched.equipped; if (!E) return out;
    const add = (src, b) => { for (const k in b) (out[k] = out[k] || []).push({ src, v: b[k] }); };
    for (const it of [E.head, E.chest, E.arms, E.legs].concat(E.talismans || [])) if (it && STAT_BOOST[it.name]) add(it.name, STAT_BOOST[it.name]);
    if (c.greatRuneActive && E.greatRune && /Godrick/.test(E.greatRune.name)) add("Godrick's Great Rune", GODRICK_RUNE);
    return out;
  }
  /** Base attributes + bonuses (what the game shows on the status screen). */
  const effStats = c => { const B = statBonuses(c), S = Object.assign({}, c.stats); for (const k in B) S[k] = (S[k] | 0) + B[k].reduce((a, x) => a + x.v, 0); return S; };

  // ---- equip load ----------------------------------------------------------------------------------------
  /** Max equip load by (effective) endurance: 45 at ≤8, 72 at 25, 120 at 60, 160 at 99 (wiki anchors; linear in between — the
   *  real curve is close but not exactly linear). */
  function maxEquipLoad(endurance) {
    const lerp = (x, x0, y0, x1, y1) => y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    return endurance <= 8 ? 45 : endurance <= 25 ? lerp(endurance, 8, 45, 25, 72) : endurance <= 60 ? lerp(endurance, 25, 72, 60, 120) : lerp(Math.min(endurance, 99), 60, 120, 99, 160);
  }
  /** "light" (< 30 %), "medium" (< 70 %), "heavy" (≤ 100 %), "over". */
  const rollClass = ratio => ratio < .3 ? "light" : ratio < .7 ? "medium" : ratio <= 1 ? "heavy" : "over";

  // ---- upgrades -------------------------------------------------------------------------------------------
  /** Stones needed to go from level-1 to level. Normal weapons: tiers of 3 levels, 2/4/6 stones, Ancient Dragon stone for +25.
   *  Somber: one stone of the level, Somber Ancient Dragon for +10. */
  function costStep(level, somber) {
    if (somber) return level >= 10 ? { "Somber Ancient Dragon Smithing Stone": 1 } : { ["Somber Smithing Stone [" + level + "]"]: 1 };
    if (level >= 25) return { "Ancient Dragon Smithing Stone": 1 };
    const tier = Math.floor((level - 1) / 3) + 1, n = [2, 4, 6][(level - 1) % 3];
    return { ["Smithing Stone [" + tier + "]"]: n };
  }
  function costRange(from, to, somber) { const t = {}; for (let l = from + 1; l <= to; l++) for (const [k, v] of Object.entries(costStep(l, somber))) t[k] = (t[k] || 0) + v; return t; }

  // ---- spirit ashes ---------------------------------------------------------------------------------------
  /** Ashes whose name doesn't end in "Ashes" but still use Grave Glovewort; everything else without the suffix is a "ghost" (Ghost Glovewort). */
  const GHOST_NAMED = new Set(["Mimic Tear Ashes"]);
  function spiritInfo(name) { const m = name.match(/^(.*?)\s*\+\s*(\d+)\s*$/); const base = (m ? m[1] : name).trim(); return { base, level: m ? +m[2] : 0, ghost: GHOST_NAMED.has(base) || !/ Ashes$/.test(base) }; }
  const gloveName = (ghost, lvl) => lvl >= 10 ? (ghost ? "Great Ghost Glovewort" : "Great Grave Glovewort") : `${ghost ? "Ghost" : "Grave"} Glovewort [${lvl}]`;

  // ---- consumable runes -----------------------------------------------------------------------------------
  const RUNE_VALUE = { "Golden Rune [1]": 200, "Golden Rune [2]": 400, "Golden Rune [3]": 800, "Golden Rune [4]": 1200, "Golden Rune [5]": 1600, "Golden Rune [6]": 2000, "Golden Rune [7]": 2500, "Golden Rune [8]": 3000, "Golden Rune [9]": 3800, "Golden Rune [10]": 5000, "Golden Rune [11]": 6250, "Golden Rune [12]": 7500, "Golden Rune [13]": 10000, "Numen's Rune": 12000, "Hero's Rune [1]": 15000, "Hero's Rune [2]": 20000, "Hero's Rune [3]": 25000, "Hero's Rune [4]": 30000, "Hero's Rune [5]": 35000, "Lord's Rune": 50000 };

  // ---- placeholders ---------------------------------------------------------------------------------------
  /** Ids the save uses for "nothing equipped": Unarmed, Head, Body, Arms, Legs. */
  const PLACEHOLDER = new Set([110000, 0x10002710, 0x10002774, 0x100027D8, 0x1000283C]);
  const real = i => !PLACEHOLDER.has(i.id);

  /** Binds the data-dependent helpers to the item DB and the wiki requirements. */
  function create(DB, REQS) {
    const RQ = REQS || { weapons: {}, spells: {} };
    const STONE = {}; // stone name → item id (for "do I have the stones" counts)
    for (const [id, e] of Object.entries(DB.items)) {
      if (/^(Somber )?Smithing Stone \[\d\]$/.test(e.n) || e.n === "Ancient Dragon Smithing Stone" || e.n === "Somber Ancient Dragon Smithing Stone") STONE[e.n] = +id;
    }
    const stoneCounts = c => { const m = {}; for (const it of c.all) if (STONE[it.name] !== undefined) m[it.name] = (m[it.name] || 0) + it.qty; return m; };

    /** Weight in units of 0.1 (game data is float32; upgraded weapons carry their level in the id, so the base entry is used; ammo weighs nothing). */
    function weightOf(it) {
      if (!it) return 0; if (it.cat === "arrows_and_bolts") return 0;
      const e = DB.items[it.id] || (it.kind === "weapon" ? DB.items[it.id - (it.id % 10000)] : null); let w = e && e.w ? e.w : 0;
      if (!w && it.kind === "weapon") { const r = RQ.weapons[wikiName(it)]; if (r && r.weight) w = r.weight; }
      return Math.round(w * 10) / 10;
    }
    /** reqs.json entry for a weapon or spell, or null. */
    function reqOf(it) {
      if (!it) return null;
      if (it.kind === "weapon") { const n = wikiName(it); return RQ.weapons[n] || RQ.weapons[n.replace(INFUSION_WORDS, "").trim()] || null; }
      if (it.cat === "sorceries" || it.cat === "incantations") return RQ.spells[it.name] || null;
      return null;
    }
    /** Can this character use the item right now?
     *  → null when there is no requirement data, else {ok, twoHand, boosted, missing:[{k, need, have}], via:[source names], req, scale, info}.
     *  Two-handing counts strength × 1.5 (weapons only). "boosted" = only thanks to equipment bonuses (statBonuses). */
    function canUse(c, it) {
      const rq = reqOf(it); if (!rq || !c) return null;
      const check = S => { const miss = [], miss2h = [];
        for (const k of Object.keys(rq.req)) { const need = rq.req[k] | 0; if (!need) continue; const have = S[STAT_KEY[k]] | 0;
          if (have < need) { miss.push({ k, need, have }); if (!(it.kind === "weapon" && k === "str" && Math.floor(have * 1.5) >= need)) miss2h.push({ k, need, have }); } }
        return { ok: !miss.length, twoHand: !!miss.length && !miss2h.length, missing: miss2h.length ? miss2h : miss }; };
      const base = check(c.stats);
      if (base.ok) return Object.assign(base, { boosted: false, req: rq.req, scale: rq.scale || null, info: rq });
      const B = statBonuses(c); const eff = Object.keys(B).length ? check(effStats(c)) : null;
      if (eff && (eff.ok || eff.twoHand)) { const via = [...new Set(Object.keys(B).filter(k => base.missing.some(m => STAT_KEY[m.k] === k)).flatMap(k => B[k].map(x => x.src)))]; return Object.assign(eff, { boosted: true, via, req: rq.req, scale: rq.scale || null, info: rq }); }
      return Object.assign(base, { boosted: false, req: rq.req, scale: rq.scale || null, info: rq });
    }
    /** Equip load of what is worn: {load, max, ratio, roll}. */
    function equipLoad(c) {
      const E = c.enriched.equipped;
      const worn = [E.head, E.chest, E.arms, E.legs].concat(E.rh, E.lh, E.talismans, E.arrows, E.bolts).filter(x => x && real(x));
      const load = worn.reduce((a, it) => a + weightOf(it), 0), max = maxEquipLoad(effStats(c).endurance | 0), ratio = load / max;
      return { load, max, ratio, roll: rollClass(ratio) };
    }
    return { DB, RQ, STONE, stoneCounts, weightOf, reqOf, canUse, equipLoad,
      wikiName, baseKey, INFUSION_WORDS, STAT_KEY, STAT_ORDER, SOFT_CAPS, levelCost, STAT_BOOST, statBonuses, effStats, maxEquipLoad, rollClass,
      costStep, costRange, spiritInfo, gloveName, RUNE_VALUE, PLACEHOLDER, real };
  }

  root.Rules = { create, wikiName, baseKey, levelCost, statBonuses, effStats, maxEquipLoad, rollClass, costStep, costRange, spiritInfo, gloveName, RUNE_VALUE, STAT_KEY, STAT_ORDER, SOFT_CAPS, STAT_BOOST, PLACEHOLDER, real };
})(typeof self !== "undefined" ? self : this);
