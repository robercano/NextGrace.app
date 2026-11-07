// GET /api/auth/callback → verify Steam OpenID response, create session, fetch public profile (name, avatar).
import { handler, bad, sha256, randomToken, setCookie, ensureSchema, cookies } from "../../_lib.js";
import { refreshOwnership } from "../../_steam.js";
export const onRequestGet = handler(async ({ request, env }) => {
  const url = new URL(request.url);
  const q = url.searchParams;
  if (q.get("openid.mode") !== "id_res") return bad("login cancelled", 400);
  const claimed = q.get("openid.claimed_id") || "";
  const m = claimed.match(/^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/);
  if (!m) return bad("bad claimed id", 400);
  // The same Steam answer can reach us twice (an installed PWA and the browser both opening the return URL, a reload…) and Steam
  // validates each response_nonce only once. Remember verified nonces for a few minutes so a second arrival still signs in.
  const nonce = q.get("openid.response_nonce") || "";
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS openid_nonces (nonce TEXT PRIMARY KEY, steamid TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')))").run();
  const seen = nonce ? await env.DB.prepare("SELECT steamid FROM openid_nonces WHERE nonce = ? AND steamid = ? AND created_at > datetime('now', '-5 minutes')").bind(nonce, m[1]).first() : null;
  // verify with Steam (check_authentication)
  const v = new URLSearchParams(); for (const [k, val] of q) if (k.startsWith("openid.")) v.set(k, val); v.set("openid.mode", "check_authentication");
  // Steam's check_authentication answers "ns:...\nis_valid:true"; a transient 5xx or an empty body gets one retry, and the
  // error carries what Steam said so a failure can be diagnosed from the browser.
  let txt = "", status = 0;
  for (let attempt = 0; attempt < (seen ? 0 : 2); attempt++) {
    try { const r = await fetch("https://steamcommunity.com/openid/login", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "text/plain" }, body: v.toString() }); status = r.status; txt = await r.text(); } catch (e) { txt = "fetch error: " + (e && e.message); status = 0; }
    if (/is_valid\s*:\s*true/.test(txt)) break;
    if (attempt === 0 && (status >= 500 || status === 0 || status === 429)) { await new Promise(res => setTimeout(res, 800)); continue; }
    break;
  }
  const valid = /is_valid\s*:\s*true/.test(txt);
  if (!valid && !seen) { console.error("steam verification failed", { status, txt: txt.slice(0, 200), nonce, ua: request.headers.get("user-agent") }); return bad(`steam verification failed (steam answered ${status}: ${txt.replace(/\s+/g, " ").slice(0, 160)})`, 401); }
  const steamid = m[1];
  if (valid && nonce) { await env.DB.prepare("INSERT OR IGNORE INTO openid_nonces (nonce, steamid) VALUES (?, ?)").bind(nonce, steamid).run(); await env.DB.prepare("DELETE FROM openid_nonces WHERE created_at < datetime('now', '-1 day')").run(); }
  // public profile (XML endpoint, no API key needed)
  let name = null, avatar = null;
  try { const px = await (await fetch(`https://steamcommunity.com/profiles/${steamid}/?xml=1`)).text(); name = (px.match(/<steamID><!\[CDATA\[(.*?)\]\]><\/steamID>/) || [])[1] || null; avatar = (px.match(/<avatarMedium><!\[CDATA\[(.*?)\]\]><\/avatarMedium>/) || [])[1] || null; } catch (e) {}
  await env.DB.prepare("INSERT INTO users (steamid, name, avatar) VALUES (?, ?, ?) ON CONFLICT(steamid) DO UPDATE SET name = COALESCE(excluded.name, name), avatar = COALESCE(excluded.avatar, avatar), last_seen = datetime('now')").bind(steamid, name, avatar).run();
  // advisor access: ask Steam whether the account owns the game (skipped for manual decisions; see functions/_steam.js)
  try { await ensureSchema(env); const cur = await env.DB.prepare("SELECT steamid, advisor FROM users WHERE steamid = ?").bind(steamid).first(); if (cur) await refreshOwnership(env, cur); } catch (e) { console.error("ownership", e); }
  const tok = randomToken(), id = await sha256(tok), days = 30;
  await env.DB.prepare("INSERT INTO sessions (id, steamid, expires_at) VALUES (?, ?, datetime('now', ?))").bind(id, steamid, `+${days} days`).run();
  await env.DB.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
  const next = cookies(request).tl_next || ""; const h = new Headers({ location: /^\/[^\/\\]/.test(next) ? next : "/#status" });
  h.append("set-cookie", setCookie("tl_session", tok, days * 86400)); if (next) h.append("set-cookie", setCookie("tl_next", "", 0));
  return new Response(null, { status: 302, headers: h });
});
