// GET /api/history/:char_key → snapshots of the character over time (owner only), oldest first; ?limit=N (default 60)
import { handler, requireUser, json, bad } from "../../_lib.js";
export const onRequestGet = handler(async context => {
  const u = await requireUser(context); const ck = decodeURIComponent(context.params.char_key);
  const row = await context.env.DB.prepare("SELECT owner FROM characters WHERE char_key = ?").bind(ck).first();
  if (!row) return bad("unknown character", 404); if (row.owner !== u.steamid) return bad("not your character", 403);
  const limit = Math.min(500, +(new URL(context.request.url).searchParams.get("limit") || 60));
  let results = [];
  try { ({ results } = await context.env.DB.prepare("SELECT id, playtime, snap, created_at FROM history WHERE char_key = ? ORDER BY id DESC LIMIT ?").bind(ck, limit).all()); } catch (e) { results = []; }
  return json({ history: results.reverse().map(r => ({ id: r.id, at: r.created_at, ...JSON.parse(r.snap) })) });
});
