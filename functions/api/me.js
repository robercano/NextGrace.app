// GET /api/me → current user (or null) + their characters.
import { handler, getUser, json } from "../_lib.js";
export const onRequestGet = handler(async context => {
  const u = await getUser(context); if (!u) return json({ user: null });
  const { results } = await context.env.DB.prepare("SELECT char_key, name, level, class, playtime, summary, updated_at FROM characters WHERE owner = ? ORDER BY updated_at DESC").bind(u.steamid).all();
  return json({ user: u, characters: results.map(r => ({ ...r, summary: r.summary ? JSON.parse(r.summary) : null })) });
});
