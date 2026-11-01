/*
 * icons.js — item icons: where they come from and how an item finds its picture.
 *
 * Sources, in order: icons/index.json (files served by the site, `icons/<key>.webp`) and a pack the user imported
 * in this browser (zip or loose images, kept in IndexedDB "tl"/"icons" as blobs). Keys are either the item id
 * (upgraded weapons use their base id: id − id % 10000) or a slug of the item name ("dagger", "verdigris_helm").
 *
 * Lookup (Icons.find(item)) tries, in order: id, slug(name), name without "[n]", without affinity prefix, without +N,
 * the part after ": " ("Ash of War: X" → "x"), the name stripped of affinity words, and finally a family icon for
 * things that share one picture in the game (bell bearings, cookbooks, letters, tears, greases, jerky, steed attire).
 * To support a new naming scheme, add a candidate here rather than renaming files.
 *
 *   Icons.load({ onStatus })      → fills the map from the site and the browser pack
 *   Icons.import(files, hooks)    → stores a user pack; hooks: { onStatus(text), onDone() }
 *   Icons.find(item) → url | null;  Icons.img(item) → "<img class=ico …>" | "";  Icons.size()
 */
(function (root) {
  "use strict";
  const ICONS = new Map(); // key → url (site path or object URL)
  const slug = n => n.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const iconKey = i => i.kind === "weapon" ? String(i.id - (i.id % 10000)) : String(i.id);
  // some icons were saved with the wiki group as a prefix ("item_armorer_s_cookbook", "material_smithing_stone_1"): alias them without it
  const PREFIX = /^(item|material|weapon|armor|spell|talisman|goods|key|gesture|info|tool|ash|spirit)_/;
  // families that share one picture in the game: [family key, name pattern, file pattern of a sibling]
  const GENERIC = [["bell", /bell bearing/i, /bell_bearing/], ["cook", /cookbook|recipe \[/i, /cookbook/], ["letter", /letter|^note:/i, /_letter$|^note_/], ["tear", /crystal tear/i, /crystal_tear/], ["grease", /grease$/i, /_grease$/], ["jerky", /jerky$/i, /jerky/], ["attire", /spectral steed attire/i, /spectral_steed_attire/]];
  const AFFINITY = /\b(Heavy|Keen|Quality|Fire|Flame Art|Lightning|Sacred|Magic|Cold|Poison|Blood|Occult|Bloody)\s+/g;

  function aliases() {
    for (const [k, v] of [...ICONS]) { if (PREFIX.test(k)) { const bare = k.replace(PREFIX, ""); if (!ICONS.has(bare)) ICONS.set(bare, v); } }
    for (const [key, , filePat] of GENERIC) { if (ICONS.has("__" + key)) continue; const hit = [...ICONS.keys()].find(k => filePat.test(k)); if (hit) ICONS.set("__" + key, ICONS.get(hit)); }
  }
  function candidates(i) {
    const c = [iconKey(i), slug(i.name)];
    const nb = i.name.replace(/\s*\[\d+\]\s*$/, ""); if (nb !== i.name) c.push(slug(nb)); // "Armorer's Cookbook [1]" → shared cookbook icon
    if (i.kind === "weapon" && i.infusion && i.infusion !== "Standard" && i.name.startsWith(i.infusion + " ")) c.push(slug(i.name.slice(i.infusion.length + 1)));
    const plain = i.name.replace(/\s*\+\d+$/, ""); if (plain !== i.name) c.push(slug(plain));
    if (i.name.includes(": ")) c.push(slug(i.name.split(": ").slice(1).join(": ")));
    const bare = i.name.replace(/\s*\+\s*\d+\s*$/, "").replace(AFFINITY, "").trim(); if (bare !== i.name) c.push(slug(bare));
    for (const [key, namePat] of GENERIC) if (namePat.test(i.name)) { c.push("__" + key); break; }
    return c;
  }
  function find(i) { if (!ICONS.size) return null; for (const k of candidates(i)) { const u = ICONS.get(k); if (u) return u; } return null; }
  const img = i => { const u = find(i); return u ? `<img class="ico" src="${u}" alt="" loading="lazy">` : ""; };

  function idb() { return new Promise((res, rej) => { const r = indexedDB.open("tl", 1); r.onupgradeneeded = () => r.result.createObjectStore("icons"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
  async function load(hooks) {
    hooks = hooks || {};
    try { const r = await fetch("icons/index.json", { cache: "no-cache" }); if (r.ok) { for (const n of await r.json()) ICONS.set(n.replace(/\.[a-z0-9]+$/i, ""), "icons/" + n); aliases(); if (ICONS.size && hooks.onSite) hooks.onSite(ICONS.size); } } catch (e) {}
    try { const db = await idb(); const tx = db.transaction("icons"); const st = tx.objectStore("icons");
      await new Promise((res, rej) => { const cur = st.openCursor(); cur.onsuccess = () => { const c = cur.result; if (!c) return res(); ICONS.set(c.key, URL.createObjectURL(c.value)); c.continue(); }; cur.onerror = () => rej(cur.error); });
      if (ICONS.size && hooks.onPack) hooks.onPack(ICONS.size);
    } catch (e) {}
  }
  /** files: File[] (zip or images). Resolves to the number of icons available, or throws {code: "zip"|"idb"}. */
  async function importFiles(files) {
    const entries = [];
    for (const f of files) {
      if (/\.zip$/i.test(f.name)) {
        if (typeof JSZip === "undefined") throw Object.assign(new Error("zip reader not loaded"), { code: "zip" });
        const z = await JSZip.loadAsync(f);
        for (const [p, e] of Object.entries(z.files)) if (!e.dir && /\.(png|webp|jpe?g|gif|svg)$/i.test(p)) entries.push([p.split("/").pop(), await e.async("blob")]);
      } else entries.push([f.name, f]);
    }
    let db; try { db = await idb(); } catch (e) { throw Object.assign(new Error("IndexedDB unavailable"), { code: "idb" }); }
    const tx = db.transaction("icons", "readwrite"); const st = tx.objectStore("icons");
    for (const [name, blob] of entries) { const key = name.replace(/\.[a-z0-9]+$/i, ""); st.put(blob, key); const old = ICONS.get(key); if (old) URL.revokeObjectURL(old); ICONS.set(key, URL.createObjectURL(blob)); }
    await new Promise(res => { tx.oncomplete = res; tx.onerror = res; });
    aliases();
    return ICONS.size;
  }

  root.Icons = { load, import: importFiles, find, img, candidates, size: () => ICONS.size, slug };
})(typeof self !== "undefined" ? self : this);
