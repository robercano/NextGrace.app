// GET /api/auth/callback → verify Steam OpenID response, create session, fetch public profile (name, avatar).
import { handler, bad, sha256, randomToken, setCookie, ensureSchema } from "../../_lib.js";
import { refreshOwnership } from "../../_steam.js";
export const onRequestGet = handler(async ({ request, env }) => {
  const url = new URL(request.url);
  const q = url.searchParams;
  if (q.get("openid.mode") !== "id_res") return bad("login cancelled", 400);
  const claimed = q.get("openid.claimed_id") || "";
  const m = claimed.match(/^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/);
  if (!m) return bad("bad claimed id", 400);
  // verify with Steam (check_authentication)
  const v = new URLSearchParams(); for (const [k, val] of q) if (k.startsWith("openid.")) v.set(k, val); v.set("openid.mode", "check_authentication");
  const r = await fetch("https://steamcommunity.com/openid/login", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: v.toString() });
  const txt = await r.text();
  if (!/is_valid\s*:\s*true/.test(txt)) return bad("steam verification failed", 401);
  const steamid = m[1];
  // public profile (XML endpoint, no API key needed)
  let name = null, avatar = null;
  try { const px = await (await fetch(`https://steamcommunity.com/profiles/${steamid}/?xml=1`)).text(); name = (px.match(/<steamID><!\[CDATA\[(.*?)\]\]><\/steamID>/) || [])[1] || null; avatar = (px.match(/<avatarMedium><!\[CDATA\[(.*?)\]\]><\/avatarMedium>/) || [])[1] || null; } catch (e) {}
  await env.DB.prepare("INSERT INTO users (steamid, name, avatar) VALUES (?, ?, ?) ON CONFLICT(steamid) DO UPDATE SET name = COALESCE(excluded.name, name), avatar = COALESCE(excluded.avatar, avatar), last_seen = datetime('now')").bind(steamid, name, avatar).run();
  // advisor access: ask Steam whether the account owns the game (skipped for manual decisions; see functions/_steam.js)
  try { await ensureSchema(env); const cur = await env.DB.prepare("SELECT steamid, advisor FROM users WHERE steamid = ?").bind(steamid).first(); if (cur) await refreshOwnership(env, cur); } catch (e) { console.error("ownership", e); }
  const tok = randomToken(), id = await sha256(tok), days = 30;
  await env.DB.prepare("INSERT INTO sessions (id, steamid, expires_at) VALUES (?, ?, datetime('now', ?))").bind(id, steamid, `+${days} days`).run();
  await env.DB.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
  return new Response(null, { status: 302, headers: { location: "/#status", "set-cookie": setCookie("tl_session", tok, days * 86400) } });
});
