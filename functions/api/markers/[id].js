// DELETE /api/markers/:id → author (own pending) or admin
import { handler, requireUser, json, bad } from "../../_lib.js";
export const onRequestDelete = handler(async context => {
  const u = await requireUser(context); const id = +context.params.id;
  const row = await context.env.DB.prepare("SELECT author, status FROM markers WHERE id = ?").bind(id).first(); if (!row) return bad("not found", 404);
  if (u.role !== "admin" && !(row.author === u.steamid && row.status !== "approved")) return bad("forbidden", 403);
  await context.env.DB.prepare("DELETE FROM markers WHERE id = ?").bind(id).run();
  return json({ ok: true });
});
