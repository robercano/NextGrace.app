/* app.js — Tarnished Ledger UI. Expects window.ERSave (src/ersave.js) and the items DB passed to main(). */
async function main(DB, FLAGS){
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
  let group = "Armas", limit = 250, mode = "have";
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
  $("#tabs").addEventListener("click", e => { const b = e.target.closest(".tab"); if (b) showTab(b.dataset.t); });
  window.addEventListener("hashchange", () => { const t = location.hash.slice(1); if (document.getElementById("s-" + t)) showTab(t); });

  // ---- small inline SVG icons (own drawings) --------------------------------
  const SVG = {
    vigor: '<path d="M9 2l2 4 2-4 3 5-1 5-4 6-4-6-1-5z"/>', mind: '<circle cx="9" cy="9" r="5"/><path d="M9 1v3M9 14v3M1 9h3M14 9h3"/>', endurance: '<path d="M3 13l3-8 3 5 3-7 3 10"/>', strength: '<path d="M4 15l4-6-2-3 4-3 2 4-3 1 4 7"/>', dexterity: '<path d="M3 15l6-12 6 12M6 10h6"/>', intelligence: '<path d="M9 2l6 7-6 7-6-7z"/>', faith: '<path d="M9 2v14M4 7h10"/>', arcane: '<circle cx="9" cy="9" r="6"/><circle cx="9" cy="9" r="2"/>',
  };
  const svg = k => `<i class="ic"><svg viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round">${SVG[k] || ""}</svg></i>`;
  const kvr = (k, v, sub) => `<div class="kvr"><span>${k}</span><b>${v}</b>${sub ? `<div class="sub" style="grid-column:1/-1">${sub}</div>` : ""}</div>`;

  function weightOf(it) { const e = it && DB.items[it.id]; return e && e.w ? e.w : 0; }
  function renderChar(c) {
    CUR = c;
    $("#cName").textContent = c.name || ("Slot " + (c.slot + 1));
    $("#cLevel").textContent = c.level;
    $("#cRunes").textContent = c.runes.toLocaleString("es");
    const ng = c.clearCount ? "NG+" + c.clearCount : "NG";
    $("#cSub").textContent = `${c.className} · ${ng} · ${ERSave.fmtTime(c.playtimeSec)} · ${c.deaths} muertes`;
    const gauge = (label, v, max, color) => `<div class="bar"><span>${label}</span><i><b style="width:${max ? Math.min(100, 100 * v / max) : 0}%;background:${color}"></b></i><span class="num">${v} / ${max}</span></div>`;
    $("#gauges").innerHTML = gauge("HP", c.hp, c.maxHp, "var(--hp)") + gauge("FP", c.fp, c.maxFp, "var(--fp)") + gauge("SP", c.sp, c.maxSp, "var(--sp)");
    const S = c.stats, names = { vigor: "Vigor", mind: "Mente", endurance: "Resistencia", strength: "Fuerza", dexterity: "Destreza", intelligence: "Inteligencia", faith: "Fe", arcane: "Arcano" };
    $("#stats").innerHTML = Object.keys(names).map(k => kvr(svg(k) + names[k], S[k])).join("");
    $("#kv").innerHTML = kvr("Clase", esc(c.className)) + kvr("Regalo", esc(c.giftName)) + kvr("Runas totales", c.totalRunes.toLocaleString("es")) + kvr("Muertes", c.deaths) + kvr("Ciclo", ng) + kvr("Nivel de arma (matchmaking)", "+" + c.matchmakingWpnLvl) + kvr("Runa mayor equipada", c.enriched.equipped.greatRune ? esc(c.enriched.equipped.greatRune.name) : "ninguna") + kvr("Runa mayor activa (Arco de Runa)", c.greatRuneActive ? "sí" : "no") + kvr("Huecos de talismán", 1 + c.talismanSlots);
    const B = c.buildups;
    $("#resist").innerHTML = kvr("Veneno", B.poison) + kvr("Putrefacción", B.rot) + kvr("Hemorragia", B.bleed) + kvr("Congelación", B.frost) + kvr("Sueño", B.sleep) + kvr("Locura", B.madness) + kvr("Muerte", B.deathblight);
    const E = c.enriched.equipped;
    const worn = [E.head, E.chest, E.arms, E.legs].concat(E.rh, E.lh, E.talismans, E.arrows, E.bolts).filter(x => x && real(x));
    const load = worn.reduce((a, it) => a + weightOf(it), 0);
    const maxLoad = 45 + 1.6 * Math.min(S.endurance, 25) + (S.endurance > 25 ? 1.0 * (Math.min(S.endurance, 60) - 25) : 0) + (S.endurance > 60 ? 0.6 * (S.endurance - 60) : 0);
    const ratio = load / maxLoad, roll = ratio < .3 ? "ligero" : ratio < .7 ? "medio" : ratio <= 1 ? "pesado" : "sobrecargado";
    $("#misc").innerHTML = kvr("Carga de equipo", `${load.toFixed(1)} / ${maxLoad.toFixed(1)}`, `${roll} (aprox.)`) + kvr("Frasco carmesí", c.crimsonFlasks) + kvr("Frasco cerúleo", c.ceruleanFlasks) + kvr("Hechizos memorizados", c.enriched.spells.length);

    renderEquip(c);
    renderProgress(c);
    renderForge(c);
    renderInv();
  }

  // ---- equipment screen -----------------------------------------------------
  const EQSEL = { k: null };
  function slot(it, lbl, extra) { const has = it && real(it); const img = has ? ICONS.size && iconCandidates(it).map(k => ICONS.get(k)).find(Boolean) : null;
    return `<div class="slot${has ? "" : " empty"}" data-item="${has ? esc(JSON.stringify({ n: it.display, w: wikiName(it), d: [it.sub, it.infusion && it.infusion !== "Standard" ? it.infusion : null, it.aow ? "Ceniza: " + it.aow : null, weightOf(it) ? "Peso " + weightOf(it) : null].filter(Boolean).join(" · "), i: img || "" })) : ""}" role="button" tabindex="0">${img ? `<img src="${img}" alt="">` : has ? `<span style="font-size:.6rem;text-align:center;padding:4px;color:var(--fg-2)">${esc(it.display)}</span>` : ""}${has && it.kind === "weapon" && it.level ? `<span class="lvl">+${it.level}</span>` : ""}<span class="lbl">${lbl}</span></div>`; }
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
    box.innerHTML = `${d.i ? `<img src="${d.i}" alt="">` : ""}<div><div class="t">${esc(d.n)}</div><div class="d">${esc(d.d || "")}</div>${d.l ? `<div class="d">${esc(d.l)}</div>` : ""}<a class="wl" href="${WIKI}${encodeURIComponent(d.w.replace(/ /g, "_"))}" target="_blank" rel="noopener">Ver en la wiki</a></div>`; });

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
    const wrow = w => `<div class="row click${w.stored ? " stored" : ""}" data-w="${weapons.indexOf(w)}" role="button" tabindex="0"><div class="n">${ic(w)}${link(w, esc(w.display))}${w.level >= w.maxLevel ? '<span class="tag max">máx</span>' : ""}${w.aow ? `<span class="tag">${esc(w.aow)}</span>` : ""}<span class="lvlbar"><b style="width:${100 * w.level / w.maxLevel}%"></b></span></div><div class="q">+${w.level} / ${w.maxLevel}</div></div>`;
    const pending = weapons.filter(w => w.level > 0 && w.level < w.maxLevel), maxed = weapons.filter(w => w.level >= w.maxLevel);
    $("#upgradeable").innerHTML = (pending.map(wrow).join("") || `<p class="help">Ninguna arma a medias: todo lo que has tocado está al máximo.</p>`) + (maxed.length ? `<details><summary>${maxed.length} armas al máximo</summary><div class="list">${maxed.map(wrow).join("")}</div></details>` : "");
  }

  function renderProgress(c) {
    const el = $("#progress"); if (!c.progress) { el.innerHTML = `<p class="muted small">Sin datos de progreso (vuelve a abrir el .sl2).</p>`; return; }
    const gv = new Set(c.progress.graces), bd = new Set(c.progress.bosses);
    const byRegion = {};
    for (const g of FLAGS.graces) { const r = byRegion[g.region] = byRegion[g.region] || { total: 0, done: 0, pending: [] }; r.total++; if (gv.has(g.id)) r.done++; else r.pending.push(g); }
    const regions = Object.entries(byRegion).sort((a, b) => (a[1].total - a[1].done) - (b[1].total - b[1].done) === 0 ? a[0].localeCompare(b[0]) : (b[1].total - b[1].done) - (a[1].total - a[1].done));
    const main = FLAGS.bosses.filter(b => b.type === "main"), field = FLAGS.bosses.filter(b => b.type !== "main");
    const pend = FLAGS.bosses.filter(b => !bd.has(b.id));
    const picked = new Set(c.progress.picked || []), have = new Set(c.all.map(i => i.id));
    const world = Object.keys(FLAGS.pickups || {}).map(Number).map(id => ({ id, e: DB.items[id] })).filter(x => x.e).sort((a, b) => (a.e.c || "").localeCompare(b.e.c || "") || a.e.n.localeCompare(b.e.n));
    const wMissing = world.filter(x => !picked.has(x.id) && !have.has(x.id));
    const wRow = x => `<div class="row"><div class="n">${ic({ id: x.id, name: x.e.n, kind: x.e.k })}${link({ name: x.e.n, kind: x.e.k }, esc(x.e.n))}<span class="tag">${esc(CAT_ES[x.e.c] || x.e.c || "")}</span></div><div class="q">${have.has(x.id) ? "lo tienes" : picked.has(x.id) ? "cogido" : "pendiente"}</div>${x.e.loc ? `<div class="m">${esc(x.e.loc.replace(/\s*\[\s*Map Link\s*\]\s*;?/g, ""))}</div>` : ""}</div>`;
    el.innerHTML = `<div class="kv">
      <div><b>${gv.size} / ${FLAGS.graces.length}</b><span>Gracias</span></div>
      <div><b>${main.filter(b => bd.has(b.id)).length} / ${main.length}</b><span>Jefes principales</span></div>
      <div><b>${field.filter(b => bd.has(b.id)).length} / ${field.length}</b><span>Jefes de campo</span></div>
      <div><b>${FLAGS.bosses.filter(b => b.rem && bd.has(b.id)).length} / ${FLAGS.bosses.filter(b => b.rem).length}</b><span>Remembranzas</span></div>
      <div><b>${world.length - wMissing.length} / ${world.length}</b><span>Objetos únicos del mundo</span></div>
      <div><b>${(c.progress.regions || []).length} / ${Object.keys(FLAGS.mapRegions || {}).length}</b><span>Zonas de mapa reveladas</span></div></div>
      <details><summary>Objetos únicos pendientes (${wMissing.length})</summary><p class="help">Notas, mapas, cartas, lágrimas, recetarios, llaves… que existen una sola vez en el mundo y aún no has cogido.</p><div class="list">${wMissing.map(wRow).join("") || '<p class="help">Todo cogido.</p>'}</div></details>
      <details><summary>Jefes pendientes (${pend.length})</summary><div class="list">${pend.map(b => `<div class="row"><div class="n">${link({ name: b.name, kind: "boss" }, esc(b.name))}${b.rem ? '<span class="tag">remembranza</span>' : ""}</div><div class="q">${esc(b.region)}</div></div>`).join("") || '<p class="muted small">Ninguno.</p>'}</div></details>
      <details><summary>Gracias pendientes por región (${FLAGS.graces.length - gv.size})</summary><div class="list">${regions.filter(([, r]) => r.pending.length).map(([name, r]) => `<div class="row"><div class="n">${esc(name)}</div><div class="q">${r.done} / ${r.total}</div><div class="m">${r.pending.map(g => esc(g.name)).join(" · ")}</div></div>`).join("") || '<p class="muted small">Todas descubiertas.</p>'}</div></details>`;
  }

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
    items = items.slice().sort((a, b) => oi(a.cat) - oi(b.cat) || a.name.localeCompare(b.name));
    if (mode === "missing") { const tot = CATALOG.filter(i => !cats || cats.includes(i.cat)).length; $("#count").textContent = `${items.length} por conseguir de ${tot}` + (q ? " (filtrado)" : ""); }
    else $("#count").textContent = items.length + " objetos";
    const cell = i => { const img = ICONS.size ? iconCandidates(i).map(k => ICONS.get(k)).find(Boolean) : null; const e = DB.items[i.id];
      const meta = [CAT_ES[i.cat] || i.cat, i.sub, i.infusion && i.infusion !== "Standard" ? i.infusion : null, i.aow ? "Ceniza: " + i.aow : null, i.qty > 1 ? "×" + i.qty : null, i.stored ? "en el cofre" : null, i.kind === "weapon" && i.maxLevel ? `+${i.level}/${i.maxLevel}` : null].filter(Boolean).join(" · ");
      return `<div class="cell${i.missing ? " miss" : ""}${i.stored ? " stored" : ""}" data-item="${esc(JSON.stringify({ n: i.display, w: wikiName(i), d: meta, l: e && e.loc ? e.loc.replace(/\s*\[\s*Map Link\s*\]\s*;?/g, "").replace(/\s+([.,;])/g, "$1").replace(/\s{2,}/g, " ") : "", i: img || "" }))}" role="button" tabindex="0" title="${esc(i.display)}">${img ? `<img src="${img}" alt="" loading="lazy">` : `<span class="nm">${esc(i.display)}</span>`}${i.qty > 1 ? `<span class="q">${i.qty}</span>` : ""}${i.kind === "weapon" && i.level ? `<span class="lv">+${i.level}</span>` : ""}</div>`; };
    $("#inv").innerHTML = items.slice(0, limit).map(cell).join("");
    const more = $("#more"); more.hidden = items.length <= limit; if (!more.hidden) more.textContent = `Mostrar ${Math.min(250, items.length - limit)} más (${items.length - limit} restantes)`;
    $("#invDetail").innerHTML = `<div class="d help">Toca un objeto para ver el detalle.</div>`;
  }

  function modeChips() { $("#mode").innerHTML = [["have", "Tengo"], ["missing", "No tengo"]].map(([m, l]) => `<button class="cat" aria-pressed="${m === mode}" data-m="${m}">${l}</button>`).join(""); }
  $("#mode").addEventListener("click", e => { const b = e.target.closest(".cat"); if (!b) return; mode = b.dataset.m; limit = 250; modeChips(); renderInv(); });
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
    $("#app").hidden = false; $("#dropSec").hidden = true; $("#barOpen").hidden = false; $("#barSteam").hidden = false; $("#mapLink").hidden = false; $("#tabs").hidden = false; let t0 = location.hash.slice(1); try { t0 = t0 || localStorage.getItem("tl.tab") || "status"; } catch (e) {} showTab(document.getElementById("s-" + t0) ? t0 : "status");
    $("#foot").textContent = `${name} · ${when}`;
    pick(chars, chars[0].slot);
  }
  function pick(chars, slot) {
    const c = chars.find(x => x.slot == slot); if (!c) return;
    $("#charSel").value = slot; try { localStorage.setItem("tl.cur", String(slot)); } catch (e) {}
    for (const b of document.querySelectorAll("#chars [data-slot]")) b.setAttribute("aria-pressed", b.dataset.slot == slot);
    group = "Armas"; limit = 250; $("#q").value = ""; chips();
    renderChar(c);
  }

  function loadFile(file) {
    $("#msg").textContent = "Leyendo " + file.name + "…";
    file.arrayBuffer().then(buf => {
      const save = ERSave.parse(buf);
      prep(save);
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

Promise.all([fetch("data/items.json").then(r => r.json()), fetch("data/flags.json").then(r => r.json())]).then(([db, fl]) => main(db, fl)).catch(e => { document.getElementById("msg").textContent = "No se pudo cargar la base de datos de objetos: " + e.message; });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
