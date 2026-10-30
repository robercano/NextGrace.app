// GET  /api/markers?layer=tlb → approved markers (+ the caller's own pending/rejected ones)
// POST /api/markers → propose a marker (login). Body: { layer, x, y, item, kind, note }
import { handler, getUser, requireUser, readJson, json, bad } from "../../_lib.js";
export const onRequestGet = handler(async context => {
  const u = await getUser(context); const layer = new URL(context.request.url).searchParams.get("layer");
  const sql = "SELECT m.id, m.layer, m.x, m.y, m.item, m.kind, m.note, m.status, m.created_at, u.name AS by FROM markers m JOIN users u ON u.steamid = m.author WHERE (m.status = 'approved' OR m.author = ?)" + (layer ? " AND m.layer = ?" : "") + " ORDER BY m.id";
  const q = context.env.DB.prepare(sql); const { results } = await (layer ? q.bind(u ? u.steamid : "", layer) : q.bind(u ? u.steamid : "")).all();
  return json({ markers: results });
});
export const onRequestPost = handler(async context => {
  const u = await requireUser(context); const b = await readJson(context.request);
  if (!/^(tlb|gugr|sote)$/.test(b.layer || "")) return bad("bad layer");
  const x = +b.x, y = +b.y; if (!(x >= 0 && x <= 10000 && y >= 0 && y <= 10000)) return bad("bad coords");
  const item = String(b.item || "").slice(0, 80), note = String(b.note || "").slice(0, 300), kind = String(b.kind || "").slice(0, 24);
  if (!item && !note) return bad("item or note required");
  const pend = await context.env.DB.prepare("SELECT COUNT(*) AS n FROM markers WHERE author = ? AND status = 'pending'").bind(u.steamid).first();
  if (pend.n >= 200) return bad("too many pending markers", 429);
  const status = u.role === "admin" ? "approved" : "pending";
  const r = await context.env.DB.prepare("INSERT INTO markers (author, layer, x, y, item, kind, note, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, status").bind(u.steamid, b.layer, x, y, item || null, kind || null, note || null, status).first();
  return json({ ok: true, id: r.id, status: r.status });
});
