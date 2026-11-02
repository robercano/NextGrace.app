// Admin upload of the icon pack into R2 (binding ICONS), straight from the browser (account sheet → "Subir iconos al servidor").
// PUT  /api/admin/icons/:name   body = image bytes; name = "<file>.webp" or "map/<file>.webp"   (one request per file)
// GET  /api/admin/icons         → { count, enabled }
// DELETE /api/admin/icons/:name
import { handler, requireUser, isAdmin, json, bad } from "../../_lib.js";
import { iconsEnabled, listIcons, invalidateIndex } from "../../_icons.js";
const NAME = /^(map\/)?[a-z0-9][a-z0-9_().'\- ]{0,120}\.(webp|png|jpg|jpeg|svg)$/i;
const TYPES = { webp: "image/webp", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", svg: "image/svg+xml" };
const nameOf = request => decodeURIComponent(new URL(request.url).pathname.replace(/^\/api\/admin\/icons\/?/, "")); // keeps "map/<file>"

export const onRequestGet = handler(async context => {
  const u = await requireUser(context); if (!isAdmin(u)) return bad("admin only", 403);
  if (!iconsEnabled(context.env)) return json({ enabled: false, count: 0 });
  return json({ enabled: true, count: (await listIcons(context.env)).length });
});
export const onRequestPut = handler(async context => {
  const u = await requireUser(context); if (!isAdmin(u)) return bad("admin only", 403);
  if (!iconsEnabled(context.env)) return bad("R2 bucket not configured (binding ICONS)", 503);
  const name = nameOf(context.request); if (!NAME.test(name)) return bad("bad file name");
  const len = +(context.request.headers.get("content-length") || 0); if (len > 4 * 1024 * 1024) return bad("file too large", 413);
  const ext = name.split(".").pop().toLowerCase();
  await context.env.ICONS.put("icons/" + name, context.request.body, { httpMetadata: { contentType: TYPES[ext] || "application/octet-stream" } });
  invalidateIndex();
  return json({ ok: true, name });
});
export const onRequestDelete = handler(async context => {
  const u = await requireUser(context); if (!isAdmin(u)) return bad("admin only", 403);
  if (!iconsEnabled(context.env)) return bad("R2 bucket not configured", 503);
  const name = nameOf(context.request); if (!NAME.test(name)) return bad("bad file name");
  await context.env.ICONS.delete("icons/" + name); invalidateIndex();
  return json({ ok: true });
});
