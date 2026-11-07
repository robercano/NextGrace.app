// Routes: an ordered list of stops a character should visit next, written by the advisor (from its report), by the user
// (map panel) or by an agent (MCP, later). Stored per character in D1 (table routes, one row per character, JSON).
// A stop = { name, why, kind, done }. The names are matched against the game data (bosses, graces, map places) so the map
// can pin them; a name that matches nothing is kept with kind "text" (listed, not pinned).
import { bad } from "./_lib.js";

export const MAX_STOPS = 12;
let ready = false;
export async function ensureRoutes(env) {
  if (ready) return;
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS routes (char_key TEXT PRIMARY KEY, owner TEXT NOT NULL, title TEXT, json TEXT NOT NULL, source TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now')))").run();
  ready = true;
}

const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Index of pinnable names: Map(normalized name → { name, kind }) from flags.json (bosses, graces) and places.json (places). */
export async function stopIndex(context) {
  const get = async p => { const r = await context.env.ASSETS.fetch(new Request(new URL(p, context.request.url))); return r.ok ? r.json() : null; };
  const [F, P] = await Promise.all([get("/data/flags.json"), get("/data/places.json")]);
  const idx = new Map();
  const add = (n, kind) => { const k = norm(n); if (k && !idx.has(k)) idx.set(k, { name: n, kind }); };
  if (P) for (const p of P.places || []) add(p.name, "place");
  if (F) { for (const g of F.graces || []) add(g.name, "grace"); for (const b of F.bosses || []) add(b.name, "boss"); }
  return idx;
}

/** Resolve a free-text name: exact (normalized), then "Grace: X" / "Boss: X" prefixes, then a unique substring match. */
export function resolveStop(idx, name) {
  const raw = String(name || "").trim().slice(0, 80); if (!raw) return null;
  const k = norm(raw.replace(/^(grace|gracia|boss|jefe|site of grace)\s*[:\-–]\s*/i, ""));
  const hit = idx.get(k); if (hit) return hit;
  const subs = []; for (const [kk, v] of idx) { if (kk.includes(k) || k.includes(kk) && kk.length > 6) { subs.push(v); if (subs.length > 2) break; } }
  return subs.length === 1 ? subs[0] : null;
}

/** Validate + normalize a stops list from any source; throws a Response (bad) on a malformed body. */
export function cleanStops(idx, stops) {
  if (!Array.isArray(stops)) throw bad("stops must be a list");
  const out = [];
  for (const s of stops.slice(0, MAX_STOPS)) {
    if (!s || typeof s !== "object") continue;
    const name = String(s.name || "").trim().slice(0, 80); if (!name) continue;
    const r = resolveStop(idx, name);
    out.push({ name: r ? r.name : name, kind: r ? r.kind : "text", why: String(s.why || "").trim().slice(0, 200), done: !!s.done });
  }
  if (!out.length) throw bad("no usable stops");
  return out;
}

export async function getRoute(env, ck) {
  await ensureRoutes(env);
  const row = await env.DB.prepare("SELECT title, json, source, updated_at FROM routes WHERE char_key = ?").bind(ck).first();
  if (!row) return null;
  let stops = []; try { stops = JSON.parse(row.json); } catch (e) {}
  return { title: row.title || "", stops, source: row.source || "", updated_at: row.updated_at };
}

export async function putRoute(env, ck, owner, route) {
  await ensureRoutes(env);
  await env.DB.prepare("INSERT INTO routes (char_key, owner, title, json, source, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now')) ON CONFLICT(char_key) DO UPDATE SET title = excluded.title, json = excluded.json, source = excluded.source, updated_at = datetime('now')")
    .bind(ck, owner, String(route.title || "").slice(0, 120), JSON.stringify(route.stops), String(route.source || "user").slice(0, 20)).run();
}

/** The advisor's report may end with a ```route fenced JSON list; split it off → { text, stops|null }. */
export function splitRouteBlock(text) {
  const m = /```route\s*([\s\S]*?)```\s*$/i.exec(text || "");
  if (!m) return { text, stops: null };
  let stops = null; try { stops = JSON.parse(m[1]); } catch (e) { try { stops = JSON.parse(m[1].replace(/,\s*\]$/, "]")); } catch (e2) {} }
  return { text: text.slice(0, m.index).replace(/\s+$/, ""), stops: Array.isArray(stops) ? stops : null };
}
