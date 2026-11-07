// GET /api/auth/steam[?next=/path] → redirect to Steam OpenID login; `next` (a same-origin path) is where the callback sends the
// user afterwards (the OAuth consent page uses it), kept in a short cookie.
import { handler, setCookie } from "../../_lib.js";
export const onRequestGet = handler(async ({ request }) => {
  const url = new URL(request.url);
  const realm = url.origin, ret = realm + "/api/auth/callback";
  const p = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0", "openid.mode": "checkid_setup",
    "openid.return_to": ret, "openid.realm": realm,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select", "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });
  const next = url.searchParams.get("next") || ""; const headers = { location: "https://steamcommunity.com/openid/login?" + p.toString() };
  if (/^\/[^\/\\]/.test(next) && next.length < 2000) headers["set-cookie"] = setCookie("tl_next", next, 600);
  return new Response(null, { status: 302, headers });
});
