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
  return json({ ok: true, count: stmts.length, skipped, reason: skipped ? "characters from another Steam account are not synced" : undefined });
});
