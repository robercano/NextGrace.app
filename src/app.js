/*
 * app.js — Next Grace UI (the character sheet: index.html). Plain script, no bundler.
 *
 * main(DB, FLAGS, REQS) is called from index.html once data/items.json, data/flags.json and data/reqs.json are loaded.
 * Globals it relies on (loaded before it): ERSave (src/ersave.js, save parser), Rules (src/rules.js, game rules),
 * Icons (src/icons.js), T/I18N (src/i18n.js), GLOSSARY (src/glossary.js), Marks (src/marks.js), Cloud (src/cloud.js).
 *
 * Sections, in order (search for "// ----"):
 *   state & helpers · icons · catalogue (what "No tengo" compares against) · tabs · glossary tips · requirement tags
 *   Status tab: renderChar → renderUnused, renderPlanner, renderEquip, renderProgress, renderForge, renderInv
 *   Equipment tab (renderEquip) · Smithing tab (renderForge, planUpdate, renderSpirits) · Progress tab (renderProgress, renderDiary)
 *   Inventory tab (renderInv, chips) · loading a save (prep, showSave, pick, loadFile) · Advisor tab · account sheet · start-up
 *
 * Conventions: every user-visible string is Spanish wrapped in T() (English in src/i18n.js); HTML is built with template
 * strings and esc() for any value that comes from the save; CUR is the character on screen, SAVE the parsed file.
 */
async function main(DB, FLAGS, REQS){
  // ---- state & helpers ---------------------------------------------------------
  const $ = s => document.querySelector(s);
  I18N.apply();
  const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  let SAVE = null, CUR = null, FILENAME = "";
  const WIKI = "https://eldenring.wiki.gg/wiki/";
  const R = Rules.create(DB, REQS); // game rules (requirements, loads, costs…): see src/rules.js
  const GR_ID = { 9800: 1073742015 }; // goods id of the rune each Great Rune flag stands for (191 = Godrick's …), for the picture and the wiki link
  const { wikiName, baseKey, weightOf, canUse, statBonuses, effStats, stoneCounts, costRange, levelCost, spiritInfo, gloveName, RUNE_VALUE, real } = R;
  const SOFT = R.SOFT_CAPS;
  const link = (i, text) => `<a class="wl" href="${WIKI}${encodeURIComponent(wikiName(i).replace(/ /g, "_"))}" target="_blank" rel="noopener">${text}</a>`;

  // ---- icons (src/icons.js) -----------------------------------------------------
  const ic = i => Icons.img(i), iconUrl = i => Icons.find(i);
  $("#icons").addEventListener("change", e => {
    if (!e.target.files.length) return;
    Icons.import(Array.from(e.target.files)).then(n => { $("#iconsMsg").textContent = T("{0} iconos guardados en este navegador.", n); if (CUR) renderChar(CUR); })
      .catch(err => { $("#iconsMsg").textContent = err.code === "zip" ? T("No se pudo cargar el lector de zip; sube las imágenes sueltas.") : err.code === "idb" ? T("Este navegador no permite guardar los iconos.") : T("Error al importar: {0}", err.message); });
  });


  // ---- catalogue & names ------------------------------------------------------
  // weapon / item classes as the Spanish version of the game names them
  const SUB_ES = { Arrows: "Flechas", Bolts: "Virotes", Greatarrows: "Flechas grandes", Greatbolts: "Virotes grandes", "Flask Enhancers": "Mejoras de frasco", "Ghost Glovewort": "Glovewort fantasma", "Grave Glovewort": "Glovewort sepulcral", "Shadow Realm Blessings": "Bendiciones del Reino de las Sombras", "Smithing Stones": "Piedras de forja", Somberstones: "Piedras sombrías", "World Maps": "Mapas",
    Axes: "Hachas", "Backhand Blades": "Hojas de revés", "Beast Claws": "Garras de bestia", Claws: "Garras", "Colossal Swords": "Espadas colosales", "Colossal Weapons": "Armas colosales", "Curved Greatswords": "Espadones curvos", "Curved Swords": "Espadas curvas", Daggers: "Dagas", Fists: "Puños", Flails: "Manguales", "Great Hammers": "Martillos grandes", "Great Katanas": "Katanas grandes", "Great Spears": "Lanzas grandes", Greataxes: "Hachas grandes", Greatswords: "Espadones", Halberds: "Alabardas", Hammers: "Martillos", "Hand-to-Hand": "Cuerpo a cuerpo", "Heavy Thrusting Swords": "Estoques pesados", Katanas: "Katanas", "Light Greatswords": "Espadones ligeros", "Perfume Bottles": "Frascos de perfume", Reapers: "Guadañas", Spears: "Lanzas", "Straight Swords": "Espadas rectas", "Throwing Blades": "Hojas arrojadizas", "Thrusting Swords": "Estoques", Twinblades: "Hojas dobles", Whips: "Látigos",
    Ballistas: "Balistas", Bows: "Arcos", Crossbows: "Ballestas", "Glintstone Staffs": "Bastones de glintstone", Greatbows: "Arcos grandes", "Light Bows": "Arcos ligeros", "Sacred Seals": "Sellos sagrados", Greatshields: "Escudos grandes", "Medium Shields": "Escudos medianos", "Small Shields": "Escudos pequeños", "Thrusting Shields": "Escudos de estocada", Torches: "Antorchas",
    Consumables: "Consumibles", Flasks: "Frascos", "Golden Runes": "Runas doradas", Grease: "Grasas", "Miscellaneous Tools": "Herramientas varias", "Multiplayer Items": "Objetos multijugador", "Perfume Arts": "Artes de perfume", Remembrances: "Remembranzas", "Reusable Tools": "Herramientas reutilizables", Throwables: "Arrojadizos", "Throwing Pots": "Vasijas arrojadizas" };
  const subEs = s => s ? (I18N.lang === "en" ? s : (SUB_ES[s] || s)) : s;
  const CAT_ES0 = { melee_armaments: "Armas", ranged_and_catalysts: "Arcos y catalizadores", shields: "Escudos", arrows_and_bolts: "Munición", head: "Cascos", chest: "Pechos", arms: "Brazos", legs: "Piernas", talismans: "Talismanes", ashes_of_war: "Cenizas de guerra", ashes: "Cenizas espirituales", sorceries: "Hechicerías", incantations: "Encantamientos", tools: "Herramientas", key_items: "Objetos clave", crafting_materials: "Materiales", bolstering_materials: "Mejora", info: "Información", gestures: "Gestos" };
  const CAT_ES = new Proxy(CAT_ES0, { get: (o, k) => typeof k === "string" && o[k] ? T(o[k]) : o[k] });
  const GROUPS = [["Todo", null], ["Armas", ["melee_armaments", "ranged_and_catalysts", "shields", "arrows_and_bolts"]], ["Armadura", ["head", "chest", "arms", "legs"]], ["Talismanes", ["talismans"]], ["Cenizas", ["ashes_of_war", "ashes"]], ["Magia", ["sorceries", "incantations"]], ["Consumibles", ["tools", "crafting_materials", "bolstering_materials"]], ["Clave", ["key_items", "info", "gestures"]]];
  let group = "Armas", limit = 250, mode = "have", useFilter = "all";
  // Catálogo de coleccionables para "No tengo"
  const CATALOG_CATS = new Set(["melee_armaments", "ranged_and_catalysts", "shields", "head", "chest", "arms", "legs", "talismans", "ashes_of_war", "ashes", "sorceries", "incantations", "key_items"]);
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

  // ---- tabs ----------------------------------------------------------------
  let TAB = "status";
  function showTab(t) { TAB = t; for (const b of document.querySelectorAll(".tab")) b.setAttribute("aria-selected", b.dataset.t === t); for (const s of document.querySelectorAll(".screen")) s.setAttribute("aria-hidden", s.id !== "s-" + t); try { localStorage.setItem("tl.tab", t); } catch (e) {} if (location.hash !== "#" + t) history.replaceState(null, "", "#" + t); }
  // shared header (src/shell.js): account button → account sheet, drawer → pick(); the sheet sets its own tabs below it
  Shell.mount({ current: "sheet", openFile: true, onPick: slot => { if (SAVE) pick(SAVE.chars.filter(c => !c.error), slot); }, onAccount: openAcct });
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
    tip = document.createElement("div"); tip.className = "tip"; tip.innerHTML = `${row.dataset.extra ? `<div style="color:#e08a3c;margin-bottom:4px">${esc(row.dataset.extra)}</div>` : ""}${esc(I18N.lang === "en" && g.en ? g.en : g.es)} ${wlink(g.w, T("Ver en la wiki ↗"))}`; row.appendChild(tip); row.classList.add("open");
  });

  // ---- requirement tags (data from src/rules.js canUse) ------------------------
  const STAT_SHORT0 = { str: "FUE", dex: "DES", int: "INT", fai: "FE", arc: "ARC" }; const STAT_SHORT = new Proxy(STAT_SHORT0, { get: (o, k) => o[k] ? T(o[k]) : o[k] });
  self.TL_USE = (c, it) => canUse(c, it); // used by cloud.js when building the account summary
  const useCls = u => !u ? "" : u.boosted ? " boost" : u.ok ? "" : u.twoHand ? " use2h" : " nope";
  const useTag = u => !u ? "" : u.boosted ? `<span class="tag boost">${T("con {0}", esc(u.via.join(" + ")))}${u.twoHand ? T(", a dos manos") : ""}</span>` : u.ok ? "" : u.twoHand ? `<span class="tag use2h">${T("a dos manos")}</span>` : `<span class="tag nope">${T("faltan {0}", u.missing.map(m => `${STAT_SHORT[m.k]} ${m.need - m.have}`).join(", "))}</span>`;
  const useMeta = u => !u ? "" : u.boosted ? T("solo gracias a {0}{1}: tus atributos base no llegan", u.via.join(I18N.lang === "en" ? " and " : " y "), u.twoHand ? T(" (y a dos manos)") : "") : u.ok ? "" : u.twoHand ? T("solo a dos manos") : T("no cumples: {0}", u.missing.map(m => T("{0} {1} (tienes {2})", STAT_SHORT[m.k], m.need, m.have)).join(", "));
  // one line each: requirements, scaling, (spells) FP and memory slots
  const reqLine = u => { if (!u) return ""; const req = Object.entries(u.req).filter(([, v]) => v).map(([k, v]) => `${STAT_SHORT[k]} ${v}`).join(" · "); const sc = u.scale ? Object.entries(u.scale).map(([k, v]) => `${STAT_SHORT[k]} ${v}`).join(" · ") : "";
    const lines = [req ? T("Requisitos: {0}", req) : T("Sin requisitos")]; if (sc) lines.push(T("Escalado: {0}", sc)); if (u.info.fp != null || u.info.slots) lines.push([u.info.fp != null ? "FP " + u.info.fp : null, u.info.slots ? T("huecos {0}", u.info.slots) : null].filter(Boolean).join(" · ")); return lines.join("\n"); };
  function renderChar(c) {
    CUR = c;
    $("#cName").textContent = c.name || ("Slot " + (c.slot + 1));
    $("#cLevel").textContent = c.level;
    $("#cRunes").textContent = c.runes.toLocaleString(I18N.locale());
    const ng = c.clearCount ? "NG+" + c.clearCount : "NG";
    $("#cSub").textContent = `${c.className} · ${ng} · ${ERSave.fmtTime(c.playtimeSec)} · ${T("{0} muertes", c.deaths)}`;
    const gauge = (label, v, max, color, g) => `<div class="bar g" data-g="${g}"><span>${label}</span><i><b style="width:${max ? Math.min(100, 100 * v / max) : 0}%;background:${color}"></b></i><span class="num">${v} / ${max}</span></div>`;
    $("#gauges").innerHTML = gauge("HP", c.hp, c.maxHp, "var(--hp)", "hp") + gauge("FP", c.fp, c.maxFp, "var(--fp)", "fp") + gauge("SP", c.sp, c.maxSp, "var(--sp)", "sp");
    const S = c.stats, names = STAT_ES;
    const BN = statBonuses(c);
    // like the game's status screen: the effective total, tinted when equipment raises it; the breakdown shows when the row is expanded
    $("#stats").innerHTML = Object.keys(names).map(k => { const b = BN[k] ? BN[k].reduce((a, x) => a + x.v, 0) : 0;
      return kvr(svg(k) + names[k], b ? `<span class="bonus" title="${T("Base {0} + {1}", S[k], b)}">${S[k] + b}</span>` : S[k], null, k, b ? T("Base {0} · {1}", S[k], BN[k].map(x => "+" + x.v + " " + x.src).join(" · ")) : null); }).join("");
    const gr = c.enriched.equipped.greatRune;
    $("#kv").innerHTML = kvr(T("Nivel"), c.level, null, "level") + kvr(T("Clase"), wlink(c.className, esc(c.className)), null, "class") + kvr(T("Regalo"), c.gift ? wlink(c.giftName, esc(c.giftName)) : T("ninguno"), null, "gift") + kvr(T("Runas totales"), c.totalRunes.toLocaleString(I18N.locale()), null, "runes") + kvr(T("Muertes"), c.deaths, null, "deaths") + kvr(T("Ciclo"), ng, null, "ng") + kvr(T("Nivel de arma (matchmaking)"), "+" + c.matchmakingWpnLvl, null, "mmlvl") + kvr(T("Runa mayor equipada"), gr ? wlink(gr.name, esc(gr.name)) : T("ninguna"), null, "greatrune") + kvr(T("Runa mayor activa (Arco de Runa)"), c.greatRuneActive ? T("sí") : T("no"), null, "runearc") + kvr(T("Huecos de talismán"), 1 + c.talismanSlots, null, "talismans");
    const B = c.buildups;
    $("#resist").innerHTML = kvr(T("Veneno"), B.poison, null, "poison") + kvr(T("Putrefacción"), B.rot, null, "rot") + kvr(T("Hemorragia"), B.bleed, null, "bleed") + kvr(T("Congelación"), B.frost, null, "frost") + kvr(T("Sueño"), B.sleep, null, "sleep") + kvr(T("Locura"), B.madness, null, "madness") + kvr(T("Muerte"), B.deathblight, null, "deathblight");
    const E = c.enriched.equipped;
    const { load, max: maxLoad, ratio, roll: rollK } = R.equipLoad(c);
    const ROLL = { light: [T("Carga ligera"), "#7fc8ff"], medium: [T("Carga media"), "var(--fg)"], heavy: [T("Carga pesada"), "#e0b23c"], over: [T("Sobrecargado"), "var(--bad)"] }; // the game's colours
    $("#misc").innerHTML = kvr(T("Carga de equipo"), `${load.toFixed(1)} / ${maxLoad.toFixed(1)}`, `<span style="color:${ROLL[rollK][1]};font-weight:600">${ROLL[rollK][0]}</span> · ${Math.round(ratio * 100)} % ${T("(aprox.)")}`, "load") + kvr(T("Frasco carmesí"), c.crimsonFlasks, null, "crimson") + kvr(T("Frasco cerúleo"), c.ceruleanFlasks, null, "cerulean") + kvr(T("Hechizos memorizados"), c.enriched.spells.length, null, "spells");

    renderUnused(c);
    PLAN.add = {}; renderPlanner(c);
    renderEquip(c);
    renderProgress(c);
    renderForge(c);
    renderInv();
  }

  // ---- level planner ---------------------------------------------------------
  const STAT_ES0 = { vigor: "Vigor", mind: "Mente", endurance: "Resistencia", strength: "Fuerza", dexterity: "Destreza", intelligence: "Inteligencia", faith: "Fe", arcane: "Arcano" };
  const STAT_ES = new Proxy(STAT_ES0, { get: (o, k) => typeof k === "string" && o[k] ? T(o[k]) : o[k], ownKeys: o => Reflect.ownKeys(o), getOwnPropertyDescriptor: (o, k) => Reflect.getOwnPropertyDescriptor(o, k) });
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
      return `<div class="pr"><span>${svg(k)}${STAT_ES[k]}<span class="help" style="margin-left:6px">${T("cap {0}/{1}", s1, s2)}</span></span><span class="cur" title="${bn ? T("base; con bonus {0}", S[k] + bn) : ""}">${S[k]}${bn ? `<small class="help"> (${S[k] + bn})</small>` : ""}</span><span class="new ${cls}" title="${v >= s2 ? T("por encima del segundo soft cap: rinde muy poco") : v >= s1 ? T("por encima del primer soft cap: rinde menos") : ""}">${v}</span><span class="pm"><button data-pl-stat="${k}" data-d="-1" ${add[k] ? "" : "disabled"}>−</button><button data-pl-stat="${k}" data-d="1" ${v >= 99 ? "disabled" : ""}>+</button></span></div>`; };
    box.className = "planner";
    box.innerHTML = Object.keys(STAT_ES).map(row).join("") + `<div class="sum">
      <span>${T("Nivel")}</span><span><b>${c.level}</b> → <b>${nextLv}</b> (+${n})</span>
      <span>${T("Coste en runas")}</span><span><b>${cost.toLocaleString(I18N.locale())}</b></span>
      <span>${T("Runas disponibles")}${pocket ? T(" (incl. {0} en objetos)", pocket.toLocaleString(I18N.locale())) : ""}</span><span><b>${avail.toLocaleString(I18N.locale())}</b></span>
      <span>${left >= 0 ? T("Te sobrarían") : T("Te faltarían")}</span><span class="${left < 0 ? "neg" : ""}"><b>${Math.abs(left).toLocaleString(I18N.locale())}</b></span>
      <span>${T("Con lo que tienes puedes subir")}</span><span>${T("{0} nivel{1} (hasta {2})", `<b>${affordable}</b>`, affordable === 1 ? "" : T("es"), c.level + affordable)}</span></div>
      <div style="display:flex;gap:8px;margin-top:8px"><button class="btn" id="planReset">${T("Reiniciar")}</button><button class="btn" id="planFill" title="${T("Reparte los niveles que puedes pagar en los atributos que ya has tocado, o en Vigor si no has tocado ninguno")}">${T("Gastar lo disponible")}</button></div>
      <p class="help" style="margin-top:6px">${T("Soft caps: a partir del primero cada punto rinde menos; a partir del segundo, casi nada. El coste por nivel es el del juego (crece con el nivel, no con el atributo). Se planifica sobre el valor base; entre paréntesis, el efectivo con tu equipo.")}</p>`;
    $("#planReset").onclick = () => { PLAN.add = {}; renderPlanner(c); };
    $("#planFill").onclick = () => { const keys = Object.keys(add).filter(k => add[k] > 0); const target = keys.length ? keys : ["vigor"]; let i = 0; while (Object.values(PLAN.add).reduce((a, b) => a + b, 0) < affordable) { const k = target[i++ % target.length]; if (S[k] + (PLAN.add[k] || 0) >= 99) { if (target.every(t => S[t] + (PLAN.add[t] || 0) >= 99)) break; continue; } PLAN.add[k] = (PLAN.add[k] || 0) + 1; } renderPlanner(c); };
  }
  document.addEventListener("click", e => {
    if (e.target.id === "planBtn" && CUR) { PLAN.open = !PLAN.open; renderPlanner(CUR); return; }
    const b = e.target.closest("[data-pl-stat]"); if (b && CUR) { const k = b.dataset.plStat, d = +b.dataset.d; PLAN.add[k] = Math.max(0, (PLAN.add[k] || 0) + d); if (!PLAN.add[k]) delete PLAN.add[k]; renderPlanner(CUR); }
  });

  // ---- spirit ashes (Roderika) -------------------------------------------------
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
      const status = a.level >= 10 ? `<span class="tag max">${T("máx")}</span>` : reach > a.level ? `<span class="tag" style="color:var(--ok);border-color:var(--ok)">${T("puedes subir a +{0}", reach)}</span>` : "";
      const miss = a.level < 10 && next ? `<div class="m">${T("para +{0} falta {1}", reach > a.level ? reach + 1 : a.level + 1, link({ name: next, kind: "goods" }, esc(next)))}</div>` : "";
      return `<div class="row"><div class="n">${ic(a.it)}${link({ name: a.base, kind: "goods" }, esc(a.base))} <b>+${a.level}</b>${status}</div><div class="q">${a.ghost ? "Ghost" : "Grave"}</div>${miss}</div>`;
    }).join("") || `<p class="help">${T("Sin cenizas de espíritu.")}</p>`;
  }

  // ---- unused upgrades / deliverables ---------------------------------------
  function renderUnused(c) {
    const pane = $("#unusedPane"), el = $("#unused"); if (!pane) return;
    const qty = name => c.all.filter(i => i.name === name).reduce((a, i) => a + (i.qty || 1), 0);
    const list = pred => { const m = new Map(); for (const i of c.all) if (pred(i.name)) m.set(i.name, (m.get(i.name) || 0) + (i.qty || 1)); return [...m]; };
    const row = (label, items, g, how) => items.length ? kvr(label, items.reduce((a, x) => a + x[1], 0), items.map(([n, q]) => `${link({ name: n, kind: "goods" }, esc(n))}${q > 1 ? " ×" + q : ""}`).join(" · ") + (how ? `<div class="help" style="margin-top:2px">${how}</div>` : ""), g) : "";
    const rows = [];
    const grace = [["Golden Seed", qty("Golden Seed")], ["Sacred Tear", qty("Sacred Tear")], ["Scadutree Fragment", qty("Scadutree Fragment")], ["Revered Spirit Ash", qty("Revered Spirit Ash")]].filter(x => x[1] > 0);
    const maxed = (c.crimsonFlasks + c.ceruleanFlasks) >= 14;
    rows.push(row(T("En un lugar de gracia"), grace, "unused_grace", T("Se aplican desde el menú de la gracia: más cargas y curación de los frascos; en la expansión, la bendición del Scadutree y de las cenizas.") + (maxed && qty("Golden Seed") ? T(" Ya tienes las 14 cargas máximas: las semillas sobrantes no se pueden usar.") : "")));
    const runes = list(n => RUNE_VALUE[n]).sort((x, y) => RUNE_VALUE[y[0]] - RUNE_VALUE[x[0]]); const total = runes.reduce((a, [n, q]) => a + RUNE_VALUE[n] * q, 0);
    rows.push(row(T("Runas sin consumir"), runes, "unused_runes", total ? T("Valen {0} runas en total; úsalas cuando vayas a subir de nivel o comprar.", total.toLocaleString(I18N.locale())) : ""));
    rows.push(row(T("Remembranzas"), list(n => /^Remembrance of /.test(n)), "unused_rem", T("Enia (Mesa Redonda) las cambia por el arma o hechizo del jefe; también se pueden consumir por runas.")));
    rows.push(row(T("Entregar a un PNJ"), list(n => /Prayerbook$|Scroll$/.test(n) || n === "Deathroot" || n === "Dragon Heart"), "unused_npc", T("Libros de oración → Corhyn o Miriel; pergaminos → Sellen o Thops; Deathroot → Gurranq; Dragon Heart → altares de Comunión Dragón.")));
    rows.push(row(T("Campanas de vendedor"), list(n => /Bell Bearing/.test(n)), "unused_bell", T("Entrégalas a las Gemelas Vendedoras de la Mesa Redonda para comprar lo que vendía ese mercader (piedras incluidas).")));
    const glove = list(n => /^(Great )?(Grave|Ghost) Glovewort/.test(n));
    rows.push(row(T("Para Roderika (espíritus)"), glove, "unused_glove", T("Mejoran las cenizas de espíritu en la Mesa Redonda.")));
    const dragon = list(n => /Ancient Dragon Smithing Stone$/.test(n));
    rows.push(row(T("Piedras de dragón"), dragon, "unused_dragon", T("Suben un arma al máximo (+25 o +10 sombría). Elige bien: no se compran.")));
    const other = list(n => n === "Larval Tear" || n === "Rune Arc");
    rows.push(row(T("Otros"), other, "unused_other", T("Larval Tear: redistribuir atributos con Rennala. Rune Arc: activa la runa mayor equipada.")));
    const html = rows.join("");
    pane.hidden = !html; el.innerHTML = html || "";
  }

  // ---- equipment screen -----------------------------------------------------
  const EQSEL = { k: null };
  function slot(it, lbl, extra) { const has = it && real(it); const img = has ? iconUrl(it) : null; const u = has ? canUse(CUR, it) : null;
    return `<div class="slot${has ? "" : " empty"}${useCls(u)}" data-item="${has ? esc(JSON.stringify({ n: it.display, w: wikiName(it), d: [subEs(it.sub), it.infusion && it.infusion !== "Standard" ? it.infusion : null, it.aow ? T("Ceniza: {0}", it.aow) : null, weightOf(it) ? T("Peso {0}", weightOf(it)) : null, useMeta(u)].filter(Boolean).join(" · "), r: reqLine(u), i: img || "" })) : ""}" role="button" tabindex="0">${img ? `<img src="${img}" alt="">` : has ? `<span style="font-size:.6rem;text-align:center;padding:4px;color:var(--fg-2)">${esc(it.display)}</span>` : ""}${has && it.kind === "weapon" && it.level ? `<span class="lvl">+${it.level}</span>` : ""}<span class="lbl">${lbl}</span></div>`; }
  function renderEquip(c) {
    const E = c.enriched.equipped;
    $("#eqArms").innerHTML = [0, 1, 2].map(i => slot(E.rh[i], T("Dcha {0}", i + 1))).join("") + [0, 1, 2].map(i => slot(E.lh[i], T("Izq {0}", i + 1))).join("") + slot(E.arrows[0], T("Flecha {0}", 1)) + slot(E.arrows[1], T("Flecha {0}", 2)) + slot(E.bolts[0], T("Virote {0}", 1)) + slot(E.bolts[1], T("Virote {0}", 2));
    $("#eqArmor").innerHTML = slot(E.head, T("Cabeza")) + slot(E.chest, T("Pecho")) + slot(E.arms, T("Brazos")) + slot(E.legs, T("Piernas")) + slot(E.greatRune, T("Runa mayor")) + E.talismans.slice(0, Math.max(1 + (c.talismanSlots || 0), E.talismans.filter(t => t && real(t)).length)).map((t, i) => slot(t, T("Talismán {0}", i + 1))).join(""); // only the slots unlocked (1 + talisman pouches)
    const Q = c.enriched.quick, P = c.enriched.pouch;
    $("#eqQuick").innerHTML = Array.from({ length: Math.max(3, Q.length) }, (_, i) => slot(Q[i], T("Rápido {0}", i + 1))).join("") + Array.from({ length: Math.max(6, P.length) }, (_, i) => slot(P[i], T("Bolsa {0}", i + 1))).join("");
    const Sp = c.enriched.spells, phys = c.physick.map(id => { const e = DB.items[id]; return e ? { id, name: e.n, display: e.n, kind: e.k, cat: e.c, sub: e.s || "" } : null; });
    $("#eqSpells").innerHTML = Sp.map((s, i) => slot(s, T("Hechizo {0}", i + 1))).join("");
    $("#eqPhysick").innerHTML = phys.map((p, i) => slot(p, T("Lágrima {0}", i + 1))).join(""); // the two crystal tears mixed in the Flask of Wondrous Physick
    $("#eqDetail").innerHTML = `<div class="d help">${T("Toca un hueco para ver el objeto.")}</div>`;
  }
  document.addEventListener("click", e => { const s = e.target.closest(".slot[data-item], .cell[data-item]"); if (!s) return; const d = JSON.parse(s.dataset.item); const box = s.classList.contains("slot") ? $("#eqDetail") : $("#invDetail");
    for (const x of s.parentElement.querySelectorAll(".sel")) x.classList.remove("sel"); s.classList.add("sel");
    box.innerHTML = `${d.i ? `<img src="${d.i}" alt="">` : ""}<div><div class="t">${esc(d.n)}</div><div class="d">${esc(d.d || "")}</div>${d.r ? d.r.split("\n").map(l => `<div class="d" style="color:var(--gold-2)">${esc(l)}</div>`).join("") : ""}${d.l ? `<div class="d">${esc(d.l)}</div>` : ""}<a class="wl" href="${WIKI}${encodeURIComponent(d.w.replace(/ /g, "_"))}" target="_blank" rel="noopener">${T("Ver en la wiki")}</a></div>`; });

  // ---- forge ----------------------------------------------------------------
  function renderForge(c) {
    const sc = stoneCounts(c);
    const tile = (n, lbl) => `<div class="${sc[n] ? "" : "zero"}" title="${esc(n)}"><b>${sc[n] || 0}</b><span>${lbl}</span></div>`;
    $("#stonesN").innerHTML = [1,2,3,4,5,6,7,8].map(n => tile("Smithing Stone [" + n + "]", "[" + n + "]")).join("") + tile("Ancient Dragon Smithing Stone", T("Dragón"));
    $("#stonesS").innerHTML = [1,2,3,4,5,6,7,8,9].map(n => tile("Somber Smithing Stone [" + n + "]", "[" + n + "]")).join("") + tile("Somber Ancient Dragon Smithing Stone", T("Dragón"));
    const weapons = c.all.filter(i => i.kind === "weapon" && i.maxLevel > 0 && !["arrows_and_bolts"].includes(i.cat));
    weapons.sort((a, b) => (a.level >= a.maxLevel) - (b.level >= b.maxLevel) || b.level - a.level || a.name.localeCompare(b.name));
    const sel = $("#planWeapon");
    sel.innerHTML = weapons.map((w, i) => `<option value="${i}">${esc(w.display)} ${T("(máx +{0})", w.maxLevel)}</option>`).join("");
    sel.onchange = planUpdate;
    $("#planTo").oninput = () => planUpdate("typing"); $("#planTo").onchange = planUpdate;
    sel.selectedIndex = Math.max(0, weapons.findIndex(w => w.level > 0 && w.level < w.maxLevel));
    c.weapons = weapons; planUpdate(true);
    renderSpirits(c);
    // name + level bar on the first line; usability / ash of war tags below, so long names don't get squeezed
    const wrow = w => { const tags = useTag(canUse(c, w)) + (w.level >= w.maxLevel ? `<span class="tag max">${T("máx")}</span>` : "") + (w.aow ? `<span class="tag">${esc(w.aow)}</span>` : "");
      return `<div class="row click${w.stored ? " stored" : ""}" data-w="${weapons.indexOf(w)}" role="button" tabindex="0"><div class="n">${ic(w)}${link(w, esc(w.display))}</div><div class="q lvq"><span class="lvlbar"><b style="width:${100 * w.level / w.maxLevel}%"></b></span>+${w.level} / ${w.maxLevel}</div>${tags ? `<div class="m tags">${tags}</div>` : ""}</div>`; };
    const pending = weapons.filter(w => w.level > 0 && w.level < w.maxLevel), maxed = weapons.filter(w => w.level >= w.maxLevel);
    $("#upgradeable").innerHTML = (pending.map(wrow).join("") || `<p class="help">${T("Ninguna arma a medias: todo lo que has tocado está al máximo.")}</p>`) + (maxed.length ? `<details><summary>${T("{0} armas al máximo", maxed.length)}</summary><div class="list">${maxed.map(wrow).join("")}</div></details>` : "");
  }

  function markBtn(k, id) { const on = CUR && Marks.has(Marks.charKey(CUR), k, id); return `<button class="btn mk" data-mark="${k}|${id}" aria-pressed="${!!on}" title="${T("Marcar a mano")}">${on ? T("✓ marcado") : T("marcar")}</button>`; }
  function markName(e) { if (e.k === "boss") { const b = FLAGS.bosses.find(x => String(x.id) === e.id); return b ? b.name : e.id; } if (e.k === "grace") { const g = FLAGS.graces.find(x => String(x.id) === e.id); return g ? g.name : e.id; } if (e.k === "item") { const it = DB.items[e.id]; return it ? it.n : e.id; } return e.id; }
  document.addEventListener("click", e => { const b = e.target.closest("[data-mark]"); if (b && CUR) { const [k, id] = b.dataset.mark.split("|"); const on = Marks.toggle(Marks.charKey(CUR), k, id); cloudMark(Marks.charKey(CUR), k, id, on); renderProgress(CUR); return; }
    const u = e.target.closest("[data-unmark]"); if (u && CUR) { const [k, id] = u.dataset.unmark.split("|"); Marks.set(Marks.charKey(CUR), k, id, false); cloudMark(Marks.charKey(CUR), k, id, false); renderProgress(CUR); return; }
    if (e.target.id === "marksExport") { const txt = Marks.export(); navigator.clipboard.writeText(txt).then(() => { e.target.textContent = T("Copiado"); setTimeout(() => e.target.textContent = T("Exportar"), 1500); }).catch(() => { prompt(T("Copia este JSON:"), txt); }); } });
  document.addEventListener("change", async e => { if (e.target.id === "marksImport" && e.target.files[0]) { try { Marks.import(await e.target.files[0].text()); if (CUR) renderProgress(CUR); } catch (err) { alert(T("JSON no válido")); } } });
  // progress tab: tiles → tappable lists (pending / done / all) with a link to the map pre-filtered
  const PL = { view: null, state: "todo", q: "" };
  function renderProgress(c) {
    const el = $("#progress"); if (!c.progress) { el.innerHTML = `<p class="muted small">${T("Sin datos de progreso (vuelve a abrir el .sl2).")}</p>`; return; }
    const CK = Marks.charKey(c), manual = Marks.load(CK);
    const gv = new Set(c.progress.graces), bd = new Set(c.progress.bosses);
    const graceDone = g => gv.has(g.id) || manual.has("grace:" + g.id), bossDone = b => bd.has(b.id) || manual.has("boss:" + b.id);
    const main = FLAGS.bosses.filter(b => b.type === "main"), field = FLAGS.bosses.filter(b => b.type !== "main"), rem = FLAGS.bosses.filter(b => b.rem);
    const picked = new Set(c.progress.picked || []), have = new Set(c.all.map(i => i.id));
    const world = Object.keys(FLAGS.pickups || {}).map(Number).map(id => ({ id, e: DB.items[id] })).filter(x => x.e).sort((a, b) => (a.e.c || "").localeCompare(b.e.c || "") || a.e.n.localeCompare(b.e.n));
    const worldDone = x => picked.has(x.id) || have.has(x.id) || manual.has("item:" + x.id);
    const SETS = {
      graces: { title: T("Gracias"), items: FLAGS.graces, done: graceDone, group: g => g.region, k: "grace", map: "l=grace" },
      main: { title: T("Jefes principales"), items: main, done: bossDone, group: b => b.region, k: "boss", map: "l=boss&t=main", help: T("Jefes de mazmorras legado y de historia.") },
      field: { title: T("Jefes de campo y mazmorras"), items: field, done: bossDone, group: b => b.region, k: "boss", map: "l=boss&t=field", help: T("Según el save; si uno está mal (opcional ya vencido que el juego no marca), márcalo a mano.") },
      rem: { title: T("Remembranzas"), items: rem, done: bossDone, group: b => b.region, k: "boss", map: "l=boss&t=rem", help: T("Jefes que dejan una remembranza al morir.") },
      world: { title: T("Objetos únicos del mundo"), items: world, done: worldDone, group: x => CAT_ES[x.e.c] || x.e.c || T("Otros"), k: "item", map: "l=miss", help: T("Notas, mapas, cartas, lágrimas, recetarios, llaves… que existen una sola vez y aún no has cogido.") },
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
        return `<div class="row${done ? " done" : ""}"><div class="n">${S.k === "item" ? ic(it) : ""}${link(it, esc(nm))}${x.rem ? `<span class="tag">${T("remembranza")}</span>` : ""}</div><div class="q">${done ? (fromSave ? "✓" : T("✓ a mano")) : markBtn(S.k, x.id)}</div>${S.k === "item" && x.e.loc ? `<div class="m">${esc(x.e.loc)}${x.e.locd ? ` <span class="help">${T("(borrador generado por IA, sin verificar)")}</span>` : ""}</div>` : ""}</div>`; };
      const seg = (v, l) => `<button class="cat" data-pls="${v}" aria-pressed="${PL.state === v}">${l}</button>`;
      panel = `<div class="pane frame plist"><div class="plh"><h3>${S.title} <span class="muted">${rows.length}</span></h3><a class="btn" href="map.html#${S.map}&s=${PL.state}${PL.q ? "&q=" + encodeURIComponent(PL.q) : ""}">${T("Ver en el mapa")}</a></div>
        ${S.help ? `<p class="help">${S.help}</p>` : ""}
        <div class="plf">${seg("todo", T("Pendientes"))}${seg("done", T("Hechos"))}${seg("all", T("Todos"))}<input id="plq" type="search" placeholder="${T("Filtrar…")}" value="${esc(PL.q)}" autocomplete="off"></div>
        <div class="list">${[...groups].map(([g, xs]) => `<div class="grp"><div class="gh">${esc(g)} <span class="muted">${xs.length}</span></div>${xs.map(row).join("")}</div>`).join("") || `<p class="help">${PL.state === "todo" ? T("Nada pendiente.") : T("Nada todavía.")}</p>`}</div></div>`;
    }
    el.innerHTML = `<div id="diary"></div><div class="kv tiles">${tile("graces", T("Gracias"))}${tile("main", T("Jefes principales"))}${tile("field", T("Jefes de campo"))}${tile("rem", T("Remembranzas"))}${tile("world", T("Objetos únicos"))}<div><b>${(c.progress.regions || []).length} / ${Object.keys(FLAGS.mapRegions || {}).length}</b><span>${T("Zonas de mapa")}</span></div></div>
      ${panel || `<p class="help">${T("Toca una casilla para ver la lista de pendientes y hechos.")}</p>`}
      <details><summary>${T("Marcas manuales ({0})", Marks.all(CK).length)}</summary><p class="help">${T("Lo que has marcado a mano para este personaje (lugares en el mapa, jefes, gracias, objetos). Se guarda en este navegador{0}. \"Exportar\" copia el JSON.", Cloud.user() ? T(" y en tu cuenta (sincronizado con Steam)") : T("; si entras con Steam (botón de cuenta arriba) se sincroniza entre dispositivos"))}</p><div class="list">${Marks.all(CK).map(e => `<div class="row"><div class="n">${esc(e.k)} · ${esc(markName(e))}</div><div class="q">${e.at} <button class="btn" data-unmark="${esc(e.k)}|${esc(e.id)}">${T("quitar")}</button></div></div>`).join("") || `<p class="help">${T("Ninguna todavía.")}</p>`}</div><div style="display:flex;gap:8px;margin-top:8px"><button class="btn" id="marksExport">${T("Exportar")}</button><label class="btn" for="marksImport">${T("Importar")}</label><input id="marksImport" type="file" accept=".json" hidden></div></details>`;
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
    if (H.length < 2) { $("#diary").innerHTML = H.length === 1 ? `<p class="help">${T("Diario: primera sesión registrada ({0}). A partir de la próxima partida que abras verás aquí qué ha cambiado.", esc(new Date(H[0].at.replace(" ", "T") + "Z").toLocaleDateString(I18N.locale(), { dateStyle: "medium" })))}</p>` : ""; return; }
    const prev = H[H.length - 2], now = H[H.length - 1];
    const bossName = id => (FLAGS.bosses.find(b => b.id === id) || {}).name;
    const newBosses = now.bosses.filter(id => !prev.bosses.includes(id)).map(bossName).filter(Boolean);
    const newGraces = now.graces.filter(id => !prev.graces.includes(id)).length;
    const pw = new Map(prev.weapons || []); const ups = (now.weapons || []).filter(([n, l]) => (pw.get(n) || 0) < l).map(([n, l]) => `${n} +${pw.get(n) || 0}→+${l}`);
    const d = (a, b) => { const v = (b || 0) - (a || 0); return v ? (v > 0 ? "+" : "") + v.toLocaleString(I18N.locale()) : "0"; };
    const sec = now.playtime - prev.playtime;
    const statD = Object.keys(now.stats || {}).filter(k => (now.stats[k] || 0) !== ((prev.stats || {})[k] || 0)).map(k => `${STAT_ES[k] || k} ${prev.stats[k]}→${now.stats[k]}`);
    // level sparkline over all snapshots
    const W = 320, Hh = 46, lv = H.map(h => h.level), min = Math.min(...lv), max = Math.max(...lv), span = Math.max(1, max - min);
    const pts = H.map((h, i) => `${(i / Math.max(1, H.length - 1)) * (W - 8) + 4},${Hh - 6 - ((h.level - min) / span) * (Hh - 14)}`).join(" ");
    const when = h => new Date(h.at.replace(" ", "T") + "Z").toLocaleDateString(I18N.locale(), { day: "numeric", month: "short" });
    $("#diary").innerHTML = `<div class="pane frame" style="margin-bottom:12px"><h3>${T("Diario · desde la sesión anterior")} <span class="muted">(${esc(when(prev))} → ${esc(when(now))})</span></h3>
      <div class="kv"><div><b>${d(prev.level, now.level)}</b><span>${T("nivel ({0})", now.level)}</span></div><div><b>${ERSave.fmtTime(sec)}</b><span>${T("jugado")}</span></div><div><b>${newBosses.length}</b><span>${T("jefes")}</span></div><div><b>${newGraces}</b><span>${T("gracias")}</span></div><div><b>${d(prev.items, now.items)}</b><span>${T("objetos")}</span></div><div><b>${d(prev.deaths, now.deaths)}</b><span>${T("muertes")}</span></div></div>
      ${newBosses.length ? `<p style="margin:8px 0 0"><span class="help">${T("Jefes vencidos:")}</span> ${newBosses.map(n => link({ name: n, kind: "boss" }, esc(n))).join(", ")}</p>` : ""}
      ${ups.length ? `<p style="margin:6px 0 0"><span class="help">${T("Armas mejoradas:")}</span> ${ups.map(esc).join(", ")}</p>` : ""}
      ${statD.length ? `<p style="margin:6px 0 0"><span class="help">${T("Atributos:")}</span> ${statD.map(esc).join(", ")}</p>` : ""}
      <svg viewBox="0 0 ${W} ${Hh}" width="100%" height="${Hh}" style="margin-top:8px;display:block" aria-label="${T("Nivel por sesión")}"><polyline fill="none" stroke="var(--gold)" stroke-width="1.5" points="${pts}"/>${H.map((h, i) => `<circle cx="${(i / Math.max(1, H.length - 1)) * (W - 8) + 4}" cy="${Hh - 6 - ((h.level - min) / span) * (Hh - 14)}" r="2.5" fill="var(--gold-2)"><title>${T("{0}: nivel {1}", esc(when(h)), h.level)}</title></circle>`).join("")}<text x="4" y="${Hh - 0}" font-size="9" fill="var(--muted)">${esc(when(H[0]))} · ${T("nv {0}", min)}</text><text x="${W - 4}" y="10" font-size="9" fill="var(--muted)" text-anchor="end">${T("nv {0}", max)}</text></svg>
      <p class="help" style="margin:6px 0 0">${T("{0} sesiones registradas (una por cada partida con tiempo de juego distinto que abres con la sesión iniciada).", H.length)}</p></div>`;
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
    $("#need").innerHTML = (w.level >= w.maxLevel ? `<div class="yes"><span>${T("Ya está al máximo.")}</span><span></span></div>` : `<div class="muted small"><span>${T("De +{0} a +{1}", w.level, to)}${w.stored ? T(" (está en el cofre)") : ""}</span><span>${ok ? T("✓ tienes todo") : T("faltan piedras")}</span></div>` + lines.join(""));
  }

  function renderInv() {
    const c = CUR; if (!c) return;
    const q = ($("#q").value || "").trim().toLowerCase();
    const cats = GROUPS.find(g => g[0] === group)[1];
    const src = mode === "missing" ? missingFor(c) : c.all;
    let items = src.filter(i => (!cats || cats.includes(i.cat)) && (!q || i.name.toLowerCase().includes(q) || (i.aow || "").toLowerCase().includes(q)));
    const ORDER = ["melee_armaments", "ranged_and_catalysts", "shields", "arrows_and_bolts", "head", "chest", "arms", "legs", "talismans", "ashes_of_war", "ashes", "sorceries", "incantations", "tools", "crafting_materials", "bolstering_materials", "key_items", "info", "gestures"];
    const oi = c => { const i = ORDER.indexOf(c); return i < 0 ? 99 : i; };
    if (useFilter !== "all") items = items.filter(i => { const u = canUse(c, i); if (!u) return useFilter === "ok"; if (useFilter === "boost") return !!u.boosted; if (useFilter === "ok") return !u.boosted && (u.ok || u.twoHand); return !u.ok && !u.twoHand; });
    items = items.slice().sort((a, b) => oi(a.cat) - oi(b.cat) || a.name.localeCompare(b.name));
    if (mode === "missing") { const tot = CATALOG.filter(i => !cats || cats.includes(i.cat)).length; $("#count").textContent = T("{0} por conseguir de {1}", items.length, tot) + (q ? T(" (filtrado)") : ""); }
    else $("#count").textContent = T("{0} objetos", items.length);
    const cell = i => { const img = iconUrl(i); const e = DB.items[i.id] || (i.kind === "weapon" ? DB.items[i.id - (i.id % 10000)] : null) || { loc: i.loc }; const u = canUse(c, i);
      const meta = [CAT_ES[i.cat] || i.cat, subEs(i.sub), i.infusion && i.infusion !== "Standard" ? i.infusion : null, i.aow ? T("Ceniza: {0}", i.aow) : null, i.qty > 1 ? "×" + i.qty : null, i.stored ? T("en el cofre") : null, i.kind === "weapon" && i.maxLevel ? `+${i.level}/${i.maxLevel}` : null, useMeta(u)].filter(Boolean).join(" · ");
      return `<div class="cell${i.missing ? " miss" : ""}${i.stored ? " stored" : ""}${useCls(u)}" data-item="${esc(JSON.stringify({ n: i.display, w: wikiName(i), d: meta, r: reqLine(u), l: e && e.loc ? e.loc.replace(/\s+([.,;])/g, "$1").replace(/\s{2,}/g, " ") + (e.locd ? " " + T("(borrador generado por IA, sin verificar)") : "") : "", i: img || "" }))}" role="button" tabindex="0" title="${esc(i.display)}">${img ? `<img src="${img}" alt="" loading="lazy">` : `<span class="nm">${esc(i.display)}</span>`}${i.qty > 1 ? `<span class="q">${i.qty}</span>` : ""}${i.kind === "weapon" && i.level ? `<span class="lv">+${i.level}</span>` : ""}</div>`; };
    $("#inv").innerHTML = items.slice(0, limit).map(cell).join("");
    const more = $("#more"); more.hidden = items.length <= limit; if (!more.hidden) more.textContent = T("Mostrar {0} más ({1} restantes)", Math.min(250, items.length - limit), items.length - limit);
    $("#invDetail").innerHTML = `<div class="d help">${T("Toca un objeto para ver el detalle.")}</div>`;
  }

  function modeChips() { $("#mode").innerHTML = [["have", "Tengo"], ["missing", "No tengo"]].map(([m, l]) => `<button class="cat" aria-pressed="${m === mode}" data-m="${m}">${T(l)}</button>`).join("");
    const u = $("#useMode"); if (u) { u.hidden = !Object.keys(R.RQ.weapons).length; u.innerHTML = [["all", "Todo"], ["ok", "Puedo usar"], ["boost", "Solo con bonus"], ["no", "No cumplo"]].map(([m, l]) => `<button class="cat" aria-pressed="${m === useFilter}" data-u="${m}" title="${m === "ok" ? T("Con tus atributos base (a una o dos manos)") : m === "boost" ? T("Solo gracias a talismanes, cascos o runa mayor") : m === "no" ? T("Ni con el equipo actual") : ""}">${T(l)}</button>`).join(""); } }
  $("#useMode").addEventListener("click", e => { const b = e.target.closest(".cat"); if (!b) return; useFilter = b.dataset.u; limit = 250; modeChips(); renderInv(); });
  $("#mode").addEventListener("click", e => { const b = e.target.closest(".cat"); if (!b) return; mode = b.dataset.m; limit = 250; modeChips(); renderInv(); });
  modeChips();
  function chips() { $("#chips").innerHTML = GROUPS.map(g => `<button class="cat" aria-pressed="${g[0] === group}" data-g="${g[0]}">${T(g[0])}</button>`).join(""); }
  $("#chips").addEventListener("click", e => { const b = e.target.closest(".cat"); if (!b) return; group = b.dataset.g; limit = 250; chips(); renderInv(); });
  $("#upgradeable").addEventListener("click", e => { if (e.target.closest("a")) return; const r = e.target.closest("[data-w]"); if (!r) return; $("#planWeapon").value = r.dataset.w; planUpdate(true); $("#planWeapon").scrollIntoView({ block: "center", behavior: "smooth" }); showTab("forge"); });
  $("#q").addEventListener("input", () => { limit = 250; renderInv(); });
  $("#more").addEventListener("click", () => { limit += 250; renderInv(); });
  chips();

  // ---- loading a save -----------------------------------------------------------
  function prep(save) {
    for (const c of save.chars) {
      if (c.error) continue;
      c.steamId = save.steamId || "0";
      c.enriched = ERSave.enrich(c, DB);
      c.all = c.enriched.inventory.concat(c.enriched.keyItems, c.enriched.storage, c.enriched.storageKeys).filter(real);
      if (c.eventFlags) {
        const flag = ERSave.makeFlagReader(FLAGS.bst, c.eventFlags);
        // Equipped Great Rune: event flags 9800–9807, one set at a time (found by diffing a save with and without it, 2026-11-05:
        // 9800 = Godrick's, 9803 = none). The others are not identified yet; a character with one of them shows "unidentified".
        const GR = { 9800: "Godrick's Great Rune", 9803: null };
        const grFlag = [9800, 9801, 9802, 9803, 9804, 9805, 9806, 9807].find(f => flag(f));
        c.enriched.equipped.greatRune = grFlag === undefined || GR[grFlag] === null ? null
          : Object.assign({ kind: "goods", cat: "key_items", sub: "" }, GR[grFlag] ? (DB.items[GR_ID[grFlag]] ? { id: GR_ID[grFlag], loc: DB.items[GR_ID[grFlag]].loc } : {}) : {},
            { name: GR[grFlag] || T("Runa mayor (sin identificar, flag {0})", grFlag), display: GR[grFlag] || T("Runa mayor (sin identificar, flag {0})", grFlag) });
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
    const bad = save.chars.filter(c => c.error);
    $("#msg").innerHTML = bad.length ? `<span class="err">${T("No se pudo leer {0} slot(s): {1}", bad.length, esc(bad[0].error))}</span>` : "";
    if (!chars.length) { $("#msg").innerHTML = `<span class="err">${T("No hay personajes legibles en este archivo.")}</span>`; return; }
    $("#app").hidden = false; $("#dropSec").hidden = true; Shell.showSaveItems(true); $("#tabs").hidden = false; let t0 = location.hash.slice(1); try { t0 = t0 || localStorage.getItem("tl.tab") || "status"; } catch (e) {} showTab(document.getElementById("s-" + t0) ? t0 : "status");
    $("#foot").textContent = `${name} · ${when}`;
    let cur = null; try { cur = localStorage.getItem("tl.cur"); } catch (e) {}
    pick(chars, chars.some(c => String(c.slot) === cur) ? +cur : chars[0].slot); // keep the character you were looking at (same as the map)
  }
  function pick(chars, slot) {
    const c = chars.find(x => x.slot == slot); if (!c) return;
    $("#charSel").value = slot; try { localStorage.setItem("tl.cur", String(slot)); } catch (e) {}
    Shell.setChars(chars.map(x => ({ slot: x.slot, name: x.name, level: x.level, className: x.className })), slot);
    group = "Armas"; limit = 250; $("#q").value = ""; chips();
    renderChar(c);
    cloudSync(c); autoAdvice(c);
    if (TAB === "advice") renderAdvice(c);
  }

  function loadFile(file) {
    $("#msg").textContent = T("Leyendo {0}…", file.name);
    file.arrayBuffer().then(buf => {
      const save = ERSave.parse(buf);
      prep(save); AUTO.clear(); ADV.queue.length = 0; ADV.err = null; // a new file may trigger a new report
      Cloud.pushCharacters(save.chars).then(r => { if (r && !r.error) { note(T("Resumen de personajes guardado en tu cuenta.")); DIARY.cache = {}; if (CUR) renderDiary(CUR); } else if (r && r.error) note(T("No se pudo guardar el resumen en tu cuenta: {0}", r.error)); });
      const when = new Date().toLocaleString(I18N.locale(), { dateStyle: "medium", timeStyle: "short" });
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
  const ADV = { busy: false, key: null, status: "", err: null, linker: null, queue: [], gate: null, follow: null }; // follow: char whose server-side job this page is watching
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
    // Short boss names as the report writes them ("Godrick", "Rennala", "Radahn"): the part before a comma / " the " / " of ",
    // plus a few last-word names. First boss in game order wins when two share a short name (Radahn, Astel, Loretta…).
    const LAST = ["Makar", "Niall", "Placidusax", "Fortissax", "Gaius", "Radahn"];
    for (const b of FLAGS.bosses) {
      const al = new Set(); const m = b.name.match(/^([A-Z][\w'-]+)(?:,| the | of )/); if (m) al.add(m[1]);
      const w = b.name.split(" ").pop(); if (LAST.includes(w)) al.add(w);
      for (const a of al) if (a.length > 3 && !target.has(a) && !["Soldier", "Beastman", "Beastmen", "Kindred"].includes(a)) target.set(a, { focus: b.name });
    }
    const uniq = [...target.keys()].filter(n => n.length > 3).sort((a, b) => b.length - a.length);
    const re = new RegExp("(?<![\\w'])(" + uniq.map(n => esc(n).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")(?![\\w'])", "g");
    const link = text => text.replace(re, m => { const t = target.get(m.replace(/&amp;/g, "&")); if (!t) return m; return `<a class="ml" href="map.html#focus=${encodeURIComponent(t.focus)}${t.q ? "&q=" + encodeURIComponent(t.q) : ""}" title="${T("Ver en el mapa")}">${m}</a>`; });
    // only the text outside existing links (the model may link to the wiki itself) and outside tags
    return ADV.linker = html => html.replace(/(<a\b[^>]*>[\s\S]*?<\/a>)|([^<]+)/g, (m, a, t) => a ? a : link(t));
  }
  const ERR_ES0 = { "summary too old: open the save again while logged in": "el resumen guardado es de una versión anterior; vuelve a abrir el .sl2 con la sesión iniciada.", "advisor not configured (ANTHROPIC_API_KEY)": "falta la clave de la API en el servidor.", "daily cap reached": "has llegado al máximo diario.", "unknown character; open the save while logged in first": "este personaje no está en tu cuenta todavía; abre el .sl2 con la sesión iniciada.", "not your character": "este personaje pertenece a otra cuenta de Steam: el consejero solo trabaja con los personajes de la cuenta con la que has entrado.", "global daily cap reached": "el consejero ha agotado el cupo compartido de hoy; vuelve mañana.", "advisor not enabled for this account": "el consejero no está activado para esta cuenta." };
  const ERR_ES = new Proxy(ERR_ES0, { get: (o, k) => o[k] ? T(o[k]) : o[k] });
  // Generation state shared by the Consejero tab, the auto-start after uploading a save and the status note.
  // ADV.key: character being generated by THIS page; the server also reports jobs started elsewhere (r.running).
  const AUTO = new Set();
  async function renderAdvice(c) {
    const el = $("#advice"); if (!el) return;
    if (!Cloud.user()) { el.innerHTML = `<div class="pane frame"><p class="help">${T("Entra con Steam (botón de cuenta, arriba) y abre tu .sl2 una vez: el consejero trabaja sobre el resumen del personaje guardado en tu cuenta.")}</p><button class="btn primary" id="advLogin">${T("Entrar con Steam")}</button></div>`; $("#advLogin").onclick = () => Cloud.login(); return; }
    const ck = Marks.charKey(c);
    el.innerHTML = `<p class="help">${T("Cargando…")}</p>`;
    const r = await Cloud.advice(ck); if (CUR !== c) return;
    if (r.error) { el.innerHTML = `<div class="pane frame"><p class="help">${esc(r.status === 404 ? T("Este personaje aún no está en tu cuenta: vuelve a abrir el .sl2 con la sesión iniciada.") : (ERR_ES[r.error] || r.error))}</p></div>`; return; }
    if (r.enabled === false) { renderAdvisorGate(c, el); return; }
    if (r.globalFull && !Cloud.isAdmin()) r.cooldown = r.cooldown || 1; // the shared daily budget is spent: no button today
    const mine = ADV.busy && ADV.key === ck, busy = mine || !!r.running;
    // We were watching a job started elsewhere and it is gone without a fresh report: the Worker that ran it died (the browser
    // that started it went away mid-stream). Take over: start a new run from this page.
    if (ADV.follow === ck && !r.running && !mine) { ADV.follow = null; if (r.stale && r.configured && (Cloud.isAdmin() || (r.cooldown === 0 && r.used < r.cap))) { note(T("La generación anterior se interrumpió; se vuelve a pedir el informe."), true); generateAdvice(c, { auto: true }); return; } }
    if (r.running && !mine) ADV.follow = ck;
    const when = r.advice ? new Date(r.advice.created_at.replace(" ", "T") + "Z").toLocaleString(I18N.locale(), { dateStyle: "medium", timeStyle: "short" }) : null;
    const same = r.advice && !r.stale; // the report already matches this save: another run only gives a variant
    const canRefresh = r.configured && !busy && (Cloud.isAdmin() || (r.cooldown === 0 && r.used < r.cap));
    const why = !r.configured ? T("El consejero no está configurado en el servidor (falta la clave de la API).") : r.globalFull && !Cloud.isAdmin() ? T("El consejero ha agotado el cupo compartido de hoy; vuelve mañana.") : r.cooldown > 0 && !Cloud.isAdmin() ? T("Podrás pedir otro informe en {0} h.", Math.ceil(r.cooldown / 3600)) : r.used >= r.cap && !Cloud.isAdmin() ? T("Has llegado al máximo diario de informes.") : r.stale && r.advice && !busy ? T("Has abierto una partida más reciente que la de este informe.") : "";
    const status = mine ? ADV.status : r.running ? T("El informe se está generando en el servidor (lo pidió otra pestaña, otro dispositivo o esta página antes de recargarse)… {0} s", r.running.seconds) + (r.running.progress ? " · " + T("{0} caracteres escritos", r.running.progress) : "") : "";
    el.innerHTML = `<div class="advh"><span class="help">${r.advice ? `${T("Generado el {0}", when)}${r.stale ? T(" · desactualizado") : ""}` : T("Todavía no hay informe para este personaje.")}${T(" · {0}/{1} hoy", r.used, r.cap)}</span><button class="btn primary" id="advRefresh" ${canRefresh ? "" : "disabled"}>${busy ? T("Generando…") : !r.advice ? T("Generar informe") : same ? T("Otra opinión") : T("Actualizar")}</button></div>
      ${status ? `<p class="help" id="advStatus">${esc(status)}</p>` : ""}
      ${why ? `<p class="help">${esc(why)}</p>` : ""}
      ${same && !busy ? `<p class="help">${T("Este informe ya corresponde a la partida abierta; se genera solo cuando abres un save nuevo.")}</p>` : ""}
      ${ADV.err && ADV.key === ck ? `<p class="err">${T("No se pudo generar el informe: {0}", esc(ADV.err))}</p>` : ""}
      ${r.advice ? `<div class="pane frame md">${md(r.advice.text)}</div>` : ""}`;
    if (r.advice) { const link = await reportLinker(); const box = el.querySelector(".md"); if (box && CUR === c) { for (const n of [...box.querySelectorAll("h2, p, li")]) n.innerHTML = link(n.innerHTML); } }
    if (r.running && !mine) setTimeout(() => { if (CUR === c && TAB === "advice" && !(ADV.busy && ADV.key === ck)) renderAdvice(c); }, 5000); // follow a job started elsewhere
    $("#advRefresh").onclick = () => {
      if (same && !confirm(T("El informe ya corresponde a esta partida: generar otro solo dará una variante y cuenta para el cupo diario. ¿Generar de todos modos?"))) return;
      generateAdvice(c, { force: !!same });
    };
  }
  // The advisor spends the site's Claude key, so it is only for accounts that own Elden Ring on Steam (checked with the Steam Web
  // API at login) or that a moderator activated by hand. This screen explains the state and offers the re-check and the request.
  async function renderAdvisorGate(c, el) {
    const g = ADV.gate || (ADV.gate = await Cloud.advisor()); if (CUR !== c) return;
    if (g.error) { el.innerHTML = `<div class="pane frame"><p class="help">${esc(g.error)}</p></div>`; return; }
    if (g.enabled) { ADV.gate = null; renderAdvice(c); return; }
    const when = g.checkedAt ? new Date(g.checkedAt.replace(" ", "T") + "Z").toLocaleString(I18N.locale(), { dateStyle: "medium", timeStyle: "short" }) : null;
    const steps = `<ol class="help" style="margin:6px 0 0;padding-left:20px"><li>${T("En Steam, abre tu perfil → <b>Editar perfil</b> → <b>Configuración de privacidad</b>.")}</li><li>${T("Pon <b>Detalles del juego</b> en <b>Público</b> (es un ajuste aparte de la visibilidad del perfil; el resto puede seguir privado).")}</li><li>${T("Vuelve aquí y pulsa \"Volver a comprobar\". Después puedes dejarlo como estaba: la comprobación se guarda.")}</li></ol>`;
    const reqForm = `<details class="help" style="margin-top:8px"><summary>${g.mode === "closed" ? T("Solicitar acceso") : T("Solicitar activación manual")}</summary><p class="help" style="margin:6px 0">${g.mode === "closed" ? T("Déjanos un correo para avisarte cuando esté activado.") : T("Si no quieres cambiar la privacidad o crees que es un error, pide la activación: un moderador revisará tu cuenta de Steam. Necesitamos un correo para avisarte.")}</p>
      <div class="row"><input id="advReqMail" type="email" placeholder="${T("tu@correo.com")}" value="${esc(g.contact || "")}" autocomplete="email" style="flex:1"></div>
      <div class="row"><input id="advReqNote" placeholder="${T("Nota (opcional): dónde tienes el juego, cuántas horas…")}" style="flex:1"></div>
      <div class="row"><button class="btn primary" id="advReqSend">${T("Enviar solicitud")}</button></div><p class="err" id="advReqErr" hidden></p></details>`;
    const check = `<button class="btn primary" id="advCheck">${T("Volver a comprobar")}</button>${when ? `<span class="help" style="margin-left:8px">${T("Última comprobación: {0}", when)}</span>` : ""}`;
    let body;
    const closed = g.mode === "closed" && !["requested", "denied"].includes(g.state);
    if (closed) body = `<h3>${T("Consejero en beta cerrada")}</h3><p class="help">${T("El consejero genera el informe con la clave de Claude del sitio, así que durante la beta se activa cuenta a cuenta. Requisitos: tener Elden Ring en esta cuenta de Steam. Si tu lista de juegos de Steam es pública podemos comprobarlo solos y la activación es más rápida; si es privada, dinos en la nota dónde tienes el juego.")}</p>${g.owns === "owner" ? `<p class="help">✓ ${T("Hemos comprobado que esta cuenta tiene Elden Ring.")}</p>` : g.owns === "private" ? `<p class="help">${T("Tu lista de juegos es privada (Steam → Editar perfil → Configuración de privacidad → Detalles del juego). No es obligatorio cambiarla para pedir acceso.")}</p>` : ""}${reqForm.replace("<details", "<details open")}`;
    else if (g.state === "private") body = `<h3>${T("Necesitamos ver tu lista de juegos de Steam")}</h3><p class="help">${T("El consejero usa la clave de Claude del sitio, así que solo está activo para cuentas de Steam que tienen Elden Ring. Tu lista de juegos es privada y no podemos comprobarlo. Para hacerla pública:")}</p>${steps}<div class="row" style="margin-top:8px">${check}</div>${reqForm}`;
    else if (g.state === "none") body = `<h3>${T("Elden Ring no aparece en tu cuenta de Steam")}</h3><p class="help">${T("Tu lista de juegos es pública, pero Elden Ring no está en ella y el consejero solo está activo para quien tiene el juego. Si lo tienes en otra cuenta de Steam, entra con esa. Si crees que es un error, vuelve a comprobar o pide la activación manual.")}</p><div class="row" style="margin-top:8px">${check}</div>${reqForm}`;
    else if (g.state === "requested") body = `<h3>${T("Solicitud enviada")}</h3><p class="help">${T("Un moderador revisará tu cuenta y te avisará en {0}. Mientras tanto, el resto de la web funciona igual.", esc(g.contact || ""))}</p>${g.owns === "owner" ? `<p class="help">✓ ${T("Hemos comprobado que esta cuenta tiene Elden Ring.")}</p>` : ""}`;
    else if (g.state === "denied") body = `<h3>${T("Activación denegada")}</h3><p class="help">${T("Un moderador ha revisado tu solicitud y no ha podido activar el consejero para esta cuenta. Si crees que es un error, escribe a {0}.", `<a href="mailto:${SITE.contact}">${SITE.contact}</a>`)}</p>`;
    else body = `<h3>${T("No se ha podido comprobar tu cuenta")}</h3><p class="help">${g.configured ? T("Steam no ha respondido; prueba de nuevo en un momento.") : T("La comprobación automática con Steam no está disponible ahora mismo. Puedes pedir la activación manual.")}</p><div class="row" style="margin-top:8px">${check}</div>${reqForm}`;
    el.innerHTML = `<div class="pane frame">${body}</div>`;
    const chk = $("#advCheck"); if (chk) chk.onclick = async () => { chk.disabled = true; chk.textContent = T("Comprobando…"); const n = await Cloud.advisorCheck(); if (n && n.error) { chk.disabled = false; chk.textContent = T("Volver a comprobar"); note(T("Error: {0}", n.error), true); return; } ADV.gate = n; if (n.enabled) { ADV.gate = null; AUTO.delete(Marks.charKey(c)); note(T("Consejero activado: tu cuenta tiene Elden Ring."), true); renderAdvice(c); autoAdvice(c); } else renderAdvisorGate(c, el); };
    const snd = $("#advReqSend"); if (snd) snd.onclick = async () => { const mail = $("#advReqMail").value.trim(), err = $("#advReqErr"); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) { err.textContent = T("Escribe un correo válido."); err.hidden = false; return; } snd.disabled = true; const n = await Cloud.advisorRequest(mail, $("#advReqNote").value.trim(), g.state); if (n && n.error) { err.textContent = n.error; err.hidden = false; snd.disabled = false; return; } ADV.gate = n; renderAdvisorGate(c, el); };
  }
  function advStatus(t) { ADV.status = t; const st = $("#advStatus"); if (st) st.textContent = t; }
  // Runs the whole thing: push the current summary (unless it was just pushed), ask for the report, show the result.
  async function generateAdvice(c, opts) {
    opts = opts || {}; const ck = Marks.charKey(c); if (ADV.busy) return;
    ADV.busy = true; ADV.key = ck; ADV.err = null; advStatus(T("Pidiendo el informe a Claude (suele tardar entre 15 y 40 segundos)…"));
    if (CUR === c && TAB === "advice") renderAdvice(c); else if (opts.auto) note(T("Generando el informe del consejero en segundo plano…"), true);
    let x = null;
    if (!opts.auto && SAVE && SAVE.chars) { advStatus(T("Guardando el resumen del personaje en tu cuenta…")); const p = await Cloud.pushCharacters(SAVE.chars).catch(e => ({ error: String(e && e.message || e) })); if (p && p.error) x = { error: T("no se pudo guardar el resumen ({0})", p.error) }; else if (p && p.skipped && !p.count) x = { error: T("este personaje pertenece a otra cuenta de Steam") }; }
    if (!x) {
      advStatus(T("Pidiendo el informe a Claude (suele tardar entre 15 y 40 segundos)…")); const t0 = Date.now();
      try { x = await Cloud.adviceRefresh(ck, o => { const sec = Math.round((Date.now() - t0) / 1000); advStatus(o.progress ? T("Claude está escribiendo el informe… ({0} s)", sec) : T("Claude está pensando… ({0} s)", sec)); }, { force: !!opts.force, auto: !!opts.auto }); } catch (e) { x = { error: String(e && e.message || e) }; }
    }
    ADV.busy = false;
    if (x && x.error) { ADV.err = opts.auto && (x.status === 429 || x.error === "login") ? null : (ERR_ES[x.error] || x.error); }
    else { ADV.err = null; if (x && x.advice && !(CUR === c && TAB === "advice")) note(T("Informe del consejero listo."), true); }
    if (CUR === c && TAB === "advice") renderAdvice(c);
    const next = ADV.queue.shift(); if (next) generateAdvice(next, { auto: true });
  }
  // After a save is uploaded: start the report for the character on screen if the stored one no longer matches (once per character and page load).
  async function autoAdvice(c) {
    if (!c || !Cloud.user()) return; const ck = Marks.charKey(c); if (AUTO.has(ck)) return; AUTO.add(ck);
    const p = await Cloud.pushed(); if (!p || p.error || CUR !== c) { AUTO.delete(ck); return; }
    const r = await Cloud.advice(ck); if (CUR !== c || r.error || r.enabled === false || !r.configured || !r.stale || r.running || r.globalFull) return;
    if (!Cloud.isAdmin() && (r.cooldown > 0 || r.used >= r.cap)) return;
    if (ADV.busy) { if (!ADV.queue.includes(c)) ADV.queue.push(c); return; } // another character is generating: run after it
    generateAdvice(c, { auto: true });
  }

  // ---- account (optional) ---------------------------------------------------
  function note(t, force) { const m = $("#msg"); if (!m.textContent || force) { m.textContent = t; setTimeout(() => { if (m.textContent === t) m.textContent = ""; }, 4000); } }
  function cloudMark(ck, k, id, on) { if (!Cloud.user()) return; (on ? Cloud.syncMarks(ck) : Cloud.removeMark(ck, k, id)).then(r => { if (r && r.error) note(T("No se pudo sincronizar la marca: {0}", r.error)); }); }
  let synced = new Set();
  function cloudSync(c) {
    if (!Cloud.user() || !c) return; const ck = Marks.charKey(c); if (synced.has(ck)) return; synced.add(ck);
    const before = Marks.all(ck).length;
    Cloud.syncMarks(ck).then(r => { if (r && !r.error && Marks.all(ck).length !== before && CUR === c) renderProgress(c); });
  }
  function renderAcct() { Shell.setUser(Cloud.user(), Cloud.available()); }
  function sheet(html) { let s = $("#sheet"); if (!s) { s = document.createElement("div"); s.id = "sheet"; s.className = "sheet frame"; document.body.appendChild(s); } s.innerHTML = html + `<div style="text-align:right;margin-top:10px"><button class="btn" id="sheetClose">${T("Cerrar")}</button></div>`; s.hidden = false; $("#sheetClose").onclick = () => { s.hidden = true; }; return s; }
  async function openAcct() {
    const u = Cloud.user();
    if (!u) {
      sheet(`<h3>${T("Cuenta")}</h3><p class="help">${T("Entra con Steam para guardar tus marcas manuales y el resumen de tus personajes en tu cuenta, y para proponer marcadores al mapa de la comunidad. Solo usamos tu identidad pública de Steam (nombre y avatar); nunca pedimos contraseña ni accedemos a tu partida.")}</p><p class="help">${T("La partida (.sl2) no se sube: todo se lee en este navegador y solo se guarda un resumen (nivel, equipo, progreso).")}</p><button class="btn primary" id="doLogin">${T("Entrar con Steam")}</button>`);
      $("#doLogin").onclick = () => Cloud.login(); return;
    }
    const s = sheet(`<h3>${T("Cuenta")}</h3><div class="row"><div class="n">${u.avatar ? `<img src="${esc(u.avatar)}" alt="" style="width:28px;height:28px;vertical-align:middle;margin-right:8px">` : ""}<b>${esc(u.name || "")}</b> <span class="help">· ${u.role === "admin" ? T("moderador") : T("jugador")}</span></div><button class="btn" id="doLogout">${T("Salir")}</button></div>
      <div class="row"><div class="n">${T("Marcas de este personaje")}${CUR ? ` (${Marks.all(Marks.charKey(CUR)).length})` : ""}</div><button class="btn" id="doSync" ${CUR ? "" : "disabled"}>${T("Sincronizar ahora")}</button></div>
      <div class="row"><div class="n">${T("Resumen de personajes de la partida abierta")}</div><button class="btn" id="doPush" ${SAVE ? "" : "disabled"}>${T("Guardar en la cuenta")}</button></div>
      ${Cloud.isAdmin() ? `<h3 style="margin-top:14px">${T("Moderación")}</h3><div id="modq" class="help">${T("Cargando propuestas…")}</div><h3 style="margin-top:14px">${T("Consejero: solicitudes y gasto")}</h3><div id="modadv" class="help">${T("Cargando…")}</div>
      <h3 style="margin-top:14px">${T("Iconos del servidor (R2)")}</h3><div id="modicons" class="help">${T("Cargando…")}</div>` : ""}
      <h3 style="margin-top:14px">${T("Privacidad")}</h3>
      <div class="row"><div class="n help">${T("Borra tu usuario, personajes, marcas e informes del servidor. Tus marcadores ya publicados en el mapa de la comunidad se conservan de forma anónima.")} <a href="privacy.html">${T("Política de privacidad")}</a></div><button class="btn" id="doDelete">${T("Borrar cuenta")}</button></div>`);
    $("#doDelete").onclick = async () => {
      if (!confirm(T("¿Borrar tu cuenta y todos sus datos del servidor? Esta acción no se puede deshacer. Lo guardado en este navegador (partida abierta, marcas) no se toca."))) return;
      const r = await Cloud.deleteAccount();
      if (r && r.error) { note(T("Error: {0}", r.error), true); return; }
      synced = new Set(); renderAcct(); s.hidden = true; note(T("Cuenta borrada."), true); if (TAB === "advice" && CUR) renderAdvice(CUR);
    };
    $("#doLogout").onclick = async () => { await Cloud.logout(); synced = new Set(); ADV.gate = null; renderAcct(); s.hidden = true; };
    $("#doSync").onclick = async () => { if (!CUR) return; synced.delete(Marks.charKey(CUR)); const r = await Cloud.syncMarks(Marks.charKey(CUR)); synced.add(Marks.charKey(CUR)); renderProgress(CUR); note(r && r.error ? T("Error: {0}", r.error) : T("Marcas sincronizadas.")); s.hidden = true; };
    $("#doPush").onclick = async () => { if (!SAVE) return; const r = await Cloud.pushCharacters(SAVE.chars); note(r && r.error ? T("Error: {0}", r.error) : T("Resumen guardado.")); s.hidden = true; };
    if (Cloud.isAdmin()) { renderModQueue(); renderAdvisorAdmin(); renderIconsAdmin(); }
  }
  // Moderator: upload the icon pack extracted from the game (tools/EXTRACT.md) into the R2 bucket, file by file from the browser.
  async function renderIconsAdmin() {
    const box = $("#modicons"); if (!box) return; const d = await Cloud.adminIcons(); if (!box.isConnected) return;
    if (d.error) { box.textContent = d.error; return; }
    if (!d.enabled) { box.innerHTML = `<p class="help" style="margin:0">${T("El bucket R2 no está configurado todavía (binding ICONS en wrangler.toml).")}</p>`; return; }
    box.innerHTML = `<p class="help" style="margin:0 0 6px">${T("{0} iconos en el bucket. Elige la carpeta icons/ generada por tools/extract_icons_game.py (o la de fondos del mapa) y se subirán uno a uno; los que ya existan se sobrescriben.", d.count)}</p>
      <div class="row"><label class="btn" for="r2files">${T("Subir carpeta de iconos")}</label><input id="r2files" type="file" webkitdirectory multiple hidden><label class="btn" for="r2map">${T("Subir fondos del mapa")}</label><input id="r2map" type="file" multiple accept=".webp,.png,.jpg" hidden></div><p class="help" id="r2st" style="margin:6px 0 0"></p>`;
    const upload = async (files, prefix) => {
      const st = $("#r2st"); const list = files.filter(f => /\.(webp|png|jpe?g|svg)$/i.test(f.name)); let done = 0, failed = [];
      const next = async () => { for (;;) { const f = list.shift(); if (!f) return; const r = await Cloud.adminIconPut(prefix + f.name, f); if (r.error) failed.push(f.name + ": " + r.error); done++; if (done % 10 === 0 || !list.length) st.textContent = T("Subidos {0} de {1}…", done, done + list.length); } };
      st.textContent = T("Subiendo {0} ficheros…", list.length);
      await Promise.all(Array.from({ length: 6 }, next));
      st.textContent = T("Listo: {0} subidos, {1} con error.", done - failed.length, failed.length) + (failed.length ? " " + failed.slice(0, 5).join(" · ") : "");
      Icons.reload && Icons.reload();
    };
    $("#r2files").onchange = e => upload(Array.from(e.target.files), "");
    $("#r2map").onchange = e => upload(Array.from(e.target.files), "map/");
  }
  async function renderAdvisorAdmin() {
    const box = $("#modadv"); if (!box) return; const d = await Cloud.adminAdvisor(); if (!box.isConnected) return;
    if (d.error) { box.textContent = d.error; return; }
    const st = d.stats, n = v => (v | 0).toLocaleString(I18N.locale());
    const when = at => at ? new Date(at.replace(" ", "T") + "Z").toLocaleDateString(I18N.locale(), { dateStyle: "medium" }) : "";
    box.innerHTML = `<p class="help" style="margin:0 0 6px">${T("Hoy: {0} informes ({1} / {2} del cupo compartido), {3} tokens de entrada, {4} de salida. Últimos 30 días: {5} informes de {6} usuarios, {7} / {8} tokens.", n(st.day.n), n(st.day.n), n(st.limits.globalDailyCap), n(st.day.tin), n(st.day.tout), n(st.month.n), n(st.month.users), n(st.month.tin), n(st.month.tout))}<br>${T("Modo: {0}", d.mode === "closed" ? T("beta cerrada (solo cuentas aprobadas)") : T("abierto a quien tiene el juego"))} · ${T("Cuentas: {0}", Object.entries(st.access).map(([k, v]) => `${k} ${v}`).join(" · "))}</p>` +
      (d.requests.length ? d.requests.map(r => `<div class="row"><div class="n"><b>${esc(r.name || r.steamid)}</b> <span class="help">· <a href="https://steamcommunity.com/profiles/${esc(r.steamid)}" target="_blank" rel="noopener">${T("perfil")}</a> · ${r.owns === "owner" ? "✓ " + T("tiene el juego") : r.owns === "private" ? T("lista privada") : r.owns === "none" ? "✗ " + T("sin el juego") : T("sin comprobar")} · ${esc(r.contact || "")} · ${esc(when(r.at))}${r.note ? ` · ${esc(r.note)}` : ""}</span></div><div class="q"><button class="btn" data-adv="approve|${esc(r.steamid)}" title="${T("Activar")}">✓</button><button class="btn" data-adv="reject|${esc(r.steamid)}" title="${T("Denegar")}">✗</button></div></div>`).join("") : `<p class="help" style="margin:0">${T("Sin solicitudes pendientes.")}</p>`);
    box.onclick = async e => { const b = e.target.closest("[data-adv]"); if (!b) return; const [a, id] = b.dataset.adv.split("|"); b.disabled = true; await Cloud.adminAdvisorReview(id, a); renderAdvisorAdmin(); };
  }
  async function renderModQueue() {
    const q = $("#modq"); if (!q) return; const list = await Cloud.pending();
    q.innerHTML = list.length ? list.map(m => `<div class="row"><div class="n"><b>${esc(m.item || m.kind || T("marcador"))}</b> <span class="help">· ${esc(m.layer)} (${Math.round(m.x)}, ${Math.round(m.y)}) · ${esc(m.by || m.author)}</span>${m.note ? `<div class="help">${esc(m.note)}</div>` : ""}</div><button class="btn" data-rev="approve|${m.id}">✓</button><button class="btn" data-rev="reject|${m.id}">✗</button></div>`).join("") : T("No hay propuestas pendientes.");
    q.onclick = async e => { const b = e.target.closest("[data-rev]"); if (!b) return; const [a, id] = b.dataset.rev.split("|"); b.disabled = true; await Cloud.review(+id, a); renderModQueue(); };
  }
  $("#acct").addEventListener("click", openAcct);
  Cloud.init().then(() => { renderAcct(); if (CUR) { cloudSync(CUR); renderDiary(CUR); autoAdvice(CUR); } if (CUR && TAB === "advice") renderAdvice(CUR); if (location.hash === "#status" && Cloud.user() && history.replaceState) { /* back from Steam login */ note(T("Sesión iniciada con Steam.")); } });

  // last file, if this browser kept it
  Icons.load({ onSite: n => { $("#iconsMsg").textContent = T("{0} iconos del sitio.", n); $("#iconsBtn").textContent = T("Añadir iconos"); }, onPack: n => { $("#iconsMsg").textContent = T("{0} iconos disponibles.", n); } }).then(() => { if (CUR) renderChar(CUR); });
  try {
    const last = JSON.parse(localStorage.getItem("tl.last") || "null");
    if (last && last.chars && last.chars.length) {
      for (const c of last.chars) if (!c.error) c.all = c.enriched.inventory.concat(c.enriched.keyItems, c.enriched.storage, c.enriched.storageKeys).filter(real);
      showSave({ chars: last.chars }, last.name, last.when);
      $("#foot").textContent = `${last.name} · ${last.when} · ${T("última partida abierta en este navegador; usa \"Abrir otro .sl2\" para actualizar")}`;
    }
  } catch (e) {}
}

Promise.all([fetch("data/items.json").then(r => r.json()), fetch("data/flags.json").then(r => r.json()), fetch("data/reqs.json").then(r => r.ok ? r.json() : null).catch(() => null)]).then(([db, fl, rq]) => main(db, fl, rq)).catch(e => { document.getElementById("msg").textContent = T("No se pudo cargar la base de datos de objetos: {0}", e.message); });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
