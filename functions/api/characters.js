// PUT /api/characters → upsert character summaries for the logged-in user. Body: { characters: [{ char_key, name, level, class, playtime, summary }] }
import { handler, requireUser, readJson, json, bad } from "../_lib.js";
export const onRequestPut = handler(async context => {
  const u = await requireUser(context); const body = await readJson(context.request, 2 * 1024 * 1024);
  const list = Array.isArray(body.characters) ? body.characters.slice(0, 10) : [];
  const stmts = []; let skipped = 0;
  for (const c of list) {
    if (!/^\d+:\d$/.test(c.char_key || "")) return bad("bad char_key");
    // A character belongs to the Steam account that owns the save file (char_key = "<steamid>:<slot>").
    if (!c.char_key.startsWith(u.steamid + ":")) { skipped++; continue; }
    stmts.push(context.env.DB.prepare("INSERT INTO characters (char_key, owner, name, level, class, playtime, summary, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now')) ON CONFLICT(char_key) DO UPDATE SET owner = excluded.owner, name = excluded.name, level = excluded.level, class = excluded.class, playtime = excluded.playtime, summary = excluded.summary, updated_at = datetime('now') WHERE characters.owner = excluded.owner")
      .bind(c.char_key, u.steamid, String(c.name || "").slice(0, 32), c.level | 0, String(c.class || "").slice(0, 32), c.playtime | 0, JSON.stringify(c.summary || {}).slice(0, 600000)));
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
