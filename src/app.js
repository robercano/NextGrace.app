/* app.js — Tarnished Ledger UI. Expects window.ERSave (src/ersave.js) and the items DB passed to main(). */
async function main(DB){
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
  let group = "Armas", limit = 250;

  function stoneCounts(c) { const m = {}; for (const it of c.all) if (STONE[it.name] !== undefined) m[it.name] = (m[it.name] || 0) + it.qty; return m; }

  function renderChar(c) {
    CUR = c;
    $("#cName").textContent = c.name || ("Slot " + (c.slot + 1));
    $("#cLevel").textContent = "Nv " + c.level;
    const ng = c.clearCount ? "NG+" + c.clearCount : "NG";
    $("#cSub").innerHTML = `<span>${esc(c.className)}</span><span>${ng}</span><span>${ERSave.fmtTime(c.playtimeSec)} jugadas</span><span>${c.deaths} muertes</span>`;
    const gauge = (label, v, max, color) => `<div class="g"><span>${label}</span><i><b style="width:${max ? Math.min(100, 100 * v / max) : 0}%;background:${color}"></b></i><span>${v} / ${max}</span></div>`;
    $("#gauges").innerHTML = gauge("HP", c.hp, c.maxHp, "var(--hp)") + gauge("FP", c.fp, c.maxFp, "var(--fp)") + gauge("SP", c.sp, c.maxSp, "var(--sp)");
    const kv = [["Runas", c.runes.toLocaleString("es")], ["Runas totales", c.totalRunes.toLocaleString("es")], ["Frascos", `${c.crimsonFlasks} carmesí · ${c.ceruleanFlasks} cerúleo`], ["Nivel de arma (matchmaking)", "+" + c.matchmakingWpnLvl], ["Regalo inicial", c.giftName], ["Runa mayor", c.greatRuneActive ? "activa" : "inactiva"]];
    $("#kv").innerHTML = kv.map(([k, v]) => `<div><b>${esc(v)}</b><span>${k}</span></div>`).join("");
    const S = c.stats, names = { vigor: "Vig", mind: "Men", endurance: "Res", strength: "Fue", dexterity: "Des", intelligence: "Int", faith: "Fe", arcane: "Arc" };
    $("#stats").innerHTML = Object.keys(names).map(k => `<div><b>${S[k]}</b><span>${names[k]}</span></div>`).join("");

    const E = c.enriched.equipped;
    const item = it => (it && real(it)) ? ic(it) + link(it, esc(it.display)) + (it.aow ? `<span class="tag">${esc(it.aow)}</span>` : "") : `<span class="muted">—</span>`;
    const multi = arr => arr.filter(x => x && real(x)).map(item).join("<br>") || `<span class="muted">—</span>`;
    const rows = [["Mano dcha", multi(E.rh)], ["Mano izq", multi(E.lh)], ["Flechas", multi(E.arrows.concat(E.bolts))], ["Cabeza", item(E.head)], ["Pecho", item(E.chest)], ["Brazos", item(E.arms)], ["Piernas", item(E.legs)], ["Talismanes", multi(E.talismans)], ["Acceso rápido", multi(c.enriched.quick)], ["Bolsa", multi(c.enriched.pouch)], ["Hechizos", c.enriched.spells.map(s => link(s, esc(s.display))).join("<br>") || `<span class="muted">—</span>`], ["Físico", c.physick.map(id => { const e = DB.items[id]; return e ? link({ name: e.n, kind: e.k }, esc(e.n)) : null; }).filter(Boolean).join("<br>") || `<span class="muted">—</span>`]];
    $("#eq").innerHTML = rows.map(([k, v]) => `<span>${k}</span><div>${v}</div>`).join("");

    // stones
    const sc = stoneCounts(c);
    const tile = (n, lbl) => `<div class="${sc[n] ? "" : "zero"}" title="${esc(n)}"><b>${sc[n] || 0}</b><span>${lbl}</span></div>`;
    $("#stonesN").innerHTML = [1,2,3,4,5,6,7,8].map(n => tile("Smithing Stone [" + n + "]", "[" + n + "]")).join("") + tile("Ancient Dragon Smithing Stone", "Dragón");
    $("#stonesS").innerHTML = [1,2,3,4,5,6,7,8,9].map(n => tile("Somber Smithing Stone [" + n + "]", "[" + n + "]")).join("") + tile("Somber Ancient Dragon Smithing Stone", "Dragón");

    // weapons sorted: not maxed first, highest level first
    const weapons = c.all.filter(i => i.kind === "weapon" && i.maxLevel > 0 && !["arrows_and_bolts"].includes(i.cat));
    weapons.sort((a, b) => (a.level >= a.maxLevel) - (b.level >= b.maxLevel) || b.level - a.level || a.name.localeCompare(b.name));
    const sel = $("#planWeapon");
    sel.innerHTML = weapons.map((w, i) => `<option value="${i}">${esc(w.display)} (máx +${w.maxLevel})</option>`).join("");
    sel.onchange = planUpdate;
    $("#planTo").oninput = () => planUpdate("typing"); $("#planTo").onchange = planUpdate;
    sel.selectedIndex = Math.max(0, weapons.findIndex(w => w.level > 0 && w.level < w.maxLevel));
    c.weapons = weapons; planUpdate(true);

    const wrow = w => `<div class="row${w.stored ? " stored" : ""}" data-w="${weapons.indexOf(w)}" role="button" tabindex="0" style="cursor:pointer"><div class="n">${ic(w)}${link(w, esc(w.display))}${w.level >= w.maxLevel ? '<span class="tag max">máx</span>' : ""}${w.aow ? `<span class="tag">${esc(w.aow)}</span>` : ""}<span class="lvlbar"><b style="width:${100 * w.level / w.maxLevel}%"></b></span></div><div class="q">+${w.level} / ${w.maxLevel}</div></div>`;
    const pending = weapons.filter(w => w.level > 0 && w.level < w.maxLevel), maxed = weapons.filter(w => w.level >= w.maxLevel);
    $("#upgradeable").innerHTML = (pending.map(wrow).join("") || `<p class="muted small">Ninguna arma a medias: todo lo que has tocado está al máximo.</p>`) + (maxed.length ? `<details><summary>${maxed.length} armas al máximo</summary><div class="list">${maxed.map(wrow).join("")}</div></details>` : "");

    renderInv();
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
    let items = c.all.filter(i => (!cats || cats.includes(i.cat)) && (!q || i.name.toLowerCase().includes(q) || (i.aow || "").toLowerCase().includes(q)));
    items = items.slice().sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name));
    $("#count").textContent = items.length + " objetos";
    let lastCat = null, html = "";
    for (const i of items.slice(0, limit)) {
      if (i.cat !== lastCat) { lastCat = i.cat; html += `<div class="row"><div class="m" style="grid-column:1/-1;padding-top:6px;color:var(--accent);text-transform:uppercase;letter-spacing:.1em">${esc(CAT_ES[i.cat] || i.cat || "Otros")}</div></div>`; }
      const meta = [i.sub, i.infusion && i.infusion !== "Standard" ? i.infusion : null, i.aow ? "AoW: " + i.aow : null].filter(Boolean).join(" · ");
      html += `<div class="row${i.stored ? " stored" : ""}"><div class="n">${ic(i)}${link(i, esc(i.display))}${i.dlc ? '<span class="tag dlc">DLC</span>' : ""}${i.kind === "weapon" && i.maxLevel ? `<span class="tag">+${i.level}/${i.maxLevel}</span>` : ""}</div><div class="q">${i.qty > 1 ? "×" + i.qty : ""}</div>${meta ? `<div class="m">${esc(meta)}</div>` : ""}</div>`;
    }
    if (items.length > limit) html += `<button class="btn" id="more" style="margin-top:10px">Mostrar ${Math.min(250, items.length - limit)} más (${items.length - limit} restantes)</button>`;
    $("#inv").innerHTML = html;
  }

  function chips() { $("#chips").innerHTML = GROUPS.map(g => `<button class="chip" aria-pressed="${g[0] === group}" data-g="${g[0]}">${g[0]}</button>`).join(""); }
  $("#chips").addEventListener("click", e => { const b = e.target.closest(".chip"); if (!b) return; group = b.dataset.g; limit = 250; chips(); renderInv(); });
  $("#upgradeable").addEventListener("click", e => { if (e.target.closest("a")) return; const r = e.target.closest("[data-w]"); if (!r) return; $("#planWeapon").value = r.dataset.w; planUpdate(true); $("#planWeapon").scrollIntoView({ block: "center", behavior: "smooth" }); });
  $("#q").addEventListener("input", () => { limit = 250; renderInv(); });
  $("#inv").addEventListener("click", e => { if (e.target.id === "more") { limit += 250; renderInv(); } });
  chips();

  // ---- loading -----------------------------------------------------------
  const PLACEHOLDER = new Set([110000, 0x10002710, 0x10002774, 0x100027D8, 0x1000283C]); // Unarmed, Head, Body, Arms, Legs
  const real = i => !PLACEHOLDER.has(i.id);
  function prep(save) {
    for (const c of save.chars) {
      if (c.error) continue;
      c.enriched = ERSave.enrich(c, DB);
      c.all = c.enriched.inventory.concat(c.enriched.keyItems, c.enriched.storage, c.enriched.storageKeys).filter(real);
    }
  }
  function showSave(save, name, when) {
    SAVE = save; FILENAME = name;
    const chars = save.chars.filter(c => !c.error);
    const sel = $("#charSel");
    sel.innerHTML = chars.map(c => `<option value="${c.slot}">${esc(c.name || "Slot " + (c.slot + 1))} · ${c.level}</option>`).join("");
    sel.hidden = chars.length < 2;
    sel.onchange = () => pick(chars, sel.value);
    const cs = $("#chars"); cs.hidden = chars.length < 2;
    cs.innerHTML = chars.map(c => `<button data-slot="${c.slot}" aria-pressed="false"><b>${esc(c.name || "Slot " + (c.slot + 1))}</b><span>Nv ${c.level} · ${esc(c.className)} · ${ERSave.fmtTime(c.playtimeSec)}</span></button>`).join("");
    cs.onclick = e => { const b = e.target.closest("[data-slot]"); if (b) pick(chars, b.dataset.slot); };
    const bad = save.chars.filter(c => c.error);
    $("#msg").innerHTML = bad.length ? `<span class="err">No se pudo leer ${bad.length} slot(s): ${esc(bad[0].error)}</span>` : "";
    if (!chars.length) { $("#msg").innerHTML = `<span class="err">No hay personajes legibles en este archivo.</span>`; return; }
    $("#app").hidden = false; $("#dropSec").hidden = true; $("#barOpen").hidden = false;
    $("#foot").textContent = `${name} · ${when}`;
    pick(chars, chars[0].slot);
  }
  function pick(chars, slot) {
    const c = chars.find(x => x.slot == slot); if (!c) return;
    $("#charSel").value = slot;
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
  function slim(c) { if (c.error) return c; const o = Object.assign({}, c); delete o.gaMap; delete o.inventory; delete o.storage; delete o.equipHandles; delete o.equipIndex; delete o.equipIds; delete o.weapons; return o; }

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

fetch("data/items.json").then(r => r.json()).then(main).catch(e => { document.getElementById("msg").textContent = "No se pudo cargar la base de datos de objetos: " + e.message; });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
