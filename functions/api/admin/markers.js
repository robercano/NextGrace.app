// GET  /api/admin/markers → pending queue   |   POST /api/admin/markers { id, action: approve|reject }
import { handler, requireUser, isAdmin, readJson, json, bad } from "../../_lib.js";
export const onRequestGet = handler(async context => {
  const u = await requireUser(context); if (!isAdmin(u)) return bad("admin only", 403);
  const { results } = await context.env.DB.prepare("SELECT m.*, u.name AS by FROM markers m JOIN users u ON u.steamid = m.author WHERE m.status = 'pending' ORDER BY m.id").all();
  return json({ markers: results });
});
export const onRequestPost = handler(async context => {
  const u = await requireUser(context); if (!isAdmin(u)) return bad("admin only", 403);
  const b = await readJson(context.request); const st = b.action === "approve" ? "approved" : b.action === "reject" ? "rejected" : null; if (!st) return bad("bad action");
  await context.env.DB.prepare("UPDATE markers SET status = ?, reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?").bind(st, u.steamid, +b.id).run();
  return json({ ok: true });
});
