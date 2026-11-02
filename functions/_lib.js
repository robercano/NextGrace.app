// Shared helpers for Pages Functions (Cloudflare Workers runtime).
export const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
export const bad = (msg, status = 400) => json({ error: msg }, status);

export function cookies(request) {
  const out = {}; for (const part of (request.headers.get("cookie") || "").split(";")) { const i = part.indexOf("="); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } return out;
}
export function setCookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
export async function sha256(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}
export function randomToken(bytes = 32) {
  const a = new Uint8Array(bytes); crypto.getRandomValues(a); return [...a].map(x => x.toString(16).padStart(2, "0")).join("");
}

// Columns added after the first schema (db/migrations/003_advisor_access.sql): created on the fly so a deploy never
// depends on someone running a migration by hand. Runs once per isolate.
let schemaReady = null;
export function ensureSchema(env) {
  if (!env.DB) return Promise.resolve();
  return schemaReady = schemaReady || (async () => {
    const cols = [["advisor", "TEXT NOT NULL DEFAULT 'unknown'"], ["advisor_checked_at", "TEXT"], ["contact", "TEXT"], ["advisor_note", "TEXT"], ["advisor_requested_at", "TEXT"]];
    for (const [c, t] of cols) { try { await env.DB.prepare(`ALTER TABLE users ADD COLUMN ${c} ${t}`).run(); } catch (e) { if (!/duplicate column/i.test(String(e && e.message))) { schemaReady = null; throw e; } } }
  })();
}
/** May this user spend the advisor (Claude) key? Owners of the game, manually approved users and admins. */
export const advisorEnabled = u => !!u && (u.role === "admin" || u.advisor === "owner" || u.advisor === "manual");

// Returns the user row for the session cookie, or null.
export async function getUser(context) {
  const { request, env } = context;
  const tok = cookies(request).tl_session; if (!tok || !env.DB) return null;
  await ensureSchema(env);
  const id = await sha256(tok);
  const row = await env.DB.prepare("SELECT u.steamid, u.name, u.avatar, u.role, u.advisor, u.advisor_checked_at, u.contact, u.advisor_requested_at, u.created_at FROM sessions s JOIN users u ON u.steamid = s.steamid WHERE s.id = ? AND s.expires_at > datetime('now')").bind(id).first();
  if (!row) return null;
  const admins = (env.ADMIN_STEAMIDS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (admins.includes(row.steamid)) row.role = "admin";
  return row;
}
export async function requireUser(context) {
  const u = await getUser(context); if (!u) throw new Response(JSON.stringify({ error: "login required" }), { status: 401, headers: { "content-type": "application/json" } }); return u;
}
export function isAdmin(u) { return u && u.role === "admin"; }

export async function readJson(request, max = 256 * 1024) {
  const len = +(request.headers.get("content-length") || 0); if (len > max) throw new Response("payload too large", { status: 413 });
  try { return await request.json(); } catch (e) { throw new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: { "content-type": "application/json" } }); }
}

// Wrap a handler so thrown Responses are returned and other errors become 500s.
export const handler = fn => async context => { try { return await fn(context); } catch (e) { if (e instanceof Response) return e; console.error(e); return bad("internal error: " + (e && e.message || e), 500); } };
