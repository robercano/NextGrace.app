// GET /api/auth/steam → redirect to Steam OpenID login.
import { handler } from "../../_lib.js";
export const onRequestGet = handler(async ({ request }) => {
  const url = new URL(request.url);
  const realm = url.origin, ret = realm + "/api/auth/callback";
  const p = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0", "openid.mode": "checkid_setup",
    "openid.return_to": ret, "openid.realm": realm,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select", "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });
  return Response.redirect("https://steamcommunity.com/openid/login?" + p.toString(), 302);
});
