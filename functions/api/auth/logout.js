import { handler, cookies, sha256, setCookie, json } from "../../_lib.js";
export const onRequestPost = handler(async ({ request, env }) => {
  const tok = cookies(request).tl_session; if (tok) await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256(tok)).run();
  return json({ ok: true }, 200, { "set-cookie": setCookie("tl_session", "", 0) });
});
