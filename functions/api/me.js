// GET    /api/me → current user (or null) + their characters.
// DELETE /api/me → delete the account and everything linked to it (privacy.html describes exactly this):
//   users, sessions, characters + history, marks, advice + advice_log, pending/rejected markers.
//   Approved markers stay on the community map, re-attributed to the placeholder user "deleted" (markers.author is NOT NULL).
import { handler, getUser, requireUser, json, setCookie } from "../_lib.js";
export const onRequestGet = handler(async context => {
  const u = await getUser(context); if (!u) return json({ user: null });
  const { results } = await context.env.DB.prepare("SELECT char_key, name, level, class, playtime, summary, updated_at FROM characters WHERE owner = ? ORDER BY updated_at DESC").bind(u.steamid).all();
  return json({ user: u, characters: results.map(r => ({ ...r, summary: r.summary ? JSON.parse(r.summary) : null })) });
});

export const onRequestDelete = handler(async context => {
  const u = await requireUser(context); const DB = context.env.DB;
  const { results } = await DB.prepare("SELECT char_key FROM characters WHERE owner = ?").bind(u.steamid).all();
  const keys = results.map(r => r.char_key);
  const stmts = [DB.prepare("INSERT OR IGNORE INTO users (steamid, name, role) VALUES ('deleted', 'deleted account', 'user')")];
  for (const ck of keys) {
    stmts.push(DB.prepare("DELETE FROM marks WHERE char_key = ?").bind(ck), DB.prepare("DELETE FROM advice WHERE char_key = ?").bind(ck));
  }
  stmts.push(
    DB.prepare("DELETE FROM advice_log WHERE steamid = ?").bind(u.steamid),
    DB.prepare("DELETE FROM markers WHERE author = ? AND status != 'approved'").bind(u.steamid),
    DB.prepare("UPDATE markers SET author = 'deleted' WHERE author = ?").bind(u.steamid),
    DB.prepare("DELETE FROM characters WHERE owner = ?").bind(u.steamid),
    DB.prepare("DELETE FROM sessions WHERE steamid = ?").bind(u.steamid),
    DB.prepare("DELETE FROM users WHERE steamid = ?").bind(u.steamid),
  );
  // history is created lazily by /api/characters; it may not exist yet
  try { for (const ck of keys) await DB.prepare("DELETE FROM history WHERE char_key = ?").bind(ck).run(); } catch (e) { if (!/no such table/i.test(String(e && e.message))) throw e; }
  await DB.batch(stmts);
  return json({ ok: true, characters: keys.length }, 200, { "set-cookie": setCookie("tl_session", "", 0) });
});
