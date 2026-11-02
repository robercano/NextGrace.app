// GET  /api/admin/advisor → manual activation requests + spend stats   |   POST /api/admin/advisor { steamid, action: approve|reject, note? }
import { handler, requireUser, isAdmin, readJson, json, bad, ensureSchema } from "../../_lib.js";
import { ADVICE_LIMITS } from "../advice/[char_key].js";
export const onRequestGet = handler(async context => {
  const u = await requireUser(context); if (!isAdmin(u)) return bad("admin only", 403);
  await ensureSchema(context.env); const DB = context.env.DB;
  const { results } = await DB.prepare("SELECT steamid, name, contact, advisor_note AS note, advisor_requested_at AS at FROM users WHERE advisor = 'requested' ORDER BY advisor_requested_at").all();
  const day = await DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(in_tokens), 0) AS tin, COALESCE(SUM(out_tokens), 0) AS tout FROM advice_log WHERE created_at > datetime('now', '-1 day')").first();
  const month = await DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(in_tokens), 0) AS tin, COALESCE(SUM(out_tokens), 0) AS tout, COUNT(DISTINCT steamid) AS users FROM advice_log WHERE created_at > datetime('now', '-30 days')").first();
  const access = await DB.prepare("SELECT advisor, COUNT(*) AS n FROM users GROUP BY advisor").all();
  return json({ requests: results, stats: { day, month, access: Object.fromEntries(access.results.map(r => [r.advisor, r.n])), limits: ADVICE_LIMITS } });
});
export const onRequestPost = handler(async context => {
  const u = await requireUser(context); if (!isAdmin(u)) return bad("admin only", 403);
  const b = await readJson(context.request); const st = b.action === "approve" ? "manual" : b.action === "reject" ? "denied" : b.action === "revoke" ? "none" : null; if (!st || !/^\d{17}$/.test(String(b.steamid || ""))) return bad("bad action");
  await context.env.DB.prepare("UPDATE users SET advisor = ?, advisor_note = COALESCE(?, advisor_note), advisor_checked_at = datetime('now') WHERE steamid = ?").bind(st, b.note ? String(b.note).slice(0, 600) : null, String(b.steamid)).run();
  return json({ ok: true });
});
