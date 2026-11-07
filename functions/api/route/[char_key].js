// GET    /api/route/:char_key           → { route: { title, stops: [{name, kind, why, done}], source, updated_at } | null }
// PUT    /api/route/:char_key           body { title?, stops: [{name, why?, done?}], source? } → replaces the route (owner only)
// PATCH  /api/route/:char_key           body { i, done } → ticks one stop
// DELETE /api/route/:char_key
import { handler, requireUser, readJson, json, bad } from "../../_lib.js";
import { stopIndex, cleanStops, getRoute, putRoute, ensureRoutes } from "../../_routes.js";

async function own(context, u, ck) {
  const row = await context.env.DB.prepare("SELECT owner FROM characters WHERE char_key = ?").bind(ck).first();
  if (!row) throw bad("unknown character; sync characters first", 404);
  if (row.owner !== u.steamid) throw bad("not your character", 403);
}
const ck = context => decodeURIComponent(context.params.char_key);

export const onRequestGet = handler(async context => {
  const u = await requireUser(context); const k = ck(context); await own(context, u, k);
  return json({ route: await getRoute(context.env, k) });
});

export const onRequestPut = handler(async context => {
  const u = await requireUser(context); const k = ck(context); await own(context, u, k);
  const body = await readJson(context.request);
  const stops = cleanStops(await stopIndex(context), body.stops);
  await putRoute(context.env, k, u.steamid, { title: body.title, stops, source: body.source === "advisor" ? "user" : body.source || "user" });
  return json({ route: await getRoute(context.env, k) });
});

export const onRequestPatch = handler(async context => {
  const u = await requireUser(context); const k = ck(context); await own(context, u, k);
  const body = await readJson(context.request); const r = await getRoute(context.env, k); if (!r) throw bad("no route", 404);
  const i = body.i | 0; if (i < 0 || i >= r.stops.length) throw bad("bad index");
  r.stops[i].done = !!body.done; await putRoute(context.env, k, u.steamid, r);
  return json({ route: await getRoute(context.env, k) });
});

export const onRequestDelete = handler(async context => {
  const u = await requireUser(context); const k = ck(context); await own(context, u, k); await ensureRoutes(context.env);
  await context.env.DB.prepare("DELETE FROM routes WHERE char_key = ?").bind(k).run();
  return json({ ok: true });
});
