// GET /api/health → { ok, db, admins, advisor, model }: quick check that the D1 binding, ADMIN_STEAMIDS and the advisor key are configured.
import { handler, json } from "../_lib.js";
export const onRequestGet = handler(async ({ env }) => { let db = false; try { await env.DB.prepare("SELECT 1").first(); db = true; } catch (e) {} return json({ ok: true, db, admins: !!env.ADMIN_STEAMIDS, advisor: !!(env.ANTHROPIC_API_KEY || env.ADVICE_MOCK), model: env.ADVICE_MODEL || "claude-sonnet-5-5" }); });
