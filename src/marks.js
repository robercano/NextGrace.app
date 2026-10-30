/* marks.js — manual progress marks per character ("visited", "done", "got").
 * Storage-agnostic: today localStorage, later a remote store with the same shape.
 *
 * Key: `${steamId}:${slot}` (survives renames). Entry: { k: "place"|"item"|"boss"|"grace", id: string, s: "done", at: "YYYY-MM-DD" }
 * Public API: Marks.load(charKey) -> Set of "k:id"; Marks.set(charKey, k, id, on); Marks.all(charKey) -> entries; Marks.export()/import().
 */
(function (root) {
  const LS = "tl.marks.v1";
  let db = null; // { [charKey]: { [k:id]: entry } }
  function read() { if (db) return db; try { db = JSON.parse(localStorage.getItem(LS) || "{}"); } catch (e) { db = {}; } return db; }
  function write() { try { localStorage.setItem(LS, JSON.stringify(db)); } catch (e) {} }
  const key = (k, id) => k + ":" + id;
  const Marks = {
    charKey(c) { return (c.steamId || "0") + ":" + c.slot; },
    load(charKey) { const d = read()[charKey] || {}; return new Set(Object.keys(d)); },
    has(charKey, k, id) { const d = read()[charKey] || {}; return !!d[key(k, id)]; },
    set(charKey, k, id, on, at) { const d = read(); d[charKey] = d[charKey] || {}; if (on) d[charKey][key(k, id)] = { k, id: String(id), s: "done", at: at || new Date().toISOString().slice(0, 10) }; else delete d[charKey][key(k, id)]; write(); },
    toggle(charKey, k, id) { const on = !Marks.has(charKey, k, id); Marks.set(charKey, k, id, on); return on; },
    all(charKey) { return Object.values(read()[charKey] || {}); },
    count(charKey, k) { return Marks.all(charKey).filter(e => e.k === k).length; },
    export() { return JSON.stringify(read(), null, 1); },
    import(json) { const inc = JSON.parse(json); const d = read(); for (const ck in inc) { d[ck] = Object.assign(d[ck] || {}, inc[ck]); } write(); },
  };
  root.Marks = Marks;
})(typeof self !== "undefined" ? self : this);
