// OAuth 2.1 authorization server for the MCP endpoint (/mcp), so claude.ai (and any MCP client) can connect on the user's
// behalf. The identity is the site's Steam login: the consent page requires the tl_session cookie, so an unauthenticated
// user is first sent through /api/auth/steam?next=… and comes back to the same consent URL.
//
//   GET  /.well-known/oauth-authorization-server   RFC 8414 metadata        GET /.well-known/oauth-protected-resource  RFC 9728
//   POST /oauth/register                           dynamic client registration (RFC 7591), public clients only
//   GET  /oauth/authorize?…                         consent page (PKCE S256 required)      POST /oauth/authorize  approve/deny
//   POST /oauth/token                              authorization_code (+ PKCE) and refresh_token grants
//
// Tokens are random and stored hashed (like sessions). Access tokens last ACCESS_DAYS, refresh tokens REFRESH_DAYS and rotate.
// Who may connect: MCP_BETA ("admins" during the beta, else anyone the advisor is enabled for).
import { json, bad, sha256, randomToken, cookies, getUser, advisorEnabled } from "./_lib.js";

export const MCP_BETA = "admins"; // "admins" | "advisor"
export const SCOPES = ["read", "write"];
const ACCESS_DAYS = 1, REFRESH_DAYS = 90, CODE_MIN = 10;

let ready = false;
export async function ensureOauth(env) {
  if (ready) return;
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS oauth_clients (client_id TEXT PRIMARY KEY, name TEXT, redirect_uris TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS oauth_codes (code TEXT PRIMARY KEY, client_id TEXT NOT NULL, redirect_uri TEXT NOT NULL, challenge TEXT NOT NULL, scope TEXT, steamid TEXT NOT NULL, resource TEXT, expires_at TEXT NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS oauth_tokens (id TEXT PRIMARY KEY, kind TEXT NOT NULL, client_id TEXT NOT NULL, steamid TEXT NOT NULL, scope TEXT, pair TEXT, expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS oauth_consents (nonce TEXT PRIMARY KEY, steamid TEXT NOT NULL, expires_at TEXT NOT NULL)"),
  ]);
  ready = true;
}

export const mcpAllowed = (u, env) => !!u && (u.role === "admin" || (MCP_BETA !== "admins" && advisorEnabled(u, env)));
const origin = request => new URL(request.url).origin;
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function s256(s) { return b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))); }
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const err = (error, description, status = 400) => json({ error, error_description: description }, status);

export function metadata(request) {
  const o = origin(request);
  return json({
    issuer: o, authorization_endpoint: o + "/oauth/authorize", token_endpoint: o + "/oauth/token", registration_endpoint: o + "/oauth/register",
    response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"], code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"], scopes_supported: SCOPES, service_documentation: o + "/about.html",
  }, 200, { "cache-control": "public, max-age=3600" });
}
export function resourceMetadata(request) {
  const o = origin(request);
  return json({ resource: o + "/mcp", authorization_servers: [o], scopes_supported: SCOPES, bearer_methods_supported: ["header"], resource_name: "Next Grace" }, 200, { "cache-control": "public, max-age=3600" });
}

export async function register(context) {
  await ensureOauth(context.env);
  let b; try { b = await context.request.json(); } catch (e) { return err("invalid_client_metadata", "JSON body expected"); }
  const uris = Array.isArray(b.redirect_uris) ? b.redirect_uris.filter(u => typeof u === "string" && /^https:\/\//.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)/.test(u)).slice(0, 10) : [];
  if (!uris.length) return err("invalid_redirect_uri", "https redirect_uris required");
  if (b.token_endpoint_auth_method && b.token_endpoint_auth_method !== "none") return err("invalid_client_metadata", "public clients only (token_endpoint_auth_method: none)");
  const client_id = "ng_" + randomToken(16), name = String(b.client_name || "MCP client").slice(0, 80);
  await context.env.DB.prepare("INSERT INTO oauth_clients (client_id, name, redirect_uris) VALUES (?, ?, ?)").bind(client_id, name, JSON.stringify(uris)).run();
  return json({ client_id, client_name: name, redirect_uris: uris, token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], client_id_issued_at: Math.floor(Date.now() / 1000) }, 201);
}

async function client(env, id) { const c = await env.DB.prepare("SELECT client_id, name, redirect_uris FROM oauth_clients WHERE client_id = ?").bind(id).first(); if (c) c.uris = JSON.parse(c.redirect_uris); return c; }

/** GET: consent page (after Steam login). POST: the user's answer. */
export async function authorize(context) {
  await ensureOauth(context.env);
  const { request, env } = context; const url = new URL(request.url);
  const q = request.method === "POST" ? new URLSearchParams(await request.text()) : url.searchParams;
  const client_id = q.get("client_id") || "", redirect_uri = q.get("redirect_uri") || "", state = q.get("state") || "", challenge = q.get("code_challenge") || "";
  const scope = (q.get("scope") || SCOPES.join(" ")).split(/[\s+]+/).filter(s => SCOPES.includes(s)).join(" ") || "read", resource = q.get("resource") || "";
  const c = await client(env, client_id); if (!c) return err("invalid_client", "unknown client_id");
  if (!c.uris.includes(redirect_uri)) return err("invalid_request", "redirect_uri not registered");
  const back = (params) => new Response(null, { status: 302, headers: { location: redirect_uri + (redirect_uri.includes("?") ? "&" : "?") + new URLSearchParams(Object.assign(state ? { state } : {}, params)).toString() } });
  if (q.get("response_type") !== "code") return back({ error: "unsupported_response_type" });
  if (!challenge || (q.get("code_challenge_method") || "S256") !== "S256") return back({ error: "invalid_request", error_description: "PKCE S256 required" });
  const u = await getUser(context);
  if (!u) { const next = url.pathname + url.search; if (request.method === "POST") return err("access_denied", "session expired; open the link again"); return new Response(null, { status: 302, headers: { location: "/api/auth/steam?next=" + encodeURIComponent(next) } }); }
  if (!mcpAllowed(u, env)) return page(`<h1>Next Grace</h1><p>${esc(u.name || u.steamid)}: ${lang(request) === "en" ? "the MCP connector is in private beta; this account is not in it yet." : "el conector MCP está en beta privada; esta cuenta todavía no está en ella."}</p>`, 403);
  if (request.method === "GET") {
    const nonce = randomToken(16);
    await env.DB.prepare("INSERT INTO oauth_consents (nonce, steamid, expires_at) VALUES (?, ?, datetime('now', '+10 minutes'))").bind(nonce, u.steamid).run();
    const en = lang(request) === "en";
    const hidden = ["client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method", "response_type", "scope", "resource"].map(k => `<input type="hidden" name="${k}" value="${esc(q.get(k) || "")}">`).join("");
    return page(`<h1>Next Grace</h1>
<p><b>${esc(c.name)}</b> ${en ? "wants to use your Next Grace account" : "quiere usar tu cuenta de Next Grace"} (${esc(u.name || u.steamid)}).</p>
<ul><li>${en ? "Read your characters, reports, pending bosses and graces, missing items" : "Leer tus personajes, informes, jefes y gracias pendientes, objetos que te faltan"}</li>
${scope.includes("write") ? `<li>${en ? "Write routes on your map" : "Escribir rutas en tu mapa"}</li>` : ""}</ul>
<p class="s">${en ? "Never your save file: the account only holds summaries. You can revoke this from Account → Connections." : "Nunca tu archivo de partida: la cuenta solo guarda resúmenes. Puedes revocarlo en Cuenta → Conexiones."}</p>
<form method="post" action="/oauth/authorize">${hidden}<input type="hidden" name="nonce" value="${nonce}">
<button name="decision" value="allow" class="p">${en ? "Allow" : "Permitir"}</button> <button name="decision" value="deny">${en ? "Cancel" : "Cancelar"}</button></form>`);
  }
  // POST
  const nonce = q.get("nonce") || ""; const n = await env.DB.prepare("SELECT steamid FROM oauth_consents WHERE nonce = ? AND expires_at > datetime('now')").bind(nonce).first();
  await env.DB.prepare("DELETE FROM oauth_consents WHERE nonce = ? OR expires_at < datetime('now')").bind(nonce).run();
  if (!n || n.steamid !== u.steamid) return err("access_denied", "consent expired; open the link again");
  if (q.get("decision") !== "allow") return back({ error: "access_denied" });
  const code = randomToken(24);
  await env.DB.prepare("INSERT INTO oauth_codes (code, client_id, redirect_uri, challenge, scope, steamid, resource, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', ?))").bind(code, client_id, redirect_uri, challenge, scope, u.steamid, resource, `+${CODE_MIN} minutes`).run();
  return back({ code });
}

export async function token(context) {
  await ensureOauth(context.env);
  const { request, env } = context; const ct = request.headers.get("content-type") || ""; let q;
  if (ct.includes("json")) q = new URLSearchParams(Object.entries(await request.json().catch(() => ({})))); else q = new URLSearchParams(await request.text());
  const grant = q.get("grant_type"), client_id = q.get("client_id") || "";
  const c = await client(env, client_id); if (!c) return err("invalid_client", "unknown client_id", 401);
  if (grant === "authorization_code") {
    const row = await env.DB.prepare("SELECT * FROM oauth_codes WHERE code = ?").bind(q.get("code") || "").first();
    await env.DB.prepare("DELETE FROM oauth_codes WHERE code = ? OR expires_at < datetime('now')").bind(q.get("code") || "").run(); // single use
    if (!row || row.client_id !== client_id || Date.parse(row.expires_at + "Z") < Date.now()) return err("invalid_grant", "code unknown or expired");
    if (row.redirect_uri !== (q.get("redirect_uri") || "")) return err("invalid_grant", "redirect_uri mismatch");
    if (!q.get("code_verifier") || await s256(q.get("code_verifier")) !== row.challenge) return err("invalid_grant", "PKCE verification failed");
    return issue(env, client_id, row.steamid, row.scope);
  }
  if (grant === "refresh_token") {
    const id = await sha256(q.get("refresh_token") || "");
    const row = await env.DB.prepare("SELECT * FROM oauth_tokens WHERE id = ? AND kind = 'refresh' AND expires_at > datetime('now')").bind(id).first();
    if (!row || row.client_id !== client_id) return err("invalid_grant", "refresh token unknown or expired");
    await env.DB.prepare("DELETE FROM oauth_tokens WHERE id = ? OR pair = ?").bind(id, id).run(); // rotate: the old pair dies
    return issue(env, client_id, row.steamid, row.scope);
  }
  return err("unsupported_grant_type", "authorization_code or refresh_token");
}

async function issue(env, client_id, steamid, scope) {
  const access = randomToken(32), refresh = randomToken(32), aid = await sha256(access), rid = await sha256(refresh);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO oauth_tokens (id, kind, client_id, steamid, scope, pair, expires_at) VALUES (?, 'access', ?, ?, ?, ?, datetime('now', ?))").bind(aid, client_id, steamid, scope, rid, `+${ACCESS_DAYS} days`),
    env.DB.prepare("INSERT INTO oauth_tokens (id, kind, client_id, steamid, scope, pair, expires_at) VALUES (?, 'refresh', ?, ?, ?, ?, datetime('now', ?))").bind(rid, client_id, steamid, scope, aid, `+${REFRESH_DAYS} days`),
    env.DB.prepare("DELETE FROM oauth_tokens WHERE expires_at < datetime('now')"),
  ]);
  return json({ access_token: access, token_type: "Bearer", expires_in: ACCESS_DAYS * 86400, refresh_token: refresh, scope }, 200, { "cache-control": "no-store", pragma: "no-cache" });
}

/** The user behind a Bearer token (for /mcp), or null. */
export async function bearerUser(context) {
  const m = /^Bearer\s+(\S+)$/i.exec(context.request.headers.get("authorization") || ""); if (!m) return null;
  await ensureOauth(context.env);
  const t = await context.env.DB.prepare("SELECT t.steamid, t.scope, t.client_id, u.name, u.role, u.advisor FROM oauth_tokens t JOIN users u ON u.steamid = t.steamid WHERE t.id = ? AND t.kind = 'access' AND t.expires_at > datetime('now')").bind(await sha256(m[1])).first();
  if (!t) return null;
  return { steamid: t.steamid, name: t.name, role: t.role === "admin" || (context.env.ADMIN_STEAMIDS || "").split(",").map(s => s.trim()).includes(t.steamid) ? "admin" : "user", advisor: t.advisor, scope: (t.scope || "read").split(" "), client_id: t.client_id };
}

/** Connections listed in the account sheet, and revocation. */
export async function listGrants(env, steamid) {
  await ensureOauth(env);
  const { results } = await env.DB.prepare("SELECT t.client_id, c.name, MIN(t.created_at) AS since, MAX(t.expires_at) AS until, t.scope FROM oauth_tokens t LEFT JOIN oauth_clients c ON c.client_id = t.client_id WHERE t.steamid = ? AND t.kind = 'refresh' AND t.expires_at > datetime('now') GROUP BY t.client_id").bind(steamid).all();
  return results;
}
export async function revoke(env, steamid, client_id) {
  await ensureOauth(env);
  await env.DB.prepare("DELETE FROM oauth_tokens WHERE steamid = ? AND client_id = ?").bind(steamid, client_id).run();
}

const lang = request => /\ben\b/i.test((request.headers.get("accept-language") || "").split(",")[0]) ? "en" : "es";
function page(body, status = 200) {
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Next Grace</title>
<style>body{margin:0;background:#0b0a0a;color:#e8e2d2;font:17px/1.45 Georgia,"Times New Roman",serif;display:flex;justify-content:center}main{max-width:480px;padding:28px 20px}h1{font-size:1.2rem;letter-spacing:.12em;text-transform:uppercase;color:#d4b35a;margin:0 0 16px}ul{padding-left:20px}.s{color:#9a937f;font-size:.9rem}button{font:inherit;padding:8px 16px;background:none;color:#e8e2d2;border:1px solid #6b6657;cursor:pointer;margin-top:10px}button.p{border-color:#d4b35a;color:#d4b35a}</style></head><body><main>${body}</main></body></html>`, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
