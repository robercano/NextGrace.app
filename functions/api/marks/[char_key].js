// GET  /api/marks/:char_key → all marks for the character (owner only)
// PUT  /api/marks/:char_key → merge marks. Body: { marks: [{kind, ref, state, at}], remove: [{kind, ref}] }
import { handler, requireUser, readJson, json, bad } from "../../_lib.js";
async function own(context, u, charKey) {
  const row = await context.env.DB.prepare("SELECT owner FROM characters WHERE char_key = ?").bind(charKey).first();
  if (!row) return bad("unknown character; sync characters first", 404);
  if (row.owner !== u.steamid) return bad("not your character", 403);
  return null;
}
export const onRequestGet = handler(async context => {
  const u = await requireUser(context); const ck = decodeURIComponent(context.params.char_key); const e = await own(context, u, ck); if (e) return e;
  const { results } = await context.env.DB.prepare("SELECT kind, ref, state, at, updated_at FROM marks WHERE char_key = ?").bind(ck).all();
  return json({ marks: results });
});
export const onRequestPut = handler(async context => {
  const u = await requireUser(context); const ck = decodeURIComponent(context.params.char_key); const e = await own(context, u, ck); if (e) return e;
  const body = await readJson(context.request, 1024 * 1024); const stmts = [];
  for (const m of (body.marks || []).slice(0, 5000)) { if (!/^(place|item|boss|grace)$/.test(m.kind) || typeof m.ref !== "string" && typeof m.ref !== "number") continue;
    stmts.push(context.env.DB.prepare("INSERT INTO marks (char_key, kind, ref, state, at, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now')) ON CONFLICT(char_key, kind, ref) DO UPDATE SET state = excluded.state, at = excluded.at, updated_at = datetime('now')").bind(ck, m.kind, String(m.ref), String(m.state || "done").slice(0, 16), String(m.at || "").slice(0, 10))); }
  for (const m of (body.remove || []).slice(0, 5000)) stmts.push(context.env.DB.prepare("DELETE FROM marks WHERE char_key = ? AND kind = ? AND ref = ?").bind(ck, String(m.kind), String(m.ref)));
  if (stmts.length) await context.env.DB.batch(stmts);
  const { results } = await context.env.DB.prepare("SELECT kind, ref, state, at FROM marks WHERE char_key = ?").bind(ck).all();
  return json({ marks: results });
});
