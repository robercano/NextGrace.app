// PUT /api/characters → upsert character summaries for the logged-in user. Body: { characters: [{ char_key, name, level, class, playtime, summary }] }
import { handler, requireUser, readJson, json, bad } from "../_lib.js";
// The summary is built by the browser (Cloud.summarize) and cannot be verified against the save, so it is bounded here: a real
// character never exceeds these sizes, and a fabricated one must not be able to inflate the advisor's prompt.
const CAPS = { weapons: 400, talismans: 160, spells: 12, spellsOwned: 150, ashes: 300, keyItems: 300 }, STR = 80, MAX_BYTES = 64 * 1024;
function sanitizeSummary(S) {
  if (!S || typeof S !== "object" || Array.isArray(S)) return {};
  const str = v => typeof v === "string" ? v.slice(0, STR) : v;
  const out = {};
  for (const [k, v] of Object.entries(S)) {
    if (Array.isArray(v)) out[k] = v.slice(0, CAPS[k] || 500).map(x => typeof x === "string" ? str(x) : (x && typeof x === "object" && !Array.isArray(x)) ? Object.fromEntries(Object.entries(x).slice(0, 12).map(([a, b]) => [a.slice(0, 16), typeof b === "string" ? str(b) : (b && typeof b === "object") ? JSON.parse(JSON.stringify(b).slice(0, 200) || "null") : b])) : (typeof x === "number" ? x : null));
    else if (v && typeof v === "object") out[k] = Object.fromEntries(Object.entries(v).slice(0, 40).map(([a, b]) => [a.slice(0, 32), Array.isArray(b) ? b.slice(0, 500).map(x => typeof x === "string" ? str(x) : x) : typeof b === "string" ? str(b) : (b && typeof b === "object") ? Object.fromEntries(Object.entries(b).slice(0, 40).map(([c, d]) => [c.slice(0, 32), typeof d === "string" ? str(d) : d])) : b]));
    else out[k] = str(v);
  }
  let json = JSON.stringify(out);
  if (json.length > MAX_BYTES) { for (const k of ["ashes", "keyItems", "spellsOwned", "weapons", "talismans"]) { if (json.length <= MAX_BYTES) break; if (Array.isArray(out[k])) out[k] = out[k].slice(0, Math.ceil(out[k].length / 2)); json = JSON.stringify(out); } }
  return out;
}
export const onRequestPut = handler(async context => {
  const u = await requireUser(context); const body = await readJson(context.request, 2 * 1024 * 1024);
  const list = Array.isArray(body.characters) ? body.characters.slice(0, 10) : [];
  const stmts = []; let skipped = 0;
  for (const c of list) {
    if (!/^\d+:\d$/.test(c.char_key || "")) return bad("bad char_key");
    // A character belongs to the Steam account that owns the save file (char_key = "<steamid>:<slot>").
    if (!c.char_key.startsWith(u.steamid + ":")) { skipped++; continue; }
    stmts.push(context.env.DB.prepare("INSERT INTO characters (char_key, owner, name, level, class, playtime, summary, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now')) ON CONFLICT(char_key) DO UPDATE SET owner = excluded.owner, name = excluded.name, level = excluded.level, class = excluded.class, playtime = excluded.playtime, summary = excluded.summary, updated_at = datetime('now') WHERE characters.owner = excluded.owner")
      .bind(c.char_key, u.steamid, String(c.name || "").slice(0, 32), c.level | 0, String(c.class || "").slice(0, 32), c.playtime | 0, JSON.stringify(sanitizeSummary(c.summary))));
  }
  if (stmts.length) await context.env.DB.batch(stmts);
  // session diary: keep a compact snapshot whenever the playtime moved (one row per play session, not per upload)
  try {
    await context.env.DB.prepare("CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY AUTOINCREMENT, char_key TEXT NOT NULL, playtime INTEGER, snap TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')))").run();
    await context.env.DB.prepare("CREATE INDEX IF NOT EXISTS history_char ON history(char_key, id)").run();
    const hist = [];
    for (const c of list) {
      if (!c.char_key.startsWith(u.steamid + ":")) continue;
      const S = c.summary || {}, p = S.progress || {};
      const snap = { level: c.level | 0, playtime: c.playtime | 0, deaths: S.deaths | 0, runes: S.totalRunes | 0, stats: S.stats || null, graces: p.graces || [], bosses: p.bosses || [], items: S.itemCount | 0,
        weapons: (S.weapons || []).filter(w => w.lvl > 0).map(w => [w.n + (w.inf ? " (" + w.inf + ")" : ""), w.lvl]), flasks: S.flasks || null, spells: (S.spellsOwned || []).length, talismans: (S.talismans || []).length };
      const last = await context.env.DB.prepare("SELECT playtime FROM history WHERE char_key = ? ORDER BY id DESC LIMIT 1").bind(c.char_key).first();
      if (!last || last.playtime !== snap.playtime) hist.push(context.env.DB.prepare("INSERT INTO history (char_key, playtime, snap) VALUES (?, ?, ?)").bind(c.char_key, snap.playtime, JSON.stringify(snap)));
    }
    if (hist.length) await context.env.DB.batch(hist);
  } catch (e) { console.error("history", e); }
  return json({ ok: true, count: stmts.length, skipped, reason: skipped ? "characters from another Steam account are not synced" : undefined });
});
