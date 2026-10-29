/* ersave.js — Elden Ring PC save (.sl2) reader. Read-only. Runs in browser or Node.
 * Layout derived from ClayAmore/ER-Save-Editor, Ariescyn/EldenRing-Save-Manager and oisis/EldenRing-SaveForge spec.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ERSave = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SLOT_SIZE = 0x280000;
  const HEADER = 0x300;
  const MD5 = 0x10;
  const UD10_ACTIVE = 0x1954;      // within UserData10 data
  const UD10_PROFILE0 = 0x195E;
  const UD10_PROFILE_STRIDE = 0x24C;

  const CLASSES = ["Vagabond", "Warrior", "Hero", "Bandit", "Astrologer", "Prophet", "Confessor", "Samurai", "Prisoner", "Wretch"];
  const GIFTS = ["None", "Crimson Amber Medallion", "Lands Between Rune", "Golden Seed", "Fanged Imp Ashes", "Cracked Pot", "Stonesword Key", "Bewitching Branch", "Boiled Prawn", "Shabriri Grape"];
  const INFUSIONS = ["Standard", "Heavy", "Keen", "Quality", "Fire", "Flame Art", "Lightning", "Sacred", "Magic", "Cold", "Poison", "Blood", "Occult"];

  class Reader {
    constructor(buf, pos) { this.dv = new DataView(buf); this.b = new Uint8Array(buf); this.pos = pos || 0; }
    u8() { return this.b[this.pos++]; }
    u16() { const v = this.dv.getUint16(this.pos, true); this.pos += 2; return v; }
    u32() { const v = this.dv.getUint32(this.pos, true); this.pos += 4; return v; }
    i32() { const v = this.dv.getInt32(this.pos, true); this.pos += 4; return v; }
    u64() { const lo = this.u32(), hi = this.u32(); return BigInt(hi) * 4294967296n + BigInt(lo); }
    f32() { const v = this.dv.getFloat32(this.pos, true); this.pos += 4; return v; }
    skip(n) { this.pos += n; }
    bytes(n) { const b = this.b.slice(this.pos, this.pos + n); this.pos += n; return b; }
    utf16(nChars) { let s = ""; for (let i = 0; i < nChars; i++) { const c = this.u16(); if (c) s += String.fromCharCode(c); } return s; }
  }

  function u32At(u8, off) { return (u8[off] | (u8[off + 1] << 8) | (u8[off + 2] << 16) | (u8[off + 3] << 24)) >>> 0; }

  function utf16At(u8, off, n) {
    let s = "";
    for (let i = 0; i < n; i++) { const c = u8[off + 2 * i] | (u8[off + 2 * i + 1] << 8); if (!c) break; s += String.fromCharCode(c); }
    return s;
  }

  // ---------------------------------------------------------------- slot
  function readEquipBlock(r) { // 22 u32 = 0x58 (EquipData / ChrAsm2 layout)
    const lh = [], rh = [], arrows = [], bolts = [];
    lh[0] = r.u32(); rh[0] = r.u32(); lh[1] = r.u32(); rh[1] = r.u32(); lh[2] = r.u32(); rh[2] = r.u32();
    arrows[0] = r.u32(); bolts[0] = r.u32(); arrows[1] = r.u32(); bolts[1] = r.u32();
    r.skip(8);
    const head = r.u32(), chest = r.u32(), arms = r.u32(), legs = r.u32();
    r.skip(4);
    const talismans = [r.u32(), r.u32(), r.u32(), r.u32()];
    r.skip(4);
    return { lh, rh, arrows, bolts, head, chest, arms, legs, talismans };
  }

  function readInventory(r, nCommon, nKey) {
    const commonCount = r.u32();
    const common = [];
    for (let i = 0; i < nCommon; i++) { const h = r.u32(), q = r.u32(), idx = r.u32(); if (h && h !== 0xFFFFFFFF) common.push({ handle: h, qty: q, idx }); }
    const keyCount = r.u32();
    const key = [];
    for (let i = 0; i < nKey; i++) { const h = r.u32(), q = r.u32(), idx = r.u32(); if (h && h !== 0xFFFFFFFF) key.push({ handle: h, qty: q, idx }); }
    r.skip(8);
    return { commonCount, common, keyCount, key };
  }

  function parseSlot(buf, start) {
    const r = new Reader(buf, start);
    const ver = r.u32();
    if (ver === 0) return null;
    const mapId = Array.from(r.bytes(4));
    r.skip(0x18);

    // GaItem map
    const nGa = ver <= 81 ? 0x13FE : 0x1400;
    const gaMap = new Map();
    for (let i = 0; i < nGa; i++) {
      const handle = r.u32(), id = r.u32();
      let aow = 0;
      if (id !== 0 && id !== 0xFFFFFFFF) {
        const t = id & 0xF0000000;
        if (t === 0) { r.skip(8); aow = r.u32(); r.skip(1); }
        else if (t === 0x10000000) r.skip(8);
      }
      if (handle && id && id !== 0xFFFFFFFF) gaMap.set(handle, { id, aow });
    }

    // PlayerGameData (0x1B0)
    const pgStart = r.pos;
    r.skip(8);
    const hp = r.u32(), maxHp = r.u32(), baseMaxHp = r.u32();
    const fp = r.u32(), maxFp = r.u32(), baseMaxFp = r.u32();
    r.skip(4);
    const sp = r.u32(), maxSp = r.u32(), baseMaxSp = r.u32();
    r.skip(4);
    const stats = { vigor: r.u32(), mind: r.u32(), endurance: r.u32(), strength: r.u32(), dexterity: r.u32(), intelligence: r.u32(), faith: r.u32(), arcane: r.u32() };
    r.skip(12);
    const level = r.u32(), runes = r.u32(), totalRunes = r.u32();
    r.skip(4);
    const buildups = { poison: r.u32(), rot: r.u32(), bleed: r.u32(), deathblight: r.u32(), frost: r.u32(), sleep: r.u32(), madness: r.u32() };
    r.skip(8);
    const name = r.utf16(16); r.skip(2);
    const gender = r.u8(), archetype = r.u8();
    r.skip(2); const voice = r.u8(); const gift = r.u8();
    r.skip(2); const talismanSlots = r.u8(); r.skip(1);
    r.skip(0x18);
    r.skip(2); const matchmakingWpnLvl = r.u8(); r.skip(0x1C);
    const greatRuneActive = r.u8(); r.skip(1);
    const crimsonFlasks = r.u8(), ceruleanFlasks = r.u8();
    r.pos = pgStart + 0x1B0;

    r.skip(0xD0); // SpEffects
    const equipIndex = readEquipBlock(r);                  // 0x58
    const armStyle = r.u32(); const activeSlots = { lh: r.u32(), rh: r.u32(), la: r.u32(), ra: r.u32(), lb: r.u32(), rb: r.u32() };
    const equipIds = readEquipBlock(r);                    // 0x58 item ids
    const equipHandles = readEquipBlock(r);                // 0x58 gaitem handles
    const inventory = readInventory(r, 0xA80, 0x180);
    // spells
    const spells = [];
    for (let i = 0; i < 12; i++) { const id = r.i32(); r.skip(4); if (id > 0) spells.push(id); }
    r.skip(0x14);
    // quick items / pouch
    const quick = [], pouch = [];
    for (let i = 0; i < 10; i++) { const id = r.u32(); r.skip(4); if (id && id !== 0xFFFFFFFF) quick.push(id); }
    r.skip(4);
    for (let i = 0; i < 6; i++) { const id = r.u32(); r.skip(4); if (id && id !== 0xFFFFFFFF) pouch.push(id); }
    r.skip(8);
    r.skip(0x18); // gestures equipped
    const nProj = r.i32(); r.skip(nProj * 8);
    r.skip(0x9C); // equipped items (again)
    const physick = [r.u32(), r.u32()]; r.skip(4);
    r.skip(0x12F); // face
    const storage = readInventory(r, 0x780, 0x80);
    r.skip(0x100); // gestures
    const nReg = r.u32(); const regions = []; for (let i = 0; i < nReg; i++) regions.push(r.u32());
    r.skip(0x28); // Torrent
    r.skip(1); r.skip(0x40);
    r.skip(4); const clearCount = r.u32(); r.skip(4);
    r.skip(0x1008); r.skip(0x34);
    r.skip(8 + 0x1B58 * 16); // GaItemData
    r.skip(0x408); // tutorial
    r.skip(3); const deaths = r.u32(); r.skip(4); r.skip(1); r.skip(4); const lastGrace = r.u32(); r.skip(1); r.skip(8);
    const eventFlagsOffset = r.pos - start; // 0x1BF99F bytes follow
    const eventFlags = new Uint8Array(buf, r.pos, 0x1BF99F);

    return {
      ver, mapId, name, level, runes, totalRunes, stats, hp, maxHp, baseMaxHp, fp, maxFp, baseMaxFp, sp, maxSp, baseMaxSp,
      buildups, gender, archetype, className: CLASSES[archetype] || ("#" + archetype), voice, gift, giftName: GIFTS[gift] || ("#" + gift),
      talismanSlots, matchmakingWpnLvl, greatRuneActive: !!greatRuneActive, crimsonFlasks, ceruleanFlasks,
      armStyle, activeSlots, equipIndex, equipIds, equipHandles, inventory, storage, spells, quick, pouch, physick, regions,
      clearCount, deaths, lastGrace, eventFlagsOffset, eventFlags, gaMap,
    };
  }

  // ---------------------------------------------------------------- file
  function parse(buf) {
    const u8 = new Uint8Array(buf);
    if (!(u8[0] === 0x42 && u8[1] === 0x4E && u8[2] === 0x44 && u8[3] === 0x34)) throw new Error("No es un save de Elden Ring para PC (falta cabecera BND4)");
    const ud10 = HEADER + 10 * (MD5 + SLOT_SIZE) + MD5;
    if (u8.length < ud10 + 0x60000) throw new Error("Archivo demasiado corto para ser un ER0000.sl2 completo");
    const active = [];
    for (let i = 0; i < 10; i++) active.push(u8[ud10 + UD10_ACTIVE + i] === 1);
    const profiles = [];
    for (let i = 0; i < 10; i++) {
      const p = ud10 + UD10_PROFILE0 + i * UD10_PROFILE_STRIDE;
      profiles.push({ name: utf16At(u8, p, 16), level: u32At(u8, p + 34), playtimeSec: u32At(u8, p + 38) });
    }
    const steamId = (BigInt(u32At(u8, ud10 + 8)) * 4294967296n + BigInt(u32At(u8, ud10 + 4))).toString();
    const chars = [];
    for (let i = 0; i < 10; i++) {
      const start = HEADER + i * (MD5 + SLOT_SIZE) + MD5;
      let slot = null, error = null;
      try { slot = parseSlot(buf, start); } catch (e) { error = e.message || String(e); }
      if (slot) { slot.slot = i; slot.active = active[i]; slot.profile = profiles[i]; slot.playtimeSec = profiles[i].playtimeSec; chars.push(slot); }
      else if (error) chars.push({ slot: i, active: active[i], error, profile: profiles[i] });
    }
    return { steamId, active, profiles, chars };
  }

  // ---------------------------------------------------------------- items
  function makeResolver(db) {
    const items = db.items;
    function weapon(id) {
      const level = id % 100;
      const base = id - level;
      const base0 = id - (id % 10000);
      const inf = Math.floor((id % 10000) / 100);
      let e = items[base], name;
      if (e) name = e.n;
      else { e = items[base0]; name = e ? (inf ? INFUSIONS[inf] + " " + e.n : e.n) : "Weapon #" + base; }
      const root = items[base0] || e || {};
      return { id, name, level, maxLevel: root.u || 0, infusion: INFUSIONS[inf] || "", kind: "weapon", cat: root.c || "", sub: root.s || "", dlc: !!root.dlc, loc: root.loc, display: level ? name + " +" + level : name };
    }
    function byId(id, kind) {
      const e = items[id];
      if (!e) return { id, name: kind + " #" + (id & 0x0FFFFFFF), kind, cat: "", sub: "", display: kind + " #" + (id & 0x0FFFFFFF) };
      return { id, name: e.n, kind, cat: e.c, sub: e.s || "", dlc: !!e.dlc, loc: e.loc, display: e.n };
    }
    function resolveHandle(handle, gaMap) {
      const t = (handle & 0xF0000000) >>> 0;
      const ga = gaMap.get(handle);
      if (t === 0x80000000) { const w = ga ? weapon(ga.id) : weapon(handle & 0x0FFFFFFF); if (ga && ga.aow && ga.aow !== 0xFFFFFFFF) { const a = gaMap.get(ga.aow); if (a) w.aow = byId(a.id, "aow").name; } return w; }
      if (t === 0x90000000) return byId(ga ? ga.id : ((handle & 0x0FFFFFFF) | 0x10000000) >>> 0, "armor");
      if (t === 0xA0000000) return byId(ga ? ga.id : ((handle & 0x0FFFFFFF) | 0x20000000) >>> 0, "talisman");
      if (t === 0xB0000000) return byId(ga ? ga.id : ((handle & 0x0FFFFFFF) | 0x40000000) >>> 0, "goods");
      if (t === 0xC0000000) return byId(ga ? ga.id : ((handle & 0x0FFFFFFF) | 0x80000000) >>> 0, "aow");
      return { id: handle, name: "?" + handle.toString(16), kind: "unknown", cat: "", sub: "", display: "?" + handle.toString(16) };
    }
    function resolveItemId(id) { // from equipIds / quick / pouch (raw item ids with type nibble)
      const t = (id & 0xF0000000) >>> 0;
      if (id === 0xFFFFFFFF || id === 0) return null;
      if (t === 0) return weapon(id);
      if (t === 0x10000000) return byId(id, "armor");
      if (t === 0x20000000) return byId(id, "talisman");
      if (t === 0x40000000) return byId(id, "goods");
      if (t === 0x80000000) return byId(id, "aow");
      return null;
    }
    return { weapon, byId, resolveHandle, resolveItemId };
  }

  function enrich(char, db) {
    const R = makeResolver(db);
    const gm = char.gaMap;
    const inv = char.inventory.common.map(it => Object.assign({ qty: it.qty, handle: it.handle, idx: it.idx }, R.resolveHandle(it.handle, gm)));
    const keys = char.inventory.key.map(it => Object.assign({ qty: it.qty, handle: it.handle, idx: it.idx }, R.resolveHandle(it.handle, gm)));
    const sto = char.storage.common.map(it => Object.assign({ qty: it.qty, handle: it.handle, idx: it.idx, stored: true }, R.resolveHandle(it.handle, gm)));
    const stoKeys = char.storage.key.map(it => Object.assign({ qty: it.qty, handle: it.handle, idx: it.idx, stored: true }, R.resolveHandle(it.handle, gm)));
    const eq = char.equipHandles;
    const h = x => (x && x !== 0xFFFFFFFF) ? R.resolveHandle(x, gm) : null;
    const equipped = {
      rh: eq.rh.map(h), lh: eq.lh.map(h), arrows: eq.arrows.map(h), bolts: eq.bolts.map(h),
      head: h(eq.head), chest: h(eq.chest), arms: h(eq.arms), legs: h(eq.legs), talismans: eq.talismans.map(h),
    };
    const spells = char.spells.map(id => R.byId((id | 0x40000000) >>> 0, "goods"));
    const quick = char.quick.map(h => R.resolveHandle(h, gm));
    const pouch = char.pouch.map(h => R.resolveHandle(h, gm));
    return { inventory: inv, keyItems: keys, storage: sto, storageKeys: stoKeys, equipped, spells, quick, pouch };
  }

  // Event flag lookup: block = id/1000 via BST table; byte = pos*125 + (id%1000)/8; bit = 7 - (id%1000)%8
  function makeFlagReader(bst, eventFlags) {
    return function (id) {
      const pos = bst[Math.floor(id / 1000)];
      if (pos === undefined) return null;
      const r = id % 1000, byte = pos * 125 + (r >> 3);
      if (byte >= eventFlags.length) return null;
      return !!(eventFlags[byte] & (1 << (7 - (r & 7))));
    };
  }

  function fmtTime(sec) {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    return h + "h " + (m < 10 ? "0" : "") + m + "m";
  }

  return { parse, parseSlot, makeResolver, enrich, makeFlagReader, fmtTime, CLASSES, INFUSIONS, GIFTS };
});
