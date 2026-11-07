// GET  /api/connections            → { connections: [{ client_id, name, since, until, scope }] }  (OAuth grants of this account, for the account sheet)
// POST /api/connections            body { action: "revoke", client_id }
import { handler, requireUser, readJson, json, bad } from "../_lib.js";
import { listGrants, revoke } from "../_oauth.js";
export const onRequestGet = handler(async context => { const u = await requireUser(context); return json({ connections: await listGrants(context.env, u.steamid) }); });
export const onRequestPost = handler(async context => {
  const u = await requireUser(context); const b = await readJson(context.request);
  if (b.action !== "revoke" || !b.client_id) throw bad("action revoke + client_id");
  await revoke(context.env, u.steamid, String(b.client_id)); return json({ ok: true, connections: await listGrants(context.env, u.steamid) });
});
