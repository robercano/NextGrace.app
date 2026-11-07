// MCP server (Streamable HTTP, JSON responses) at /mcp: lets an MCP client (claude.ai connectors, Claude Desktop, …) read a
// user's characters and write routes on their map, on the user's own subscription. Auth: OAuth bearer tokens issued by
// functions/_oauth.js (identity = the site's Steam login). Only JSON-RPC over POST; GET (server-initiated streams) is not offered.
//
// Tools (all take char_key from list_characters unless noted): list_characters · get_character · get_report · pending_bosses ·
// pending_graces · missing_items · find_places · get_route · set_route · add_stop · mark_stop · clear_route
import { json } from "./_lib.js";
import { bearerUser } from "./_oauth.js";
import { buildContext } from "./api/advice/[char_key].js";
import { stopIndex, cleanStops, getRoute, putRoute, ensureRoutes, MAX_STOPS } from "./_routes.js";

const PROTOCOL = "2025-06-18", VERSION = "1.0";
const CATALOG_CATS = new Set(["melee_armaments", "ranged_and_catalysts", "shields", "head", "chest", "arms", "legs", "talismans", "ashes_of_war", "ashes", "sorceries", "incantations", "key_items"]);
const CAT_LABEL = { melee_armaments: "weapon", ranged_and_catalysts: "ranged/catalyst", shields: "shield", head: "helm", chest: "chest armor", arms: "gauntlets", legs: "greaves", talismans: "talisman", ashes_of_war: "ash of war", ashes: "spirit ash", sorceries: "sorcery", incantations: "incantation", key_items: "key item" };

const TOOLS = [
  { name: "list_characters", description: "The user's Elden Ring characters known to Next Grace (summaries uploaded from their save). Returns char_key, name, class, level, playtime and when the summary was last updated. Call this first.", inputSchema: { type: "object", properties: {} } },
  { name: "get_character", description: "Full state of one character as the site's advisor sees it: attributes, HP/FP, flasks, equipped gear, usable weapons with real requirements and scaling, talismans, spells, spirit ashes, smithing stones, bosses and graces by region, last grace, and an indicative progression table. Big (10–30k characters); call once per conversation.", inputSchema: { type: "object", properties: { char_key: { type: "string" } }, required: ["char_key"] } },
  { name: "get_report", description: "The latest report the site's advisor wrote for this character (Markdown) and when.", inputSchema: { type: "object", properties: { char_key: { type: "string" } }, required: ["char_key"] } },
  { name: "pending_bosses", description: "Bosses not yet defeated, grouped by region (main bosses, field bosses, remembrance holders). Optional region filter (substring, e.g. 'Caelid').", inputSchema: { type: "object", properties: { char_key: { type: "string" }, region: { type: "string" } }, required: ["char_key"] } },
  { name: "pending_graces", description: "Sites of grace not yet discovered, by region. Optional region filter (substring).", inputSchema: { type: "object", properties: { char_key: { type: "string" }, region: { type: "string" } }, required: ["char_key"] } },
  { name: "missing_items", description: "Collectible items the character does not own (weapons, armor, talismans, ashes, spells, key items) with where to find them. Filter by category (weapon, shield, armor, talisman, ash of war, spirit ash, sorcery, incantation, key item), by a text query on the name or location (e.g. a region or dungeon name), and limit (default 40).", inputSchema: { type: "object", properties: { char_key: { type: "string" }, category: { type: "string" }, query: { type: "string" }, limit: { type: "integer" } }, required: ["char_key"] } },
  { name: "find_places", description: "Search the map's places, graces and bosses by name. Use it to get exact names for route stops. Returns name, kind and map layer (overworld / underground / DLC).", inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "integer" } }, required: ["query"] } },
  { name: "get_route", description: "The character's current route on the map (ordered stops, done flags, who wrote it).", inputSchema: { type: "object", properties: { char_key: { type: "string" } }, required: ["char_key"] } },
  { name: "set_route", description: "Replace the character's route on the map: an ordered list of 1–12 stops. Each stop needs the exact English name of a site of grace, boss or map place (use find_places) and a short 'why'. The user sees it on nextgrace.app → Map within 30 seconds.", inputSchema: { type: "object", properties: { char_key: { type: "string" }, title: { type: "string" }, stops: { type: "array", items: { type: "object", properties: { name: { type: "string" }, why: { type: "string" } }, required: ["name"] } } }, required: ["char_key", "stops"] } },
  { name: "add_stop", description: "Append one stop to the character's route (or insert at a position, 0-based).", inputSchema: { type: "object", properties: { char_key: { type: "string" }, name: { type: "string" }, why: { type: "string" }, position: { type: "integer" } }, required: ["char_key", "name"] } },
  { name: "mark_stop", description: "Mark a route stop (0-based index) as done or not done.", inputSchema: { type: "object", properties: { char_key: { type: "string" }, index: { type: "integer" }, done: { type: "boolean" } }, required: ["char_key", "index"] } },
  { name: "clear_route", description: "Delete the character's route.", inputSchema: { type: "object", properties: { char_key: { type: "string" } }, required: ["char_key"] } },
];

const rpc = (id, result) => ({ jsonrpc: "2.0", id, result });
const rpcErr = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });
const text = (s, isError) => ({ content: [{ type: "text", text: s }], isError: !!isError });
class ToolError extends Error {}

export async function mcp(context) {
  const { request, env } = context; const o = new URL(request.url).origin;
  if (request.method === "GET") return new Response("Method Not Allowed: this server answers JSON-RPC over POST only", { status: 405, headers: { allow: "POST, DELETE" } });
  if (request.method === "DELETE") return new Response(null, { status: 200 });
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST, DELETE" } });
  const u = await bearerUser(context);
  if (!u) return json({ error: "unauthorized" }, 401, { "www-authenticate": `Bearer resource_metadata="${o}/.well-known/oauth-protected-resource"` });
  let body; try { body = await request.json(); } catch (e) { return json(rpcErr(null, -32700, "parse error"), 400); }
  const msgs = Array.isArray(body) ? body : [body]; const out = [];
  for (const m of msgs) {
    if (!m || m.jsonrpc !== "2.0") { out.push(rpcErr(m && m.id || null, -32600, "invalid request")); continue; }
    if (m.id === undefined) continue; // notification
    try { out.push(rpc(m.id, await handle(context, u, m.method, m.params || {}))); }
    catch (e) { out.push(e instanceof RpcError ? rpcErr(m.id, e.code, e.message) : rpcErr(m.id, -32603, "internal error: " + (e && e.message))); }
  }
  if (!out.length) return new Response(null, { status: 202 });
  return json(Array.isArray(body) ? out : out[0]);
}
class RpcError extends Error { constructor(code, message) { super(message); this.code = code; } }

async function handle(context, u, method, params) {
  switch (method) {
    case "initialize": return { protocolVersion: PROTOCOL, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "Next Grace", version: VERSION }, instructions: "Next Grace holds summaries of the user's Elden Ring characters read from their PC save. Start with list_characters, then get_character for the one they mean. Item, boss and place names are the English ones (as on the wiki). To draw a route on the user's map use find_places for exact names, then set_route. Avoid story spoilers." };
    case "ping": return {};
    case "tools/list": return { tools: TOOLS };
    case "tools/call": {
      const fn = tools[params.name]; if (!fn) throw new RpcError(-32602, "unknown tool: " + params.name);
      try { return text(await fn(context, u, params.arguments || {})); }
      catch (e) { if (e instanceof ToolError) return text(e.message, true); throw e; }
    }
    default: throw new RpcError(-32601, "method not found: " + method);
  }
}

// ---- data helpers
async function asset(context, path) { const r = await context.env.ASSETS.fetch(new Request(new URL(path, context.request.url))); if (!r.ok) throw new Error("asset " + path); return r.json(); }
async function charRow(context, u, ck) {
  if (!ck) throw new ToolError("char_key is required (see list_characters)");
  const row = await context.env.DB.prepare("SELECT char_key, owner, name, level, class, playtime, summary, updated_at FROM characters WHERE char_key = ?").bind(ck).first();
  if (!row || row.owner !== u.steamid) throw new ToolError("unknown char_key for this account (see list_characters)");
  row.S = JSON.parse(row.summary || "{}"); return row;
}
const needWrite = u => { if (!u.scope.includes("write")) throw new ToolError("this connection has no write permission"); };
const regionOk = (r, f) => !f || String(r || "").toLowerCase().includes(String(f).toLowerCase());
const hours = s => Math.round((s || 0) / 360) / 10;

const tools = {
  async list_characters(context, u) {
    const { results } = await context.env.DB.prepare("SELECT char_key, name, level, class, playtime, updated_at FROM characters WHERE owner = ? ORDER BY updated_at DESC").bind(u.steamid).all();
    if (!results.length) return "No characters yet: the user has to open their save on nextgrace.app while signed in.";
    return results.map(r => `- char_key: ${r.char_key} · ${r.name} · ${r.class} level ${r.level} · ${hours(r.playtime)} h played · summary updated ${r.updated_at} UTC`).join("\n");
  },
  async get_character(context, u, a) {
    const row = await charRow(context, u, a.char_key);
    const [FLAGS, PROG] = await Promise.all([asset(context, "/data/flags.json"), asset(context, "/data/progression.json")]);
    return buildContext(row, row.S, FLAGS, PROG) + "\n\n(Labels in this data are in Spanish; the names of items, bosses and places are the English ones.)";
  },
  async get_report(context, u, a) {
    const row = await charRow(context, u, a.char_key);
    const r = await context.env.DB.prepare("SELECT text, created_at FROM advice WHERE char_key = ?").bind(row.char_key).first();
    return r ? `Report written ${r.created_at} UTC:\n\n${r.text}` : "No report yet for this character.";
  },
  async pending_bosses(context, u, a) {
    const row = await charRow(context, u, a.char_key); const F = await asset(context, "/data/flags.json"); const done = new Set((row.S.progress || {}).bosses || []);
    const by = {}; for (const b of F.bosses) { if (done.has(b.id) || !regionOk(b.region, a.region)) continue; (by[b.region] = by[b.region] || []).push(`${b.name}${b.type === "main" ? " [main]" : ""}${b.rem ? " [remembrance]" : ""}`); }
    const keys = Object.keys(by); if (!keys.length) return "No pending bosses" + (a.region ? ` in "${a.region}"` : "") + ".";
    return keys.map(r => `${r} (${by[r].length}):\n  ${by[r].join("\n  ")}`).join("\n");
  },
  async pending_graces(context, u, a) {
    const row = await charRow(context, u, a.char_key); const F = await asset(context, "/data/flags.json"); const seen = new Set((row.S.progress || {}).graces || []);
    const by = {}; for (const g of F.graces) { if (seen.has(g.id) || !regionOk(g.region, a.region)) continue; (by[g.region] = by[g.region] || []).push(g.name); }
    const keys = Object.keys(by); if (!keys.length) return "No pending graces" + (a.region ? ` in "${a.region}"` : "") + ".";
    return keys.map(r => `${r} (${by[r].length}): ${by[r].join("; ")}`).join("\n");
  },
  async missing_items(context, u, a) {
    const row = await charRow(context, u, a.char_key); const DB = await asset(context, "/data/items.json");
    const have = new Set(); const nm = id => { const e = DB.items[id]; return e ? e.n.replace(/\s\+\d+$/, "").toLowerCase() : null; };
    for (const id of row.S.haveKeys || []) { const e = DB.items[id] || DB.items[Math.floor(id / 10000) * 10000]; if (e) have.add(e.n.replace(/\s\+\d+$/, "").toLowerCase()); }
    const cat = (a.category || "").toLowerCase(), q = (a.query || "").toLowerCase(), limit = Math.min(Math.max(a.limit | 0 || 40, 1), 200);
    const catKeys = Object.keys(CAT_LABEL).filter(k => !cat || CAT_LABEL[k].includes(cat) || k.includes(cat) || (cat === "armor" && ["head", "chest", "arms", "legs"].includes(k)));
    const out = [];
    for (const [id, e] of Object.entries(DB.items)) {
      if (e.f || !CATALOG_CATS.has(e.c) || !catKeys.includes(e.c)) continue;
      if (e.k === "weapon" && (+id) % 10000) continue; if (e.c === "ashes" && /\s\+\d+$/.test(e.n)) continue;
      if (have.has(e.n.toLowerCase())) continue;
      const loc = (e.loc || "").replace(/\s+/g, " ").trim();
      if (q && !e.n.toLowerCase().includes(q) && !loc.toLowerCase().includes(q)) continue;
      out.push(`- ${e.n} (${CAT_LABEL[e.c]}${e.dlc ? ", DLC" : ""})${loc ? ": " + loc.slice(0, 220) : ""}`);
    }
    if (!out.length) return "Nothing missing for that filter.";
    return `${out.length} missing${out.length > limit ? `, first ${limit}` : ""}:\n` + out.slice(0, limit).join("\n");
  },
  async find_places(context, u, a) {
    const idx = await stopIndex(context); const P = await asset(context, "/data/places.json"); const byName = new Map(P.places.map(p => [p.name.toLowerCase(), p]));
    const q = String(a.query || "").toLowerCase().trim(); if (!q) throw new ToolError("query is required");
    const limit = Math.min(Math.max(a.limit | 0 || 15, 1), 50); const out = [];
    for (const v of idx.values()) { if (!v.name.toLowerCase().includes(q)) continue; const p = byName.get(v.name.toLowerCase()); const layer = p ? ((p.layer || "").includes("GUGR") ? "underground" : (p.layer || "").includes("SOTE") ? "DLC" : "overworld") : "?"; out.push(`- ${v.name} (${v.kind}, ${layer}${p && p.region ? ", region" : ""})`); if (out.length >= limit) break; }
    return out.length ? out.join("\n") : "No place matches.";
  },
  async get_route(context, u, a) {
    const row = await charRow(context, u, a.char_key); const r = await getRoute(context.env, row.char_key);
    if (!r) return "No route for this character.";
    return `${r.title || "Route"} (by ${r.source}, updated ${r.updated_at} UTC):\n` + r.stops.map((s, i) => `${i + 1}. [${s.done ? "x" : " "}] ${s.name} (${s.kind})${s.why ? " — " + s.why : ""}`).join("\n");
  },
  async set_route(context, u, a) {
    needWrite(u); const row = await charRow(context, u, a.char_key);
    if (!Array.isArray(a.stops) || !a.stops.length) throw new ToolError("stops must be a non-empty list");
    if (a.stops.length > MAX_STOPS) throw new ToolError(`at most ${MAX_STOPS} stops`);
    let stops; try { stops = cleanStops(await stopIndex(context), a.stops); } catch (e) { throw new ToolError("no usable stops"); }
    await putRoute(context.env, row.char_key, u.steamid, { title: a.title || "", stops, source: "mcp" });
    const unknown = stops.filter(s => s.kind === "text").map(s => s.name);
    return `Route saved with ${stops.length} stops; the user sees it on the map.` + (unknown.length ? ` These names matched no map place and are listed without a pin: ${unknown.join(", ")} (use find_places for exact names).` : "");
  },
  async add_stop(context, u, a) {
    needWrite(u); const row = await charRow(context, u, a.char_key); const r = (await getRoute(context.env, row.char_key)) || { title: "", stops: [], source: "mcp" };
    if (r.stops.length >= MAX_STOPS) throw new ToolError(`the route already has ${MAX_STOPS} stops`);
    const [s] = cleanStops(await stopIndex(context), [{ name: a.name, why: a.why }]);
    const pos = a.position === undefined ? r.stops.length : Math.min(Math.max(a.position | 0, 0), r.stops.length); r.stops.splice(pos, 0, s);
    await putRoute(context.env, row.char_key, u.steamid, { title: r.title, stops: r.stops, source: "mcp" });
    return `Added "${s.name}" at position ${pos + 1}${s.kind === "text" ? " (no map pin: name matched no place)" : ""}; ${r.stops.length} stops now.`;
  },
  async mark_stop(context, u, a) {
    needWrite(u); const row = await charRow(context, u, a.char_key); const r = await getRoute(context.env, row.char_key); if (!r) throw new ToolError("no route");
    const i = a.index | 0; if (i < 0 || i >= r.stops.length) throw new ToolError("index out of range");
    r.stops[i].done = a.done !== false; await putRoute(context.env, row.char_key, u.steamid, r);
    return `"${r.stops[i].name}" marked ${r.stops[i].done ? "done" : "not done"}.`;
  },
  async clear_route(context, u, a) {
    needWrite(u); const row = await charRow(context, u, a.char_key); await ensureRoutes(context.env);
    await context.env.DB.prepare("DELETE FROM routes WHERE char_key = ?").bind(row.char_key).run(); return "Route deleted.";
  },
};
