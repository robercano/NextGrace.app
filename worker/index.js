// Worker entry (Cloudflare Workers + static assets). Routes /api/* to the same handlers that
// Pages Functions would use (functions/api/**) and serves everything else from the assets binding.
import * as health from "../functions/api/health.js";
import * as me from "../functions/api/me.js";
import * as characters from "../functions/api/characters.js";
import * as marks from "../functions/api/marks/[char_key].js";
import * as markers from "../functions/api/markers/index.js";
import * as marker from "../functions/api/markers/[id].js";
import * as adminMarkers from "../functions/api/admin/markers.js";
import * as advisor from "../functions/api/advisor.js";
import * as adminAdvisor from "../functions/api/admin/advisor.js";
import * as adminIcons from "../functions/api/admin/icons.js";
import { serveIcon, iconsEnabled } from "../functions/_icons.js";
import * as authSteam from "../functions/api/auth/steam.js";
import * as authCallback from "../functions/api/auth/callback.js";
import * as authLogout from "../functions/api/auth/logout.js";
import * as advice from "../functions/api/advice/[char_key].js";
import * as route from "../functions/api/route/[char_key].js";
import * as connections from "../functions/api/connections.js";
import { handler } from "../functions/_lib.js";
import { metadata, resourceMetadata, register, authorize, token } from "../functions/_oauth.js";
import { mcp } from "../functions/mcp.js";
import * as history from "../functions/api/history/[char_key].js";

// [pattern, module]; ":name" captures one path segment into context.params.name
const ROUTES = [
  ["/api/health", health],
  ["/api/me", me],
  ["/api/characters", characters],
  ["/api/marks/:char_key", marks],
  ["/api/markers", markers],
  ["/api/markers/:id", marker],
  ["/api/admin/markers", adminMarkers],
  ["/api/advisor", advisor],
  ["/api/admin/advisor", adminAdvisor],
  ["/api/admin/icons", adminIcons],
  ["/api/admin/icons/:name", adminIcons],
  ["/api/admin/icons/map/:name", adminIcons],
  ["/api/auth/steam", authSteam],
  ["/api/auth/callback", authCallback],
  ["/api/auth/logout", authLogout],
  ["/api/advice/:char_key", advice],
  ["/api/route/:char_key", route],
  ["/api/connections", connections],
  ["/api/history/:char_key", history],
].map(([p, mod]) => ({ parts: p.split("/"), mod }));

function match(pathname) {
  const segs = pathname.replace(/\/+$/, "").split("/");
  for (const r of ROUTES) {
    if (r.parts.length !== segs.length) continue;
    const params = {}; let ok = true;
    for (let i = 0; i < segs.length; i++) {
      if (r.parts[i].startsWith(":")) params[r.parts[i].slice(1)] = segs[i];
      else if (r.parts[i] !== segs[i]) { ok = false; break; }
    }
    if (ok) return { mod: r.mod, params };
  }
  return null;
}
const METHOD = { GET: "onRequestGet", HEAD: "onRequestGet", POST: "onRequestPost", PUT: "onRequestPut", DELETE: "onRequestDelete", PATCH: "onRequestPatch", OPTIONS: "onRequestOptions" };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const m = match(url.pathname);
      if (!m) return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { "content-type": "application/json" } });
      const fn = m.mod[METHOD[request.method]] || m.mod.onRequest;
      if (!fn) return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405, headers: { "content-type": "application/json", allow: Object.keys(METHOD).filter(k => m.mod[METHOD[k]]).join(", ") } });
      return fn({ request, env, params: m.params, waitUntil: ctx.waitUntil.bind(ctx), passThroughOnException: ctx.passThroughOnException.bind(ctx), data: {}, next: () => env.ASSETS.fetch(request) });
    }
    // OAuth server + MCP endpoint (functions/_oauth.js, functions/mcp.js): claude.ai and other MCP clients connect here
    const ctxOf = () => ({ request, env, params: {}, waitUntil: ctx.waitUntil.bind(ctx), data: {} });
    switch (url.pathname) {
      case "/.well-known/oauth-authorization-server": return metadata(request);
      case "/.well-known/oauth-protected-resource": case "/.well-known/oauth-protected-resource/mcp": return resourceMetadata(request);
      case "/oauth/register": if (request.method === "POST") return handler(register)(ctxOf()); break;
      case "/oauth/authorize": if (request.method === "GET" || request.method === "POST") return handler(authorize)(ctxOf()); break;
      case "/oauth/token": if (request.method === "POST") return handler(token)(ctxOf()); break;
      case "/mcp": return handler(mcp)(ctxOf());
    }
    // item icons and map backgrounds: from the R2 bucket when it is configured (functions/_icons.js), else from the assets
    if ((url.pathname.startsWith("/icons/") || url.pathname === "/icons/index.json") && iconsEnabled(env) && (request.method === "GET" || request.method === "HEAD")) return serveIcon(request, env, url, ctx);
    // html_handling = "none" keeps exact paths (map.html, icons.html); only map "/" (and "dir/") to index.html here.
    if (url.pathname.endsWith("/")) { url.pathname += "index.html"; return env.ASSETS.fetch(new Request(url, request)); }
    return env.ASSETS.fetch(request);
  },
};
