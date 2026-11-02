// Advisor access (who may spend the Claude key). See docs/ARCHITECTURE.md → "Advisor access".
// GET  /api/advisor                         → { state, enabled, checkedAt, contact, requestedAt, configured }
// POST /api/advisor { action: "check" }     → re-check ownership with the Steam Web API (at most once a minute per user)
// POST /api/advisor { action: "request", contact, note } → ask for manual activation (profile private / false negative)
import { handler, requireUser, readJson, json, bad, advisorEnabled } from "../_lib.js";
import { refreshOwnership } from "../_steam.js";
import { notifyAdmin } from "../_mail.js";

const view = (u, env) => ({ state: u.role === "admin" ? "admin" : u.advisor, enabled: advisorEnabled(u), checkedAt: u.advisor_checked_at || null, contact: u.contact || null, requestedAt: u.advisor_requested_at || null, configured: !!env.STEAM_API_KEY });

export const onRequestGet = handler(async context => {
  const u = await requireUser(context);
  if (u.role !== "admin" && (u.advisor === "unknown" || u.advisor === "error" || u.advisor === "unavailable")) u.advisor = await refreshOwnership(context.env, u);
  return json(view(u, context.env));
});

export const onRequestPost = handler(async context => {
  const u = await requireUser(context); const b = await readJson(context.request, 16 * 1024);
  if (b.action === "check") {
    const last = u.advisor_checked_at ? Date.parse(u.advisor_checked_at + "Z") : 0;
    if (Date.now() - last < 60e3) return bad("checked a moment ago; try again in a minute", 429);
    u.advisor = await refreshOwnership(context.env, u); u.advisor_checked_at = new Date().toISOString().slice(0, 19).replace("T", " ");
    return json(view(u, context.env));
  }
  if (b.action === "request") {
    if (advisorEnabled(u)) return json(view(u, context.env));
    const contact = String(b.contact || "").trim().slice(0, 120), note = String(b.note || "").trim().slice(0, 600);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) return bad("a valid e-mail address is required");
    await context.env.DB.prepare("UPDATE users SET advisor = 'requested', contact = ?, advisor_note = ?, advisor_requested_at = datetime('now') WHERE steamid = ?").bind(contact, note || null, u.steamid).run();
    u.advisor = "requested"; u.contact = contact; u.advisor_requested_at = new Date().toISOString().slice(0, 19).replace("T", " ");
    await notifyAdmin(context.env, "Next Grace: advisor activation request", `Steam: ${u.name || "?"} (${u.steamid})\nhttps://steamcommunity.com/profiles/${u.steamid}\nContact: ${contact}\nPrevious state: ${b.previous || "?"}\n\n${note || "(no note)"}\n\nReview it in the account sheet → Moderation.`);
    return json(view(u, context.env));
  }
  return bad("bad action");
});
