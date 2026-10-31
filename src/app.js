/* app.js — Tarnished Ledger UI. Expects window.ERSave (src/ersave.js) and the items DB passed to main(). */
async function main(DB, FLAGS, REQS){
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  let SAVE = null, CUR = null, FILENAME = "";
  const WIKI = "https://eldenring.wiki.gg/wiki/";
  function wikiName(i) {
    let n = i.name || "";
    if (i.kind === "weapon" && i.infusion && i.infusion !== "Standard" && n.startsWith(i.infusion + " ")) n = n.slice(i.infusion.length + 1);
    if (i.kind !== "talisman") n = n.replace(/\s*\+\d+$/, "");
    return n;
  }
  const link = (i, text) => `<a class="wl" href="${WIKI}${encodeURIComponent(wikiName(i).replace(/ /g, "_"))}" target="_blank" rel="noopener">${text}</a>`;

  // ---- icon pack (user supplied, stored in IndexedDB) --------------------
  const ICONS = new Map(); // key -> object URL
  const slug = n => n.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const iconKey = i => i.kind === "weapon" ? String(i.id - (i.id % 10000)) : String(i.id);
  function iconCandidates(i) {
    const c = [iconKey(i), slug(i.name)];
    if (i.kind === "weapon" && i.infusion && i.infusion !== "Standard" && i.name.startsWith(i.infusion + " ")) c.push(slug(i.name.slice(i.infusion.length + 1)));
    const plain = i.name.replace(/\s*\+\d+$/, ""); if (plain !== i.name) c.push(slug(plain));
    if (i.name.includes(": ")) c.push(slug(i.name.split(": ").slice(1).join(": ")));
    return c;
  }
  function ic(i) {
    if (!ICONS.size) return "";
    let u = null; for (const k of iconCandidates(i)) if ((u = ICONS.get(k))) break;
    return u ? `<img class="ico" src="${u}" alt="" loading="lazy">` : "";
  }
  function idb() { return new Promise((res, rej) => { const r = indexedDB.open("tl", 1); r.onupgradeneeded = () => r.result.createObjectStore("icons"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
  async function iconsLoad() {
    try { const r = await fetch("icons/index.json", { cache: "no-cache" }); if (r.ok) { for (const n of await r.json()) ICONS.set(n.replace(/\.[a-z0-9]+$/i, ""), "icons/" + n); if (ICONS.size) { $("#iconsMsg").textContent = ICONS.size + " iconos del sitio."; $("#iconsBtn").textContent = "Añadir iconos"; } } } catch (e) {}
    try { const db = await idb(); const tx = db.transaction("icons"); const st = tx.objectStore("icons");
      await new Promise((res, rej) => { const cur = st.openCursor(); cur.onsuccess = () => { const c = cur.result; if (!c) return res(); ICONS.set(c.key, URL.createObjectURL(c.value)); c.continue(); }; cur.onerror = () => rej(cur.error); });
      if (ICONS.size) $("#iconsMsg").textContent = ICONS.size + " iconos disponibles.";
    } catch (e) {}
  }
  async function iconsImport(files) {
    const entries = [];
    for (const f of files) {
      if (/\.zip$/i.test(f.name)) {
        if (typeof JSZip === "undefined") { $("#iconsMsg").textContent = "No se pudo cargar el lector de zip; sube las imágenes sueltas."; return; }
        const z = await JSZip.loadAsync(f);
        for (const [p, e] of Object.entries(z.files)) if (!e.dir && /\.(png|webp|jpe?g|gif|svg)$/i.test(p)) entries.push([p.split("/").pop(), await e.async("blob")]);
      } else entries.push([f.name, f]);
    }
    let db; try { db = await idb(); } catch (e) { $("#iconsMsg").textContent = "Este navegador no permite guardar los iconos."; return; }
    const tx = db.transaction("icons", "readwrite"); const st = tx.objectStore("icons");
    for (const [name, blob] of entries) { const key = name.replace(/\.[a-z0-9]+$/i, ""); st.put(blob, key); const old = ICONS.get(key); if (old) URL.revokeObjectURL(old); ICONS.set(key, URL.createObjectURL(blob)); }
    await new Promise(res => { tx.oncomplete = res; tx.onerror = res; });
    $("#iconsMsg").textContent = ICONS.size + " iconos guardados en este navegador.";
    if (CUR) renderChar(CUR);
  }
  $("#icons").addEventListener("change", e => { if (e.target.files.length) iconsImport(Array.from(e.target.files)).catch(err => { $("#iconsMsg").textContent = "Error al importar: " + err.message; }); });

  // ---- upgrade economics -------------------------------------------------
  const STONE = {};  // name -> item id
  for (const [id, e] of Object.entries(DB.items)) {
    if (/^(Somber )?Smithing Stone \[\d\]$/.test(e.n) || e.n === "Ancient Dragon Smithing Stone" || e.n === "Somber Ancient Dragon Smithing Stone") STONE[e.n] = +id;
  }
  function costStep(level, somber) { // cost to go from level-1 to level
    if (somber) return level >= 10 ? { "Somber Ancient Dragon Smithing Stone": 1 } : { ["Somber Smithing Stone [" + level + "]"]: 1 };
    if (level >= 25) return { "Ancient Dragon Smithing Stone": 1 };
    const tier = Math.floor((level - 1) / 3) + 1, n = [2, 4, 6][(level - 1) % 3];
    return { ["Smithing Stone [" + tier + "]"]: n };
  }
  function costRange(from, to, somber) { const t = {}; for (let l = from + 1; l <= to; l++) for (const [k, v] of Object.entries(costStep(l, somber))) t[k] = (t[k] || 0) + v; return t; }

  // ---- rendering ---------------------------------------------------------
  const CAT_ES = { melee_armaments: "Armas", ranged_and_catalysts: "Arcos y catalizadores", shields: "Escudos", arrows_and_bolts: "Munición", head: "Cascos", chest: "Pechos", arms: "Brazos", legs: "Piernas", talismans: "Talismanes", ashes_of_war: "Cenizas de guerra", ashes: "Cenizas espirituales", sorceries: "Hechicerías", incantations: "Encantamientos", tools: "Herramientas", key_items: "Objetos clave", crafting_materials: "Materiales", bolstering_materials: "Mejora", info: "Información", gestures: "Gestos" };
  const GROUPS = [["Todo", null], ["Armas", ["melee_armaments", "ranged_and_catalysts", "shields", "arrows_and_bolts"]], ["Armadura", ["head", "chest", "arms", "legs"]], ["Talismanes", ["talismans"]], ["Cenizas", ["ashes_of_war", "ashes"]], ["Magia", ["sorceries", "incantations"]], ["Consumibles", ["tools", "crafting_materials", "bolstering_materials"]], ["Clave", ["key_items", "info", "gestures"]]];
  let group = "Armas", limit = 250, mode = "have", useFilter = "all";
  // Catálogo de coleccionables para "No tengo"
  const CATALOG_CATS = new Set(["melee_armaments", "ranged_and_catalysts", "shields", "head", "chest", "arms", "legs", "talismans", "ashes_of_war", "ashes", "sorceries", "incantations", "key_items"]);
  const baseKey = i => { let n = i.name || ""; if (i.kind === "weapon" && i.infusion && i.infusion !== "Standard" && n.startsWith(i.infusion + " ")) n = n.slice(i.infusion.length + 1); if (i.kind !== "talisman") n = n.replace(/\s*\+\d+$/, ""); return n.toLowerCase(); };
  const CATALOG = [];
  for (const [id, e] of Object.entries(DB.items)) {
    if (e.f || !CATALOG_CATS.has(e.c)) continue;
    if (e.k === "weapon" && (+id) % 10000) continue;
    if (e.c === "ashes" && /\s\+\d+$/.test(e.n)) continue;
    CATALOG.push({ id: +id, name: e.n, display: e.n, kind: e.k, cat: e.c, sub: e.s || "", dlc: !!e.dlc, qty: 0, missing: true });
  }
  CATALOG.sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name));
  function missingFor(c) {
    if (!c.missing) { const have = new Set(c.all.map(baseKey)); c.missing = CATALOG.filter(i => !have.has(baseKey(i))); }
    return c.missing;
  }

  function stoneCounts(c) { const m = {}; for (const it of c.all) if (STONE[it.name] !== undefined) m[it.name] = (m[it.name] || 0) + it.qty; return m; }

  // ---- tabs ----------------------------------------------------------------
  let TAB = "status";
  function showTab(t) { TAB = t; for (const b of document.querySelectorAll(".tab")) b.setAttribute("aria-selected", b.dataset.t === t); for (const s of document.querySelectorAll(".screen")) s.setAttribute("aria-hidden", s.id !== "s-" + t); try { localStorage.setItem("tl.tab", t); } catch (e) {} if (location.hash !== "#" + t) history.replaceState(null, "", "#" + t); }
  $("#tabs").addEventListener("click", e => { const b = e.target.closest(".tab"); if (b) { showTab(b.dataset.t); if (b.dataset.t === "advice" && CUR) renderAdvice(CUR); } });
  window.addEventListener("hashchange", () => { const t = location.hash.slice(1); if (document.getElementById("s-" + t)) showTab(t); });

  // ---- small inline SVG icons (own drawings) --------------------------------
  const SVG = {
    vigor: '<path d="M9 2l2 4 2-4 3 5-1 5-4 6-4-6-1-5z"/>', mind: '<circle cx="9" cy="9" r="5"/><path d="M9 1v3M9 14v3M1 9h3M14 9h3"/>', endurance: '<path d="M3 13l3-8 3 5 3-7 3 10"/>', strength: '<path d="M4 15l4-6-2-3 4-3 2 4-3 1 4 7"/>', dexterity: '<path d="M3 15l6-12 6 12M6 10h6"/>', intelligence: '<path d="M9 2l6 7-6 7-6-7z"/>', faith: '<path d="M9 2v14M4 7h10"/>', arcane: '<circle cx="9" cy="9" r="6"/><circle cx="9" cy="9" r="2"/>',
  };
  const svg = k => `<i class="ic"><svg viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round">${SVG[k] || ""}</svg></i>`;
  // kvr(label, value, sub?, glossaryKey?) — with a glossary key the label becomes tappable and expands a short explanation + wiki link
  const kvr = (k, v, sub, g, extra) => `<div class="kvr${g ? " g" : ""}"${g ? ` data-g="${g}"` : ""}${extra ? ` data-extra="${esc(extra)}"` : ""}><span>${k}${g ? '<i class="qi" aria-hidden="true">i</i>' : ""}</span><b>${v}</b>${sub ? `<div class="sub" style="grid-column:1/-1">${sub}</div>` : ""}</div>`;
  const wlink = (page, text) => `<a class="wl" href="${WIKI}${encodeURIComponent(String(page).replace(/ /g, "_"))}" target="_blank" rel="noopener">${text}</a>`;
  document.addEventListener("click", e => {
    if (e.target.closest("a")) return;
    const row = e.target.closest(".kvr.g, .bar.g"); if (!row) return;
    const g = GLOSSARY[row.dataset.g]; if (!g) return;
    let tip = row.querySelector(".tip");
    if (tip) { tip.remove(); row.classList.remove("open"); return; }
    tip = document.createElement("div"); tip.className = "tip"; tip.innerHTML = `${row.dataset.extra ? `<div style="color:#e08a3c;margin-bottom:4px">${esc(row.dataset.extra)}</div>` : ""}${esc(g.es)} ${wlink(g.w, "Ver en la wiki ↗")}`; row.appendChild(tip); row.classList.add("open");
  });

  function weightOf(it) { const e = it && DB.items[it.id]; return e && e.w ? e.w : 0; }

  // ---- requirements (data/reqs.json, from the wiki) --------------------------
  const RQ = REQS || { weapons: {}, spells: {} };
  const STAT_SHORT = { str: "FUE", dex: "DES", int: "INT", fai: "FE", arc: "ARC" };
  const STAT_KEY = { str: "strength", dex: "dexterity", int: "intelligence", fai: "faith", arc: "arcane" };
  const INF_WORDS = /\b(Heavy|Keen|Quality|Fire|Flame Art|Lightning|Sacred|Magic|Cold|Poison|Blood|Occult|Bloody)\s+/g;
  function reqOf(it) { if (!it) return null;
    if (it.kind === "weapon") { const n = wikiName(it); return RQ.weapons[n] || RQ.weapons[n.replace(INF_WORDS, "").trim()] || null; }
    if (it.cat === "sorceries" || it.cat === "incantations") return RQ.spells[it.name] || null; return null; }
  // Equipment that raises attributes (counts for requirements). Values from the wiki; armor list is the well-known set, not exhaustive.
  const STAT_BOOST = {
    "Radagon's Scarseal": { vigor: 3, endurance: 3, strength: 3, dexterity: 3 }, "Radagon's Soreseal": { vigor: 5, endurance: 5, strength: 5, dexterity: 5 },
    "Marika's Scarseal": { mind: 3, intelligence: 3, faith: 3, arcane: 3 }, "Marika's Soreseal": { mind: 5, intelligence: 5, faith: 5, arcane: 5 },
    "Starscourge Heirloom": { strength: 5 }, "Prosthesis-Wearer Heirloom": { dexterity: 5 }, "Stargazer Heirloom": { intelligence: 5 }, "Two Fingers Heirloom": { faith: 5 },
    "Albinauric Mask": { arcane: 4 }, "Marais Mask": { arcane: 1 }, "Imp Head (Cat)": { arcane: 1 }, "Queen's Crescent Crown": { intelligence: 3 }, "Twinsage Glintstone Crown": { intelligence: 6 },
    "Olivinus Glintstone Crown": { intelligence: 2 }, "Lazuli Glintstone Crown": { intelligence: 2 }, "Karolos Glintstone Crown": { intelligence: 3 }, "Hierodas Glintstone Crown": { intelligence: 2, faith: 2 }, "Haima Glintstone Crown": { strength: 2, intelligence: 2 }, "Haligtree Knight Helm": { faith: 1 },
  };
  // {stat: [{src, v}]} from equipped talismans, armor and an active Godrick's Great Rune
  function statBonuses(c) {
    const out = {}; const E = c.enriched && c.enriched.equipped; if (!E) return out;
    const add = (src, b) => { for (const k in b) (out[k] = out[k] || []).push({ src, v: b[k] }); };
    for (const it of [E.head, E.chest, E.arms, E.legs].concat(E.talismans || [])) if (it && STAT_BOOST[it.name]) add(it.name, STAT_BOOST[it.name]);
    if (c.greatRuneActive && E.greatRune && /Godrick/.test(E.greatRune.name)) add("Godrick's Great Rune", { vigor: 5, mind: 5, endurance: 5, strength: 5, dexterity: 5, intelligence: 5, faith: 5, arcane: 5 });
    return out;
  }
  const effStats = c => { const B = statBonuses(c), S = Object.assign({}, c.stats); for (const k in B) S[k] = (S[k] | 0) + B[k].reduce((a, x) => a + x.v, 0); return S; };
  // {ok, boosted, twoHand, missing:[{k, need, have}], req, scale, via}; two-handing counts strength ×1.5 (weapons only)
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
  self.TL_USE = (c, it) => canUse(c, it); // used by cloud.js when building the account summary
  const useCls = u => !u ? "" : u.boosted ? " boost" : u.ok ? "" : u.twoHand ? " use2h" : " nope";
  const useTag = u => !u ? "" : u.boosted ? `<span class="tag boost">con ${esc(u.via.join(" + "))}${u.twoHand ? ", a dos manos" : ""}</span>` : u.ok ? "" : u.twoHand ? '<span class="tag use2h">a dos manos</span>' : `<span class="tag nope">faltan ${u.missing.map(m => `${STAT_SHORT[m.k]} ${m.need - m.have}`).join(", ")}</span>`;
  const useMeta = u => !u ? "" : u.boosted ? `solo gracias a ${u.via.join(" y ")}${u.twoHand ? " (y a dos manos)" : ""}: tus atributos base no llegan` : u.ok ? "" : u.twoHand ? "solo a dos manos" : "no cumples: " + u.missing.map(m => `${STAT_SHORT[m.k]} ${m.need} (tienes ${m.have})`).join(", ");
  const reqLine = u => { if (!u) return ""; const req = Object.entries(u.req).filter(([, v]) => v).map(([k, v]) => `${STAT_SHORT[k]} ${v}`).join(" · "); const sc = u.scale ? Object.entries(u.scale).map(([k, v]) => `${STAT_SHORT[k]} ${v}`).join(" · ") : ""; return `${req ? "Requisitos: " + req : "Sin requisitos"}${sc ? " · Escalado: " + sc : ""}${u.info.fp != null ? " · FP " + u.info.fp : ""}${u.info.slots ? " · huecos " + u.info.slots : ""}`; };
  function renderChar(c) {
    CUR = c;
    $("#cName").textContent = c.name || ("Slot " + (c.slot + 1));
    $("#cLevel").textContent = c.level;
    $("#cRunes").textContent = c.runes.toLocaleString("es");
    const ng = c.clearCount ? "NG+" + c.clearCount : "NG";
    $("#cSub").textContent = `${c.className} · ${ng} · ${ERSave.fmtTime(c.playtimeSec)} · ${c.deaths} muertes`;
    const gauge = (label, v, max, color, g) => `<div class="bar g" data-g="${g}"><span>${label}</span><i><b style="width:${max ? Math.min(100, 100 * v / max) : 0}%;background:${color}"></b></i><span class="num">${v} / ${max}</span></div>`;
    $("#gauges").innerHTML = gauge("HP", c.hp, c.maxHp, "var(--hp)", "hp") + gauge("FP", c.fp, c.maxFp, "var(--fp)", "fp") + gauge("SP", c.sp, c.maxSp, "var(--sp)", "sp");
    const S = c.stats, names = { vigor: "Vigor", mind: "Mente", endurance: "Resistencia", strength: "Fuerza", dexterity: "Destreza", intelligence: "Inteligencia", faith: "Fe", arcane: "Arcano" };
    const BN = statBonuses(c);
    // like the game's status screen: the effective total, tinted when equipment raises it; the breakdown shows when the row is expanded
    $("#stats").innerHTML = Object.keys(names).map(k => { const b = BN[k] ? BN[k].reduce((a, x) => a + x.v, 0) : 0;
      return kvr(svg(k) + names[k], b ? `<span class="bonus" title="Base ${S[k]} + ${b}">${S[k] + b}</span>` : S[k], null, k, b ? `Base ${S[k]} · ${BN[k].map(x => "+" + x.v + " " + x.src).join(" · ")}` : null); }).join("");
    const gr = c.enriched.equipped.greatRune;
    $("#kv").innerHTML = kvr("Nivel", c.level, null, "level") + kvr("Clase", wlink(c.className, esc(c.className)), null, "class") + kvr("Regalo", c.gift ? wlink(c.giftName, esc(c.giftName)) : "ninguno", null, "gift") + kvr("Runas totales", c.totalRunes.toLocaleString("es"), null, "runes") + kvr("Muertes", c.deaths, null, "deaths") + kvr("Ciclo", ng, null, "ng") + kvr("Nivel de arma (matchmaking)", "+" + c.matchmakingWpnLvl, null, "mmlvl") + kvr("Runa mayor equipada", gr ? wlink(gr.name, esc(gr.name)) : "ninguna", null, "greatrune") + kvr("Runa mayor activa (Arco de Runa)", c.greatRuneActive ? "sí" : "no", null, "runearc") + kvr("Huecos de talismán", 1 + c.talismanSlots, null, "talismans");
    const B = c.buildups;
    $("#resist").innerHTML = kvr("Veneno", B.poison, null, "poison") + kvr("Putrefacción", B.rot, null, "rot") + kvr("Hemorragia", B.bleed, null, "bleed") + kvr("Congelación", B.frost, null, "frost") + kvr("Sueño", B.sleep, null, "sleep") + kvr("Locura", B.madness, null, "madness") + kvr("Muerte", B.deathblight, null, "deathblight");
    const E = c.enriched.equipped;
    const worn = [E.head, E.chest, E.arms, E.legs].concat(E.rh, E.lh, E.talismans, E.arrows, E.bolts).filter(x => x && real(x));
    const load = worn.reduce((a, it) => a + weightOf(it), 0);
    const maxLoad = 45 + 1.6 * Math.min(S.endurance, 25) + (S.endurance > 25 ? 1.0 * (Math.min(S.endurance, 60) - 25) : 0) + (S.endurance > 60 ? 0.6 * (S.endurance - 60) : 0);
    const ratio = load / maxLoad, roll = ratio < .3 ? "ligero" : ratio < .7 ? "medio" : ratio <= 1 ? "pesado" : "sobrecargado";
    $("#misc").innerHTML = kvr("Carga de equipo", `${load.toFixed(1)} / ${maxLoad.toFixed(1)}`, `${roll} (aprox.)`, "load") + kvr("Frasco carmesí", c.crimsonFlasks, null, "crimson") + kvr("Frasco cerúleo", c.ceruleanFlasks, null, "cerulean") + kvr("Hechizos memorizados", c.enriched.spells.length, null, "spells");

    renderUnused(c);
    PLAN.add = {}; renderPlanner(c);
    renderEquip(c);
    renderProgress(c);
    renderForge(c);
    renderInv();
  }

  // ---- level planner ---------------------------------------------------------
  // runes needed to go from level x to x+1: fixed table up to 11; from 12, with y = x+1: 0.02y³ + 3.06y² + 105.6y − 895 (checked against the wiki: 12→1038, 44→11876, 100→61591)
  const LOW = [673, 689, 706, 723, 740, 757, 775, 793, 811, 829, 847];
  const levelCost = x => { if (x < 12) return LOW[x - 1]; const y = x + 1; return Math.floor(0.02 * y ** 3 + 3.06 * y ** 2 + 105.6 * y - 895); };
  const SOFT = { vigor: [40, 60], mind: [40, 60], endurance: [50, 60], strength: [55, 80], dexterity: [55, 80], intelligence: [60, 80], faith: [60, 80], arcane: [60, 80] };
  const STAT_ES = { vigor: "Vigor", mind: "Mente", endurance: "Resistencia", strength: "Fuerza", dexterity: "Destreza", intelligence: "Inteligencia", faith: "Fe", arcane: "Arcano" };
  const PLAN = { open: false, add: {} };
  function renderPlanner(c) {
    const box = $("#planner"); if (!box) return; box.hidden = !PLAN.open; $("#planBtn").setAttribute("aria-pressed", PLAN.open); if (!PLAN.open) return;
    const S = c.stats, add = PLAN.add, BNp = statBonuses(c); const n = Object.values(add).reduce((a, b) => a + b, 0);
    let cost = 0; for (let l = c.level; l < c.level + n; l++) cost += levelCost(l);
    const pocket = c.all.filter(i => RUNE_VALUE[i.name]).reduce((a, i) => a + RUNE_VALUE[i.name] * (i.qty || 1), 0);
    const avail = c.runes + pocket, left = avail - cost;
    let nextLv = c.level + n, affordable = 0, acc = 0; for (let l = c.level; l < 713; l++) { acc += levelCost(l); if (acc > avail) break; affordable++; }
    const row = k => { const v = S[k] + (add[k] || 0), [s1, s2] = SOFT[k]; const cls = v >= 99 ? "cap" : v >= s2 ? "cap" : v >= s1 ? "soft" : "";
      const bn = (BNp[k] || []).reduce((a, x) => a + x.v, 0);
      return `<div class="pr"><span>${svg(k)}${STAT_ES[k]}<span class="help" style="margin-left:6px">cap ${s1}/${s2}</span></span><span class="cur" title="${bn ? "base; con bonus " + (S[k] + bn) : ""}">${S[k]}${bn ? `<small class="help"> (${S[k] + bn})</small>` : ""}</span><span class="new ${cls}" title="${v >= s2 ? "por encima del segundo soft cap: rinde muy poco" : v >= s1 ? "por encima del primer soft cap: rinde menos" : ""}">${v}</span><span class="pm"><button data-pl-stat="${k}" data-d="-1" ${add[k] ? "" : "disabled"}>−</button><button data-pl-stat="${k}" data-d="1" ${v >= 99 ? "disabled" : ""}>+</button></span></div>`; };
    box.className = "planner";
    box.innerHTML = Object.keys(STAT_ES).map(row).join("") + `<div class="sum">
      <span>Nivel</span><span><b>${c.level}</b> → <b>${nextLv}</b> (+${n})</span>
      <span>Coste en runas</span><span><b>${cost.toLocaleString("es")}</b></span>
      <span>Runas disponibles${pocket ? " (incl. " + pocket.toLocaleString("es") + " en objetos)" : ""}</span><span><b>${avail.toLocaleString("es")}</b></span>
      <span>${left >= 0 ? "Te sobrarían" : "Te faltarían"}</span><span class="${left < 0 ? "neg" : ""}"><b>${Math.abs(left).toLocaleString("es")}</b></span>
      <span>Con lo que tienes puedes subir</span><span><b>${affordable}</b> nivel${affordable === 1 ? "" : "es"} (hasta ${c.level + affordable})</span></div>
      <div style="display:flex;gap:8px;margin-top:8px"><button class="btn" id="planReset">Reiniciar</button><button class="btn" id="planFill" title="Reparte los niveles que puedes pagar en los atributos que ya has tocado, o en Vigor si no has tocado ninguno">Gastar lo disponible</button></div>
      <p class="help" style="margin-top:6px">Soft caps: a partir del primero cada punto rinde menos; a partir del segundo, casi nada. El coste por nivel es el del juego (crece con el nivel, no con el atributo). Se planifica sobre el valor base; entre paréntesis, el efectivo con tu equipo.</p>`;
    $("#planReset").onclick = () => { PLAN.add = {}; renderPlanner(c); };
    $("#planFill").onclick = () => { const keys = Object.keys(add).filter(k => add[k] > 0); const target = keys.length ? keys : ["vigor"]; let i = 0; while (Object.values(PLAN.add).reduce((a, b) => a + b, 0) < affordable) { const k = target[i++ % target.length]; if (S[k] + (PLAN.add[k] || 0) >= 99) { if (target.every(t => S[t] + (PLAN.add[t] || 0) >= 99)) break; continue; } PLAN.add[k] = (PLAN.add[k] || 0) + 1; } renderPlanner(c); };
  }
  document.addEventListener("click", e => {
    if (e.target.id === "planBtn" && CUR) { PLAN.open = !PLAN.open; renderPlanner(CUR); return; }
    const b = e.target.closest("[data-pl-stat]"); if (b && CUR) { const k = b.dataset.plStat, d = +b.dataset.d; PLAN.add[k] = Math.max(0, (PLAN.add[k] || 0) + d); if (!PLAN.add[k]) delete PLAN.add[k]; renderPlanner(CUR); }
  });

  // ---- spirit ashes (Roderika) -------------------------------------------------
  const GHOST_NAMED = new Set(["Mimic Tear Ashes"]);
  function spiritInfo(name) { const m = name.match(/^(.*?)\s*\+\s*(\d+)\s*$/); const base = (m ? m[1] : name).trim(); return { base, level: m ? +m[2] : 0, ghost: GHOST_NAMED.has(base) || !/ Ashes$/.test(base) }; }
  const gloveName = (ghost, lvl) => lvl >= 10 ? (ghost ? "Great Ghost Glovewort" : "Great Grave Glovewort") : `${ghost ? "Ghost" : "Grave"} Glovewort [${lvl}]`;
  function renderSpirits(c) {
    const el = $("#spirits"); if (!el) return;
    const have = {}; for (const it of c.all) if (/^(Great )?(Grave|Ghost) Glovewort/.test(it.name)) have[it.name] = (have[it.name] || 0) + (it.qty || 1);
    const tile = (n, lbl) => `<div class="${have[n] ? "" : "zero"}" title="${esc(n)}"><b>${have[n] || 0}</b><span>${lbl}</span></div>`;
    $("#gloveN").innerHTML = [1,2,3,4,5,6,7,8,9].map(n => tile("Grave Glovewort [" + n + "]", "[" + n + "]")).join("") + tile("Great Grave Glovewort", "Great");
    $("#gloveS").innerHTML = [1,2,3,4,5,6,7,8,9].map(n => tile("Ghost Glovewort [" + n + "]", "[" + n + "]")).join("") + tile("Great Ghost Glovewort", "Great");
    const ashes = c.all.filter(i => i.cat === "ashes").map(i => Object.assign({ it: i }, spiritInfo(i.name)));
    ashes.sort((a, b) => (a.level >= 10) - (b.level >= 10) || b.level - a.level || a.base.localeCompare(b.base));
    el.innerHTML = ashes.map(a => {
      let reach = a.level, next = null; const pool = Object.assign({}, have);
      while (reach < 10) { const g = gloveName(a.ghost, reach + 1); if (pool[g] > 0) { pool[g]--; reach++; } else { next = g; break; } }
      const status = a.level >= 10 ? '<span class="tag max">máx</span>' : reach > a.level ? `<span class="tag" style="color:var(--ok);border-color:var(--ok)">puedes subir a +${reach}</span>` : "";
      const miss = a.level < 10 && next ? `<div class="m">${reach > a.level ? `para +${reach + 1}` : `para +${a.level + 1}`} falta ${link({ name: next, kind: "goods" }, esc(next))}</div>` : "";
      return `<div class="row"><div class="n">${ic(a.it)}${link({ name: a.base, kind: "goods" }, esc(a.base))} <b>+${a.level}</b>${status}</div><div class="q">${a.ghost ? "Ghost" : "Grave"}</div>${miss}</div>`;
    }).join("") || '<p class="help">Sin cenizas de espíritu.</p>';
  }

  // ---- unused upgrades / deliverables ---------------------------------------
  const RUNE_VALUE = { "Golden Rune [1]": 200, "Golden Rune [2]": 400, "Golden Rune [3]": 800, "Golden Rune [4]": 1200, "Golden Rune [5]": 1600, "Golden Rune [6]": 2000, "Golden Rune [7]": 2500, "Golden Rune [8]": 3000, "Golden Rune [9]": 3800, "Golden Rune [10]": 5000, "Golden Rune [11]": 6250, "Golden Rune [12]": 7500, "Golden Rune [13]": 10000, "Numen's Rune": 12000, "Hero's Rune [1]": 15000, "Hero's Rune [2]": 20000, "Hero's Rune [3]": 25000, "Hero's Rune [4]": 30000, "Hero's Rune [5]": 35000, "Lord's Rune": 50000 };
  function renderUnused(c) {
    const pane = $("#unusedPane"), el = $("#unused"); if (!pane) return;
    const qty = name => c.all.filter(i => i.name === name).reduce((a, i) => a + (i.qty || 1), 0);
    const list = pred => { const m = new Map(); for (const i of c.all) if (pred(i.name)) m.set(i.name, (m.get(i.name) || 0) + (i.qty || 1)); return [...m]; };
    const row = (label, items, g, how) => items.length ? kvr(label, items.reduce((a, x) => a + x[1], 0), items.map(([n, q]) => `${link({ name: n, kind: "goods" }, esc(n))}${q > 1 ? " ×" + q : ""}`).join(" · ") + (how ? `<div class="help" style="margin-top:2px">${how}</div>` : ""), g) : "";
    const rows = [];
    const grace = [["Golden Seed", qty("Golden Seed")], ["Sacred Tear", qty("Sacred Tear")], ["Scadutree Fragment", qty("Scadutree Fragment")], ["Revered Spirit Ash", qty("Revered Spirit Ash")]].filter(x => x[1] > 0);
    const maxed = (c.crimsonFlasks + c.ceruleanFlasks) >= 14;
    rows.push(row("En un lugar de gracia", grace, "unused_grace", "Se aplican desde el menú de la gracia: más cargas y curación de los frascos; en la expansión, la bendición del Scadutree y de las cenizas." + (maxed && qty("Golden Seed") ? " Ya tienes las 14 cargas máximas: las semillas sobrantes no se pueden usar." : "")));
    const runes = list(n => RUNE_VALUE[n]).sort((x, y) => RUNE_VALUE[y[0]] - RUNE_VALUE[x[0]]); const total = runes.reduce((a, [n, q]) => a + RUNE_VALUE[n] * q, 0);
    rows.push(row("Runas sin consumir", runes, "unused_runes", total ? `Valen ${total.toLocaleString("es")} runas en total; úsalas cuando vayas a subir de nivel o comprar.` : ""));
    rows.push(row("Remembranzas", list(n => /^Remembrance of /.test(n)), "unused_rem", "Enia (Mesa Redonda) las cambia por el arma o hechizo del jefe; también se pueden consumir por runas."));
    rows.push(row("Entregar a un PNJ", list(n => /Prayerbook$|Scroll$/.test(n) || n === "Deathroot" || n === "Dragon Heart"), "unused_npc", "Libros de oración → Corhyn o Miriel; pergaminos → Sellen o Thops; Deathroot → Gurranq; Dragon Heart → altares de Comunión Dragón."));
    rows.push(row("Campanas de vendedor", list(n => /Bell Bearing/.test(n)), "unused_bell", "Entrégalas a las Gemelas Vendedoras de la Mesa Redonda para comprar lo que vendía ese mercader (piedras incluidas)."));
    const glove = list(n => /^(Great )?(Grave|Ghost) Glovewort/.test(n));
    rows.push(row("Para Roderika (espíritus)", glove, "unused_glove", "Mejoran las cenizas de espíritu en la Mesa Redonda."));
    const dragon = list(n => /Ancient Dragon Smithing Stone$/.test(n));
    rows.push(row("Piedras de dragón", dragon, "unused_dragon", "Suben un arma al máximo (+25 o +10 sombría). Elige bien: no se compran."));
    const other = list(n => n === "Larval Tear" || n === "Rune Arc");
    rows.push(row("Otros", other, "unused_other", "Larval Tear: redistribuir atributos con Rennala. Rune Arc: activa la runa mayor equipada."));
    const html = rows.join("");
    pane.hidden = !html; el.innerHTML = html || "";
  }

  // ---- equipment screen -----------------------------------------------------
  const EQSEL = { k: null };
  function slot(it, lbl, extra) { const has = it && real(it); const img = has ? ICONS.size && iconCandidates(it).map(k => ICONS.get(k)).find(Boolean) : null; const u = has ? canUse(CUR, it) : null;
    return `<div class="slot${has ? "" : " empty"}${useCls(u)}" data-item="${has ? esc(JSON.stringify({ n: it.display, w: wikiName(it), d: [it.sub, it.infusion && it.infusion !== "Standard" ? it.infusion : null, it.aow ? "Ceniza: " + it.aow : null, weightOf(it) ? "Peso " + weightOf(it) : null, useMeta(u)].filter(Boolean).join(" · "), r: reqLine(u), i: img || "" })) : ""}" role="button" tabindex="0">${img ? `<img src="${img}" alt="">` : has ? `<span style="font-size:.6rem;text-align:center;padding:4px;color:var(--fg-2)">${esc(it.display)}</span>` : ""}${has && it.kind === "weapon" && it.level ? `<span class="lvl">+${it.level}</span>` : ""}<span class="lbl">${lbl}</span></div>`; }
  function renderEquip(c) {
    const E = c.enriched.equipped;
    $("#eqArms").innerHTML = [0, 1, 2].map(i => slot(E.rh[i], "Dcha " + (i + 1))).join("") + [0, 1, 2].map(i => slot(E.lh[i], "Izq " + (i + 1))).join("") + slot(E.arrows[0], "Flecha 1") + slot(E.arrows[1], "Flecha 2") + slot(E.bolts[0], "Virote 1") + slot(E.bolts[1], "Virote 2");
    $("#eqArmor").innerHTML = slot(E.head, "Cabeza") + slot(E.chest, "Pecho") + slot(E.arms, "Brazos") + slot(E.legs, "Piernas") + slot(E.greatRune, "Runa mayor") + E.talismans.map((t, i) => slot(t, "Talismán " + (i + 1))).join("");
    const Q = c.enriched.quick, P = c.enriched.pouch;
    $("#eqQuick").innerHTML = Array.from({ length: Math.max(3, Q.length) }, (_, i) => slot(Q[i], "Rápido " + (i + 1))).join("") + Array.from({ length: Math.max(6, P.length) }, (_, i) => slot(P[i], "Bolsa " + (i + 1))).join("");
    const Sp = c.enriched.spells, phys = c.physick.map(id => { const e = DB.items[id]; return e ? { id, name: e.n, display: e.n, kind: e.k, cat: e.c, sub: e.s || "" } : null; });
    $("#eqSpells").innerHTML = Sp.map((s, i) => slot(s, "Hechizo " + (i + 1))).join("") + phys.map((p, i) => slot(p, "Físico " + (i + 1))).join("");
    $("#eqDetail").innerHTML = `<div class="d help">Toca un hueco para ver el objeto.</div>`;
  }
  document.addEventListener("click", e => { const s = e.target.closest(".slot[data-item], .cell[data-item]"); if (!s) return; const d = JSON.parse(s.dataset.item); const box = s.classList.contains("slot") ? $("#eqDetail") : $("#invDetail");
    for (const x of s.parentElement.querySelectorAll(".sel")) x.classList.remove("sel"); s.classList.add("sel");
    box.innerHTML = `${d.i ? `<img src="${d.i}" alt="">` : ""}<div><div class="t">${esc(d.n)}</div><div class="d">${esc(d.d || "")}</div>${d.r ? `<div class="d" style="color:var(--gold-2)">${esc(d.r)}</div>` : ""}${d.l ? `<div class="d">${esc(d.l)}</div>` : ""}<a class="wl" href="${WIKI}${encodeURIComponent(d.w.replace(/ /g, "_"))}" target="_blank" rel="noopener">Ver en la wiki</a></div>`; });

  // ---- forge ----------------------------------------------------------------
  function renderForge(c) {
    const sc = stoneCounts(c);
    const tile = (n, lbl) => `<div class="${sc[n] ? "" : "zero"}" title="${esc(n)}"><b>${sc[n] || 0}</b><span>${lbl}</span></div>`;
    $("#stonesN").innerHTML = [1,2,3,4,5,6,7,8].map(n => tile("Smithing Stone [" + n + "]", "[" + n + "]")).join("") + tile("Ancient Dragon Smithing Stone", "Dragón");
    $("#stonesS").innerHTML = [1,2,3,4,5,6,7,8,9].map(n => tile("Somber Smithing Stone [" + n + "]", "[" + n + "]")).join("") + tile("Somber Ancient Dragon Smithing Stone", "Dragón");
    const weapons = c.all.filter(i => i.kind === "weapon" && i.maxLevel > 0 && !["arrows_and_bolts"].includes(i.cat));
    weapons.sort((a, b) => (a.level >= a.maxLevel) - (b.level >= b.maxLevel) || b.level - a.level || a.name.localeCompare(b.name));
    const sel = $("#planWeapon");
    sel.innerHTML = weapons.map((w, i) => `<option value="${i}">${esc(w.display)} (máx +${w.maxLevel})</option>`).join("");
    sel.onchange = planUpdate;
    $("#planTo").oninput = () => planUpdate("typing"); $("#planTo").onchange = planUpdate;
    sel.selectedIndex = Math.max(0, weapons.findIndex(w => w.level > 0 && w.level < w.maxLevel));
    c.weapons = weapons; planUpdate(true);
    renderSpirits(c);
    const wrow = w => `<div class="row click${w.stored ? " stored" : ""}" data-w="${weapons.indexOf(w)}" role="button" tabindex="0"><div class="n">${ic(w)}${link(w, esc(w.display))}${useTag(canUse(c, w))}${w.level >= w.maxLevel ? '<span class="tag max">máx</span>' : ""}${w.aow ? `<span class="tag">${esc(w.aow)}</span>` : ""}<span class="lvlbar"><b style="width:${100 * w.level / w.maxLevel}%"></b></span></div><div class="q">+${w.level} / ${w.maxLevel}</div></div>`;
    const pending = weapons.filter(w => w.level > 0 && w.level < w.maxLevel), maxed = weapons.filter(w => w.level >= w.maxLevel);
    $("#upgradeable").innerHTML = (pending.map(wrow).join("") || `<p class="help">Ninguna arma a medias: todo lo que has tocado está al máximo.</p>`) + (maxed.length ? `<details><summary>${maxed.length} armas al máximo</summary><div class="list">${maxed.map(wrow).join("")}</div></details>` : "");
  }

  function markBtn(k, id) { const on = CUR && Marks.has(Marks.charKey(CUR), k, id); return `<button class="btn mk" data-mark="${k}|${id}" aria-pressed="${!!on}" title="Marcar a mano">${on ? "✓ marcado" : "marcar"}</button>`; }
  function markName(e) { if (e.k === "boss") { const b = FLAGS.bosses.find(x => String(x.id) === e.id); return b ? b.name : e.id; } if (e.k === "grace") { const g = FLAGS.graces.find(x => String(x.id) === e.id); return g ? g.name : e.id; } if (e.k === "item") { const it = DB.items[e.id]; return it ? it.n : e.id; } return e.id; }
  document.addEventListener("click", e => { const b = e.target.closest("[data-mark]"); if (b && CUR) { const [k, id] = b.dataset.mark.split("|"); const on = Marks.toggle(Marks.charKey(CUR), k, id); cloudMark(Marks.charKey(CUR), k, id, on); renderProgress(CUR); return; }
    const u = e.target.closest("[data-unmark]"); if (u && CUR) { const [k, id] = u.dataset.unmark.split("|"); Marks.set(Marks.charKey(CUR), k, id, false); cloudMark(Marks.charKey(CUR), k, id, false); renderProgress(CUR); return; }
    if (e.target.id === "marksExport") { const txt = Marks.export(); navigator.clipboard.writeText(txt).then(() => { e.target.textContent = "Copiado"; setTimeout(() => e.target.textContent = "Exportar", 1500); }).catch(() => { prompt("Copia este JSON:", txt); }); } });
  document.addEventListener("change", async e => { if (e.target.id === "marksImport" && e.target.files[0]) { try { Marks.import(await e.target.files[0].text()); if (CUR) renderProgress(CUR); } catch (err) { alert("JSON no válido"); } } });
  // progress tab: tiles → tappable lists (pending / done / all) with a link to the map pre-filtered
  const PL = { view: null, state: "todo", q: "" };
  function renderProgress(c) {
    const el = $("#progress"); if (!c.progress) { el.innerHTML = `<p class="muted small">Sin datos de progreso (vuelve a abrir el .sl2).</p>`; return; }
    const CK = Marks.charKey(c), manual = Marks.load(CK);
    const gv = new Set(c.progress.graces), bd = new Set(c.progress.bosses);
    const graceDone = g => gv.has(g.id) || manual.has("grace:" + g.id), bossDone = b => bd.has(b.id) || manual.has("boss:" + b.id);
    const main = FLAGS.bosses.filter(b => b.type === "main"), field = FLAGS.bosses.filter(b => b.type !== "main"), rem = FLAGS.bosses.filter(b => b.rem);
    const picked = new Set(c.progress.picked || []), have = new Set(c.all.map(i => i.id));
    const world = Object.keys(FLAGS.pickups || {}).map(Number).map(id => ({ id, e: DB.items[id] })).filter(x => x.e).sort((a, b) => (a.e.c || "").localeCompare(b.e.c || "") || a.e.n.localeCompare(b.e.n));
    const worldDone = x => picked.has(x.id) || have.has(x.id) || manual.has("item:" + x.id);
    const SETS = {
      graces: { title: "Gracias", items: FLAGS.graces, done: graceDone, group: g => g.region, k: "grace", map: "l=grace" },
      main: { title: "Jefes principales", items: main, done: bossDone, group: b => b.region, k: "boss", map: "l=boss&t=main", help: "Jefes de mazmorras legado y de historia." },
      field: { title: "Jefes de campo y mazmorras", items: field, done: bossDone, group: b => b.region, k: "boss", map: "l=boss&t=field", help: "Según el save; si uno está mal (opcional ya vencido que el juego no marca), márcalo a mano." },
      rem: { title: "Remembranzas", items: rem, done: bossDone, group: b => b.region, k: "boss", map: "l=boss&t=rem", help: "Jefes que dejan una remembranza al morir." },
      world: { title: "Objetos únicos del mundo", items: world, done: worldDone, group: x => CAT_ES[x.e.c] || x.e.c || "Otros", k: "item", map: "l=miss", help: "Notas, mapas, cartas, lágrimas, recetarios, llaves… que existen una sola vez y aún no has cogido." },
    };
    const cnt = key => { const S = SETS[key]; const d = S.items.filter(S.done).length; return `${d} / ${S.items.length}`; };
    const tile = (key, label) => `<button class="tile${PL.view === key ? " on" : ""}" data-pl="${key}"><b>${cnt(key)}</b><span>${label}</span></button>`;
    let panel = "";
    if (PL.view && SETS[PL.view]) {
      const S = SETS[PL.view], q = PL.q.toLowerCase();
      const nameOf = x => x.name || (x.e && x.e.n) || "";
      const rows = S.items.filter(x => (PL.state === "all" || (PL.state === "done") === !!S.done(x)) && (!q || nameOf(x).toLowerCase().includes(q) || String(S.group(x)).toLowerCase().includes(q)));
      const groups = new Map(); for (const x of rows) { const g = S.group(x); (groups.get(g) || groups.set(g, []).get(g)).push(x); }
      const row = x => { const done = !!S.done(x), nm = nameOf(x), fromSave = S.k === "boss" ? bd.has(x.id) : S.k === "grace" ? gv.has(x.id) : picked.has(x.id) || have.has(x.id);
        const it = S.k === "item" ? { id: x.id, name: x.e.n, kind: x.e.k } : { name: nm, kind: S.k };
        return `<div class="row${done ? " done" : ""}"><div class="n">${S.k === "item" ? ic(it) : ""}${link(it, esc(nm))}${x.rem ? '<span class="tag">remembranza</span>' : ""}</div><div class="q">${done ? (fromSave ? "✓" : "✓ a mano") : markBtn(S.k, x.id)}</div>${S.k === "item" && x.e.loc ? `<div class="m">${esc(x.e.loc.replace(/\s*\[\s*Map Link\s*\]\s*;?/g, ""))}</div>` : ""}</div>`; };
      const seg = (v, l) => `<button class="cat" data-pls="${v}" aria-pressed="${PL.state === v}">${l}</button>`;
      panel = `<div class="pane frame plist"><div class="plh"><h3>${S.title} <span class="muted">${rows.length}</span></h3><a class="btn" href="map.html#${S.map}&s=${PL.state}${PL.q ? "&q=" + encodeURIComponent(PL.q) : ""}">Ver en el mapa</a></div>
        ${S.help ? `<p class="help">${S.help}</p>` : ""}
        <div class="plf">${seg("todo", "Pendientes")}${seg("done", "Hechos")}${seg("all", "Todos")}<input id="plq" type="search" placeholder="Filtrar…" value="${esc(PL.q)}" autocomplete="off"></div>
        <div class="list">${[...groups].map(([g, xs]) => `<div class="grp"><div class="gh">${esc(g)} <span class="muted">${xs.length}</span></div>${xs.map(row).join("")}</div>`).join("") || `<p class="help">${PL.state === "todo" ? "Nada pendiente." : "Nada todavía."}</p>`}</div></div>`;
    }
    el.innerHTML = `<div id="diary"></div><div class="kv tiles">${tile("graces", "Gracias")}${tile("main", "Jefes principales")}${tile("field", "Jefes de campo")}${tile("rem", "Remembranzas")}${tile("world", "Objetos únicos")}<div><b>${(c.progress.regions || []).length} / ${Object.keys(FLAGS.mapRegions || {}).length}</b><span>Zonas de mapa</span></div></div>
      ${panel || '<p class="help">Toca una casilla para ver la lista de pendientes y hechos.</p>'}
      <details><summary>Marcas manuales (${Marks.all(CK).length})</summary><p class="help">Lo que has marcado a mano para este personaje (lugares en el mapa, jefes, gracias, objetos). Se guarda en este navegador${Cloud.user() ? " y en tu cuenta (sincronizado con Steam)" : '; si entras con Steam (botón de cuenta arriba) se sincroniza entre dispositivos'}. "Exportar" copia el JSON.</p><div class="list">${Marks.all(CK).map(e => `<div class="row"><div class="n">${esc(e.k)} · ${esc(markName(e))}</div><div class="q">${e.at} <button class="btn" data-unmark="${esc(e.k)}|${esc(e.id)}">quitar</button></div></div>`).join("") || '<p class="help">Ninguna todavía.</p>'}</div><div style="display:flex;gap:8px;margin-top:8px"><button class="btn" id="marksExport">Exportar</button><label class="btn" for="marksImport">Importar</label><input id="marksImport" type="file" accept=".json" hidden></div></details>`;
    renderDiary(c);
    const pq = $("#plq"); if (pq) pq.oninput = () => { PL.q = pq.value; const pos = pq.selectionStart; renderProgress(c); const n = $("#plq"); if (n) { n.focus(); n.setSelectionRange(pos, pos); } };
  }
  // ---- session diary (from the account's snapshots) ---------------------------
  const DIARY = { cache: {} };
  async function renderDiary(c) {
    const box = $("#diary"); if (!box || !Cloud.user()) return;
    const ck = Marks.charKey(c);
    let H = DIARY.cache[ck]; if (!H) { H = await Cloud.history(ck); DIARY.cache[ck] = H; }
    if (CUR !== c || !document.getElementById("diary")) return;
    if (H.length < 2) { $("#diary").innerHTML = H.length === 1 ? `<p class="help">Diario: primera sesión registrada (${esc(new Date(H[0].at.replace(" ", "T") + "Z").toLocaleDateString("es-ES", { dateStyle: "medium" }))}). A partir de la próxima partida que abras verás aquí qué ha cambiado.</p>` : ""; return; }
    const prev = H[H.length - 2], now = H[H.length - 1];
    const bossName = id => (FLAGS.bosses.find(b => b.id === id) || {}).name;
    const newBosses = now.bosses.filter(id => !prev.bosses.includes(id)).map(bossName).filter(Boolean);
    const newGraces = now.graces.filter(id => !prev.graces.includes(id)).length;
    const pw = new Map(prev.weapons || []); const ups = (now.weapons || []).filter(([n, l]) => (pw.get(n) || 0) < l).map(([n, l]) => `${n} +${pw.get(n) || 0}→+${l}`);
    const d = (a, b) => { const v = (b || 0) - (a || 0); return v ? (v > 0 ? "+" : "") + v.toLocaleString("es") : "0"; };
    const sec = now.playtime - prev.playtime;
    const statD = Object.keys(now.stats || {}).filter(k => (now.stats[k] || 0) !== ((prev.stats || {})[k] || 0)).map(k => `${STAT_ES[k] || k} ${prev.stats[k]}→${now.stats[k]}`);
    // level sparkline over all snapshots
    const W = 320, Hh = 46, lv = H.map(h => h.level), min = Math.min(...lv), max = Math.max(...lv), span = Math.max(1, max - min);
    const pts = H.map((h, i) => `${(i / Math.max(1, H.length - 1)) * (W - 8) + 4},${Hh - 6 - ((h.level - min) / span) * (Hh - 14)}`).join(" ");
    const when = h => new Date(h.at.replace(" ", "T") + "Z").toLocaleDateString("es-ES", { day: "numeric", month: "short" });
    $("#diary").innerHTML = `<div class="pane frame" style="margin-bottom:12px"><h3>Diario · desde la sesión anterior <span class="muted">(${esc(when(prev))} → ${esc(when(now))})</span></h3>
      <div class="kv"><div><b>${d(prev.level, now.level)}</b><span>nivel (${now.level})</span></div><div><b>${ERSave.fmtTime(sec)}</b><span>jugado</span></div><div><b>${newBosses.length}</b><span>jefes</span></div><div><b>${newGraces}</b><span>gracias</span></div><div><b>${d(prev.items, now.items)}</b><span>objetos</span></div><div><b>${d(prev.deaths, now.deaths)}</b><span>muertes</span></div></div>
      ${newBosses.length ? `<p style="margin:8px 0 0"><span class="help">Jefes vencidos:</span> ${newBosses.map(n => link({ name: n, kind: "boss" }, esc(n))).join(", ")}</p>` : ""}
      ${ups.length ? `<p style="margin:6px 0 0"><span class="help">Armas mejoradas:</span> ${ups.map(esc).join(", ")}</p>` : ""}
      ${statD.length ? `<p style="margin:6px 0 0"><span class="help">Atributos:</span> ${statD.map(esc).join(", ")}</p>` : ""}
      <svg viewBox="0 0 ${W} ${Hh}" width="100%" height="${Hh}" style="margin-top:8px;display:block" aria-label="Nivel por sesión"><polyline fill="none" stroke="var(--gold)" stroke-width="1.5" points="${pts}"/>${H.map((h, i) => `<circle cx="${(i / Math.max(1, H.length - 1)) * (W - 8) + 4}" cy="${Hh - 6 - ((h.level - min) / span) * (Hh - 14)}" r="2.5" fill="var(--gold-2)"><title>${esc(when(h))}: nivel ${h.level}</title></circle>`).join("")}<text x="4" y="${Hh - 0}" font-size="9" fill="var(--muted)">${esc(when(H[0]))} · nv ${min}</text><text x="${W - 4}" y="10" font-size="9" fill="var(--muted)" text-anchor="end">nv ${max}</text></svg>
      <p class="help" style="margin:6px 0 0">${H.length} sesiones registradas (una por cada partida con tiempo de juego distinto que abres con la sesión iniciada).</p></div>`;
  }
  document.addEventListener("click", e => {
    const t = e.target.closest("[data-pl]"); if (t && CUR) { PL.view = PL.view === t.dataset.pl ? null : t.dataset.pl; PL.q = ""; renderProgress(CUR); return; }
    const s = e.target.closest("[data-pls]"); if (s && CUR) { PL.state = s.dataset.pls; renderProgress(CUR); }
  });

  function planUpdate(init) {
    const c = CUR; if (!c || !c.weapons.length) { $("#need").innerHTML = ""; return; }
    const w = c.weapons[$("#planWeapon").value | 0];
    const toEl = $("#planTo"); toEl.max = w.maxLevel; toEl.min = w.level + 1;
    const v = +toEl.value;
    if (init === true) toEl.value = w.maxLevel;
    else if (init !== "typing" && (!v || v <= w.level || v > w.maxLevel)) toEl.value = w.maxLevel; // clamp only when editing ends
    const to = Math.min(w.maxLevel, Math.max(w.level + 1, +toEl.value || w.maxLevel));
    const need = costRange(w.level, to, w.maxLevel <= 10), have = stoneCounts(c);
    const lines = Object.entries(need).map(([n, q]) => { const h = have[n] || 0; return `<div class="${h >= q ? "yes" : "no"}"><span>${esc(n)}</span><span>${h} / ${q}</span></div>`; });
    const ok = Object.entries(need).every(([n, q]) => (have[n] || 0) >= q);
    $("#need").innerHTML = (w.level >= w.maxLevel ? `<div class="yes"><span>Ya está al máximo.</span><span></span></div>` : `<div class="muted small"><span>De +${w.level} a +${to}${w.stored ? " (está en el cofre)" : ""}</span><span>${ok ? "✓ tienes todo" : "faltan piedras"}</span></div>` + lines.join(""));
  }

  function renderInv() {
    const c = CUR; if (!c) return;
    const q = ($("#q").value || "").trim().toLowerCase();
    const cats = GROUPS.find(g => g[0] === group)[1];
    const src = mode === "missing" ? missingFor(c) : c.all;
    let items = src.filter(i => (!cats || cats.includes(i.cat)) && (!q || i.name.toLowerCase().includes(q) || (i.aow || "").toLowerCase().includes(q)));
    const ORDER = ["melee_armaments", "ranged_and_catalysts", "shields", "arrows_and_bolts", "head", "chest", "arms", "legs", "talismans", "ashes_of_war", "ashes", "sorceries", "incantations", "tools", "crafting_materials", "bolstering_materials", "key_items", "info", "gestures"];
    const oi = c => { const i = ORDER.indexOf(c); return i < 0 ? 99 : i; };
    if (useFilter !== "all") items = items.filter(i => { const u = canUse(c, i); if (!u) return useFilter === "ok"; return useFilter === "ok" ? u.ok || u.twoHand : !u.ok && !u.twoHand; });
    items = items.slice().sort((a, b) => oi(a.cat) - oi(b.cat) || a.name.localeCompare(b.name));
    if (mode === "missing") { const tot = CATALOG.filter(i => !cats || cats.includes(i.cat)).length; $("#count").textContent = `${items.length} por conseguir de ${tot}` + (q ? " (filtrado)" : ""); }
    else $("#count").textContent = items.length + " objetos";
    const cell = i => { const img = ICONS.size ? iconCandidates(i).map(k => ICONS.get(k)).find(Boolean) : null; const e = DB.items[i.id]; const u = canUse(c, i);
      const meta = [CAT_ES[i.cat] || i.cat, i.sub, i.infusion && i.infusion !== "Standard" ? i.infusion : null, i.aow ? "Ceniza: " + i.aow : null, i.qty > 1 ? "×" + i.qty : null, i.stored ? "en el cofre" : null, i.kind === "weapon" && i.maxLevel ? `+${i.level}/${i.maxLevel}` : null, useMeta(u)].filter(Boolean).join(" · ");
      return `<div class="cell${i.missing ? " miss" : ""}${i.stored ? " stored" : ""}${useCls(u)}" data-item="${esc(JSON.stringify({ n: i.display, w: wikiName(i), d: meta, r: reqLine(u), l: e && e.loc ? e.loc.replace(/\s*\[\s*Map Link\s*\]\s*;?/g, "").replace(/\s+([.,;])/g, "$1").replace(/\s{2,}/g, " ") : "", i: img || "" }))}" role="button" tabindex="0" title="${esc(i.display)}">${img ? `<img src="${img}" alt="" loading="lazy">` : `<span class="nm">${esc(i.display)}</span>`}${i.qty > 1 ? `<span class="q">${i.qty}</span>` : ""}${i.kind === "weapon" && i.level ? `<span class="lv">+${i.level}</span>` : ""}</div>`; };
    $("#inv").innerHTML = items.slice(0, limit).map(cell).join("");
    const more = $("#more"); more.hidden = items.length <= limit; if (!more.hidden) more.textContent = `Mostrar ${Math.min(250, items.length - limit)} más (${items.length - limit} restantes)`;
    $("#invDetail").innerHTML = `<div class="d help">Toca un objeto para ver el detalle.</div>`;
  }

  function modeChips() { $("#mode").innerHTML = [["have", "Tengo"], ["missing", "No tengo"]].map(([m, l]) => `<button class="cat" aria-pressed="${m === mode}" data-m="${m}">${l}</button>`).join("") + (Object.keys(RQ.weapons).length ? [["all", "Todo"], ["ok", "Puedo usar"], ["no", "No cumplo"]].map(([m, l]) => `<button class="cat" aria-pressed="${m === useFilter}" data-u="${m}" style="margin-left:${m === "all" ? 8 : 0}px">${l}</button>`).join("") : ""); }
  $("#mode").addEventListener("click", e => { const b = e.target.closest(".cat"); if (!b) return; if (b.dataset.u) { useFilter = b.dataset.u; limit = 250; modeChips(); renderInv(); return; } mode = b.dataset.m; limit = 250; modeChips(); renderInv(); });
  modeChips();
  function chips() { $("#chips").innerHTML = GROUPS.map(g => `<button class="cat" aria-pressed="${g[0] === group}" data-g="${g[0]}">${g[0]}</button>`).join(""); }
  $("#chips").addEventListener("click", e => { const b = e.target.closest(".cat"); if (!b) return; group = b.dataset.g; limit = 250; chips(); renderInv(); });
  $("#upgradeable").addEventListener("click", e => { if (e.target.closest("a")) return; const r = e.target.closest("[data-w]"); if (!r) return; $("#planWeapon").value = r.dataset.w; planUpdate(true); $("#planWeapon").scrollIntoView({ block: "center", behavior: "smooth" }); showTab("forge"); });
  $("#q").addEventListener("input", () => { limit = 250; renderInv(); });
  $("#more").addEventListener("click", () => { limit += 250; renderInv(); });
  chips();

  // ---- loading -----------------------------------------------------------
  const PLACEHOLDER = new Set([110000, 0x10002710, 0x10002774, 0x100027D8, 0x1000283C]); // Unarmed, Head, Body, Arms, Legs
  const real = i => !PLACEHOLDER.has(i.id);
  function prep(save) {
    for (const c of save.chars) {
      if (c.error) continue;
      c.steamId = save.steamId || "0";
      c.enriched = ERSave.enrich(c, DB);
      c.all = c.enriched.inventory.concat(c.enriched.keyItems, c.enriched.storage, c.enriched.storageKeys).filter(real);
      if (c.eventFlags) {
        const flag = ERSave.makeFlagReader(FLAGS.bst, c.eventFlags);
        c.progress = { graces: FLAGS.graces.filter(g => flag(g.id)).map(g => g.id), bosses: FLAGS.bosses.filter(b => flag(b.id)).map(b => b.id),
          picked: Object.entries(FLAGS.pickups || {}).filter(([, f]) => flag(f)).map(([id]) => +id), regions: Object.keys(FLAGS.mapRegions || {}).filter(k => flag(+k)).map(Number) };
        delete c.eventFlags;
      }
    }
  }
  function showSave(save, name, when) {
    SAVE = save; FILENAME = name;
    const chars = save.chars.filter(c => !c.error);
    const sel = $("#charSel");
    sel.innerHTML = chars.map(c => `<option value="${c.slot}">${esc(c.name || "Slot " + (c.slot + 1))} · ${c.level}</option>`).join("");
    sel.hidden = true;
    sel.onchange = () => pick(chars, sel.value);
    const cs = $("#chars"); cs.hidden = chars.length < 2;
    cs.innerHTML = chars.map(c => `<button data-slot="${c.slot}" aria-pressed="false"><b>${esc(c.name || "Slot " + (c.slot + 1))}</b><span>Nv ${c.level} · ${esc(c.className)}</span></button>`).join("");
    cs.onclick = e => { const b = e.target.closest("[data-slot]"); if (b) pick(chars, b.dataset.slot); };
    const bad = save.chars.filter(c => c.error);
    $("#msg").innerHTML = bad.length ? `<span class="err">No se pudo leer ${bad.length} slot(s): ${esc(bad[0].error)}</span>` : "";
    if (!chars.length) { $("#msg").innerHTML = `<span class="err">No hay personajes legibles en este archivo.</span>`; return; }
    $("#app").hidden = false; $("#dropSec").hidden = true; $("#barOpen").hidden = false; $("#barSteam").hidden = false; $("#modes").hidden = false; $("#tabs").hidden = false; let t0 = location.hash.slice(1); try { t0 = t0 || localStorage.getItem("tl.tab") || "status"; } catch (e) {} showTab(document.getElementById("s-" + t0) ? t0 : "status");
    $("#foot").textContent = `${name} · ${when}`;
    let cur = null; try { cur = localStorage.getItem("tl.cur"); } catch (e) {}
    pick(chars, chars.some(c => String(c.slot) === cur) ? +cur : chars[0].slot); // keep the character you were looking at (same as the map)
  }
  function pick(chars, slot) {
    const c = chars.find(x => x.slot == slot); if (!c) return;
    $("#charSel").value = slot; try { localStorage.setItem("tl.cur", String(slot)); } catch (e) {}
    for (const b of document.querySelectorAll("#chars [data-slot]")) b.setAttribute("aria-pressed", b.dataset.slot == slot);
    group = "Armas"; limit = 250; $("#q").value = ""; chips();
    renderChar(c);
    cloudSync(c);
    if (TAB === "advice") renderAdvice(c);
  }

  function loadFile(file) {
    $("#msg").textContent = "Leyendo " + file.name + "…";
    file.arrayBuffer().then(buf => {
      const save = ERSave.parse(buf);
      prep(save);
      Cloud.pushCharacters(save.chars).then(r => { if (r && !r.error) { note("Resumen de personajes guardado en tu cuenta."); DIARY.cache = {}; if (CUR) renderDiary(CUR); } else if (r && r.error) note("No se pudo guardar el resumen en tu cuenta: " + r.error); });
      const when = new Date().toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });
      showSave(save, file.name, when);
      try { localStorage.setItem("tl.last", JSON.stringify({ name: file.name, when, chars: save.chars.map(slim) })); } catch (e) {}
    }).catch(e => { $("#msg").innerHTML = `<span class="err">${esc(e.message || e)}</span>`; });
  }
  function slim(c) { if (c.error) return c; const o = Object.assign({}, c); delete o.gaMap; delete o.inventory; delete o.storage; delete o.equipHandles; delete o.equipIndex; delete o.equipIds; delete o.weapons; delete o.missing; delete o.eventFlags; return o; }

  $("#file").addEventListener("change", e => { if (e.target.files[0]) loadFile(e.target.files[0]); });

  const drop = $("#drop");
  drop.addEventListener("dragover", e => { e.preventDefault(); });
  drop.addEventListener("drop", e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) loadFile(f); });

  // ---- advisor tab -----------------------------------------------------------
  function md(src) { // headings, lists, bold/italic, paragraphs — enough for the report
    const inline = t => esc(t).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<em>$2</em>").replace(/`(.+?)`/g, "<code>$1</code>");
    const out = []; let list = null;
    const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
    for (const raw of src.split(/\r?\n/)) {
      const l = raw.trim(); if (!l) { close(); continue; }
      let m;
      if ((m = l.match(/^(#{1,4})\s+(.*)$/))) { close(); out.push(`<h2>${inline(m[2])}</h2>`); }
      else if ((m = l.match(/^[-*•]\s+(.*)$/))) { if (list !== "ul") { close(); out.push("<ul>"); list = "ul"; } out.push(`<li>${inline(m[1])}</li>`); }
      else if ((m = l.match(/^\d+[.)]\s+(.*)$/))) { if (list !== "ol") { close(); out.push("<ol>"); list = "ol"; } out.push(`<li>${inline(m[1])}</li>`); }
      else { close(); out.push(`<p>${inline(l)}</p>`); }
    }
    close(); return out.join("");
  }
  const ADV = { busy: false, err: null, linker: null };
  // Turn known place / boss / grace names inside the report into links to the map (longest names first).
  async function reportLinker() {
    if (ADV.linker) return ADV.linker;
    // name → map target: places, bosses and graces by their own name; items by the place where the map puts them
    const target = new Map();
    try { const P = await fetch("data/places.json").then(r => r.json());
      for (const p of P.places) target.set(p.name, { focus: p.name });
      for (const [id, idxs] of Object.entries(P.items || {})) { const e = DB.items[id], pl = P.places[idxs[0]]; if (e && pl && !target.has(e.n)) target.set(e.n, { focus: pl.name, q: e.n }); }
    } catch (e) {}
    for (const b of FLAGS.bosses) if (!target.has(b.name)) target.set(b.name, { focus: b.name });
    for (const g of FLAGS.graces) if (!target.has(g.name)) target.set(g.name, { focus: g.name });
    const uniq = [...target.keys()].filter(n => n.length > 3).sort((a, b) => b.length - a.length);
    const re = new RegExp("(?<![\\w'])(" + uniq.map(n => esc(n).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")(?![\\w'])", "g");
    return ADV.linker = html => html.replace(re, m => { const t = target.get(m.replace(/&amp;/g, "&")); if (!t) return m; return `<a class="ml" href="map.html#focus=${encodeURIComponent(t.focus)}${t.q ? "&q=" + encodeURIComponent(t.q) : ""}" title="Ver en el mapa">${m}</a>`; });
  }
  const ERR_ES = { "summary too old: open the save again while logged in": "el resumen guardado es de una versión anterior; vuelve a abrir el .sl2 con la sesión iniciada.", "advisor not configured (ANTHROPIC_API_KEY)": "falta la clave de la API en el servidor.", "daily cap reached": "has llegado al máximo diario.", "unknown character; open the save while logged in first": "este personaje no está en tu cuenta todavía; abre el .sl2 con la sesión iniciada." };
  async function renderAdvice(c) {
    const el = $("#advice"); if (!el) return;
    if (!Cloud.user()) { el.innerHTML = `<div class="pane frame"><p class="help">Entra con Steam (botón de cuenta, arriba) y abre tu .sl2 una vez: el consejero trabaja sobre el resumen del personaje guardado en tu cuenta.</p><button class="btn primary" id="advLogin">Entrar con Steam</button></div>`; $("#advLogin").onclick = () => Cloud.login(); return; }
    el.innerHTML = `<p class="help">Cargando…</p>`;
    const r = await Cloud.advice(Marks.charKey(c)); if (CUR !== c) return;
    if (r.error) { el.innerHTML = `<div class="pane frame"><p class="help">${esc(r.status === 404 ? "Este personaje aún no está en tu cuenta: vuelve a abrir el .sl2 con la sesión iniciada." : r.error)}</p></div>`; return; }
    const when = r.advice ? new Date(r.advice.created_at.replace(" ", "T") + "Z").toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" }) : null;
    const canRefresh = r.configured && !ADV.busy && (Cloud.isAdmin() || (r.cooldown === 0 && r.used < r.cap));
    const why = !r.configured ? "El consejero no está configurado en el servidor (falta la clave de la API)." : r.cooldown > 0 && !Cloud.isAdmin() ? `Podrás pedir otro informe en ${Math.ceil(r.cooldown / 3600)} h.` : r.used >= r.cap && !Cloud.isAdmin() ? "Has llegado al máximo diario de informes." : r.stale && r.advice ? "Has abierto una partida más reciente que la de este informe." : "";
    el.innerHTML = `<div class="advh"><span class="help">${r.advice ? `Generado el ${when}${r.stale ? " · desactualizado" : ""}` : "Todavía no hay informe para este personaje."} · ${r.used}/${r.cap} hoy</span><button class="btn primary" id="advRefresh" ${canRefresh ? "" : "disabled"}>${ADV.busy ? "Generando…" : r.advice ? "Actualizar" : "Generar informe"}</button></div>
      ${why ? `<p class="help">${esc(why)}</p>` : ""}
      ${ADV.err ? `<p class="err">No se pudo generar el informe: ${esc(ADV.err)}</p>` : ""}
      ${r.advice ? `<div class="pane frame md">${md(r.advice.text)}</div>` : ""}`;
    if (r.advice) { const link = await reportLinker(); const box = el.querySelector(".md"); if (box && CUR === c) { for (const n of [...box.querySelectorAll("h2, p, li")]) { if (!n.querySelector("a")) n.innerHTML = link(n.innerHTML); } } }
    $("#advRefresh").onclick = async () => {
      ADV.busy = true; const btn = $("#advRefresh"); btn.disabled = true; btn.textContent = "Generando…";
      const st = document.createElement("p"); st.className = "help"; st.id = "advStatus"; st.textContent = "Pidiendo el informe a Claude (suele tardar entre 15 y 40 segundos)…"; el.insertBefore(st, el.children[1] || null);
      // make sure the account has the current summary (also works from the copy this browser kept) before asking for the report
      let x = null;
      if (SAVE && SAVE.chars) { st.textContent = "Guardando el resumen del personaje en tu cuenta…"; const p = await Cloud.pushCharacters(SAVE.chars).catch(e => ({ error: String(e && e.message || e) })); if (p && p.error) x = { error: "no se pudo guardar el resumen (" + p.error + ")" }; else if (p && p.skipped && !p.count) x = { error: "este personaje pertenece a otra cuenta de Steam" }; }
      if (!x) { st.textContent = "Pidiendo el informe a Claude (suele tardar entre 15 y 40 segundos)…"; const t0 = Date.now(); try { x = await Cloud.adviceRefresh(Marks.charKey(c), o => { const sec = Math.round((Date.now() - t0) / 1000); st.textContent = o.progress ? `Claude está escribiendo el informe… (${sec} s)` : `Claude está pensando… (${sec} s)`; }); } catch (e) { x = { error: String(e && e.message || e) }; } }
      ADV.busy = false;
      if (x && x.error) { ADV.err = ERR_ES[x.error] || x.error; } else ADV.err = null;
      renderAdvice(c);
    };
  }

  // ---- account (optional) ---------------------------------------------------
  function note(t) { const m = $("#msg"); if (!m.textContent) { m.textContent = t; setTimeout(() => { if (m.textContent === t) m.textContent = ""; }, 4000); } }
  function cloudMark(ck, k, id, on) { if (!Cloud.user()) return; (on ? Cloud.syncMarks(ck) : Cloud.removeMark(ck, k, id)).then(r => { if (r && r.error) note("No se pudo sincronizar la marca: " + r.error); }); }
  let synced = new Set();
  function cloudSync(c) {
    if (!Cloud.user() || !c) return; const ck = Marks.charKey(c); if (synced.has(ck)) return; synced.add(ck);
    const before = Marks.all(ck).length;
    Cloud.syncMarks(ck).then(r => { if (r && !r.error && Marks.all(ck).length !== before && CUR === c) renderProgress(c); });
  }
  function renderAcct() {
    const b = $("#acct"); if (!b) return; const u = Cloud.user();
    b.hidden = !Cloud.available();
    if (u) { b.className = "btn acct"; b.innerHTML = `${u.avatar ? `<img src="${esc(u.avatar)}" alt="">` : ""}<span>${esc(u.name || "Steam")}</span>`; }
    else { b.className = "btn acct out"; b.textContent = "Entrar"; }
  }
  function sheet(html) { let s = $("#sheet"); if (!s) { s = document.createElement("div"); s.id = "sheet"; s.className = "sheet frame"; document.body.appendChild(s); } s.innerHTML = html + `<div style="text-align:right;margin-top:10px"><button class="btn" id="sheetClose">Cerrar</button></div>`; s.hidden = false; $("#sheetClose").onclick = () => { s.hidden = true; }; return s; }
  async function openAcct() {
    const u = Cloud.user();
    if (!u) {
      sheet(`<h3>Cuenta</h3><p class="help">Entra con Steam para guardar tus marcas manuales y el resumen de tus personajes en tu cuenta, y para proponer marcadores al mapa de la comunidad. Solo usamos tu identidad pública de Steam (nombre y avatar); nunca pedimos contraseña ni accedemos a tu partida.</p><p class="help">La partida (.sl2) no se sube: todo se lee en este navegador y solo se guarda un resumen (nivel, equipo, progreso).</p><button class="btn primary" id="doLogin">Entrar con Steam</button>`);
      $("#doLogin").onclick = () => Cloud.login(); return;
    }
    const s = sheet(`<h3>Cuenta</h3><div class="row"><div class="n">${u.avatar ? `<img src="${esc(u.avatar)}" alt="" style="width:28px;height:28px;vertical-align:middle;margin-right:8px">` : ""}<b>${esc(u.name || "")}</b> <span class="help">· ${u.role === "admin" ? "moderador" : "jugador"}</span></div><button class="btn" id="doLogout">Salir</button></div>
      <div class="row"><div class="n">Marcas de este personaje${CUR ? ` (${Marks.all(Marks.charKey(CUR)).length})` : ""}</div><button class="btn" id="doSync" ${CUR ? "" : "disabled"}>Sincronizar ahora</button></div>
      <div class="row"><div class="n">Resumen de personajes de la partida abierta</div><button class="btn" id="doPush" ${SAVE ? "" : "disabled"}>Guardar en la cuenta</button></div>
      ${Cloud.isAdmin() ? `<h3 style="margin-top:14px">Moderación</h3><div id="modq" class="help">Cargando propuestas…</div>` : ""}`);
    $("#doLogout").onclick = async () => { await Cloud.logout(); synced = new Set(); renderAcct(); s.hidden = true; };
    $("#doSync").onclick = async () => { if (!CUR) return; synced.delete(Marks.charKey(CUR)); const r = await Cloud.syncMarks(Marks.charKey(CUR)); synced.add(Marks.charKey(CUR)); renderProgress(CUR); note(r && r.error ? "Error: " + r.error : "Marcas sincronizadas."); s.hidden = true; };
    $("#doPush").onclick = async () => { if (!SAVE) return; const r = await Cloud.pushCharacters(SAVE.chars); note(r && r.error ? "Error: " + r.error : "Resumen guardado."); s.hidden = true; };
    if (Cloud.isAdmin()) renderModQueue();
  }
  async function renderModQueue() {
    const q = $("#modq"); if (!q) return; const list = await Cloud.pending();
    q.innerHTML = list.length ? list.map(m => `<div class="row"><div class="n"><b>${esc(m.item || m.kind || "marcador")}</b> <span class="help">· ${esc(m.layer)} (${Math.round(m.x)}, ${Math.round(m.y)}) · ${esc(m.by || m.author)}</span>${m.note ? `<div class="help">${esc(m.note)}</div>` : ""}</div><button class="btn" data-rev="approve|${m.id}">✓</button><button class="btn" data-rev="reject|${m.id}">✗</button></div>`).join("") : "No hay propuestas pendientes.";
    q.onclick = async e => { const b = e.target.closest("[data-rev]"); if (!b) return; const [a, id] = b.dataset.rev.split("|"); b.disabled = true; await Cloud.review(+id, a); renderModQueue(); };
  }
  $("#acct").addEventListener("click", openAcct);
  Cloud.init().then(() => { renderAcct(); if (CUR) { cloudSync(CUR); renderDiary(CUR); } if (CUR && TAB === "advice") renderAdvice(CUR); if (location.hash === "#status" && Cloud.user() && history.replaceState) { /* back from Steam login */ note("Sesión iniciada con Steam."); } });

  // last file, if this browser kept it
  iconsLoad().then(() => { if (CUR) renderChar(CUR); });
  try {
    const last = JSON.parse(localStorage.getItem("tl.last") || "null");
    if (last && last.chars && last.chars.length) {
      for (const c of last.chars) if (!c.error) c.all = c.enriched.inventory.concat(c.enriched.keyItems, c.enriched.storage, c.enriched.storageKeys).filter(real);
      showSave({ chars: last.chars }, last.name, last.when);
      $("#foot").textContent = `${last.name} · ${last.when} · última partida abierta en este navegador; usa "Abrir otro .sl2" para actualizar`;
    }
  } catch (e) {}
}

Promise.all([fetch("data/items.json").then(r => r.json()), fetch("data/flags.json").then(r => r.json()), fetch("data/reqs.json").then(r => r.ok ? r.json() : null).catch(() => null)]).then(([db, fl, rq]) => main(db, fl, rq)).catch(e => { document.getElementById("msg").textContent = "No se pudo cargar la base de datos de objetos: " + e.message; });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
