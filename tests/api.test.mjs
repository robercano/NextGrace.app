// API tests against the local Worker started by tests/run.sh (BASE env). node:test, no dependencies.
// Accounts come from tests/seed.sql: test-admin (moderator), test-user (advisor approved), test-nobody.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import vm from "node:vm";

const BASE = process.env.BASE || "http://127.0.0.1:8797";
const ADMIN = "76561198000000001", OTHER = "76561198000000002";
const CK = ADMIN + ":1", CK2 = OTHER + ":0";
const j = async (path, opts = {}, cookie = "test-admin") => {
  const r = await fetch(BASE + path, { ...opts, headers: { "content-type": "application/json", cookie: `tl_session=${cookie}`, ...(opts.headers || {}) }, body: opts.body && typeof opts.body !== "string" ? JSON.stringify(opts.body) : opts.body });
  const text = await r.text(); let body = null; try { body = JSON.parse(text); } catch (e) { body = text; }
  return { status: r.status, body, headers: r.headers };
};
const summary = (level, extra = {}) => ({ level, class: "Prophet", ng: 0, playtime: 3600, deaths: 3, stats: { vig: 20, min: 15, end: 12, str: 10, dex: 10, int: 7, fai: 24, arc: 8 }, hp: 700, fp: 100, sp: 100,
  equipped: { rh: ["Finger Seal"], lh: [], talismans: [], greatRune: null }, progress: { bosses: [], graces: [], picked: [], regions: [] }, itemCount: 2, haveKeys: [1073742015], weapons: [{ n: "Finger Seal", lvl: 0, max: 25 }], talismans: [], spells: [], spellsOwned: [], ashes: [], stones: {}, keyItems: ["Godrick's Great Rune"], ...extra });

test("health", async () => { const r = await j("/api/health", {}, ""); assert.equal(r.status, 200); assert.equal(r.body.ok, true); assert.equal(r.body.db, true); });

test("anonymous is refused where it must be", async () => {
  for (const p of ["/api/route/" + CK, "/api/advice/" + CK, "/api/connections", "/api/advisor"]) { const r = await j(p, {}, "nope"); assert.equal(r.status, 401, p); }
});

test("characters: own summaries only, sanitized", async () => {
  const r = await j("/api/characters", { method: "PUT", body: { characters: [{ char_key: CK, name: "Arcano", level: 64, class: "Prophet", playtime: 3600, summary: summary(64) }, { char_key: CK2, name: "Not mine", level: 1, class: "Wretch", summary: summary(1) }] } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const me = await j("/api/me"); assert.equal(me.status, 200); assert.equal(me.body.user.steamid, ADMIN);
  const r2 = await j("/api/characters", { method: "PUT", body: { characters: [{ char_key: CK2, name: "Other's", level: 30, class: "Wretch", summary: summary(30) }] } }, "test-user"); assert.equal(r2.status, 200);
});

test("advisor gate: closed mode", async () => {
  const a = await j("/api/advisor"); assert.equal(a.status, 200); assert.equal(a.body.enabled, true); // admin
  const b = await j("/api/advisor", {}, "test-user"); assert.equal(b.body.enabled, true); // manual approval
  const c = await j("/api/advisor", {}, "test-nobody"); assert.equal(c.body.enabled, false); assert.equal(c.body.mode, "closed");
});

test("advisor (mock): report streamed, stored, and its route block becomes the route", async () => {
  const r = await fetch(BASE + "/api/advice/" + encodeURIComponent(CK) + "?lang=es", { method: "POST", headers: { "content-type": "application/json", cookie: "tl_session=test-admin" }, body: JSON.stringify({ force: true }) });
  assert.equal(r.status, 200); const text = await r.text(); assert.match(text, /mock/); // (the mock answers at once, without the heartbeat stream)
  const g = await j("/api/advice/" + encodeURIComponent(CK) + "?lang=es"); assert.equal(g.status, 200); assert.ok(g.body.advice && g.body.advice.text.includes("(mock)")); assert.ok(!g.body.advice.text.includes("```route"), "route block stripped from the report");
  const rt = await j("/api/route/" + encodeURIComponent(CK)); assert.equal(rt.body.route.source, "advisor"); assert.ok(rt.body.route.stops.length >= 3);
  const kinds = rt.body.route.stops.map(s => s.kind); assert.ok(kinds.includes("text"), "unknown names are kept as text: " + kinds);
  const ctx = await j("/api/advice/" + encodeURIComponent(CK) + "?ctx=1"); assert.equal(ctx.status, 200); assert.ok(ctx.body.context.length > 200); assert.ok(ctx.body.advice);
});

test("routes: put/patch/delete, ownership", async () => {
  const put = await j("/api/route/" + encodeURIComponent(CK), { method: "PUT", body: { title: "T", stops: [{ name: "Church of Elleh", why: "a" }, { name: "stormveil castle" }, { name: "Nowhere Land" }] } });
  assert.equal(put.status, 200); const s = put.body.route.stops; assert.equal(s.length, 3); assert.equal(s[1].name, "Stormveil Castle"); assert.equal(s[2].kind, "text"); assert.equal(put.body.route.source, "user");
  const pa = await j("/api/route/" + encodeURIComponent(CK), { method: "PATCH", body: { i: 1, done: true } }); assert.equal(pa.body.route.stops[1].done, true);
  const other = await j("/api/route/" + encodeURIComponent(CK), {}, "test-user"); assert.equal(other.status, 403);
  const bad = await j("/api/route/" + encodeURIComponent(CK), { method: "PUT", body: { stops: [] } }); assert.equal(bad.status, 400);
  const del = await j("/api/route/" + encodeURIComponent(CK), { method: "DELETE" }); assert.equal(del.status, 200);
  const g = await j("/api/route/" + encodeURIComponent(CK)); assert.equal(g.body.route, null);
});

test("gamedata and icons are served from the bucket, with the asset fallback", async () => {
  const g = await fetch(BASE + "/gamedata/graces_pos.json"); assert.equal(g.status, 200); assert.equal(g.headers.get("x-source"), "r2"); assert.match(g.headers.get("cache-control"), /max-age=3600/);
  const edge = await fetch(BASE + "/gamedata/graces_pos.json"); assert.ok(["edge", "r2"].includes(edge.headers.get("x-source")));
  const miss = await fetch(BASE + "/gamedata/nope.json"); assert.equal(miss.status, 404);
  const idx = await fetch(BASE + "/icons/index.json"); assert.equal(idx.status, 200); assert.ok(Array.isArray(await idx.json()));
});

test("oauth + mcp: registration, consent, PKCE, tools, revocation", async () => {
  const meta = await (await fetch(BASE + "/.well-known/oauth-authorization-server")).json(); assert.equal(meta.code_challenge_methods_supported[0], "S256");
  const res = await (await fetch(BASE + "/.well-known/oauth-protected-resource")).json(); assert.equal(res.resource, BASE + "/mcp");
  const reg = await (await fetch(BASE + "/oauth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_name: "Test client", redirect_uris: ["https://example.com/cb"] }) })).json();
  assert.ok(reg.client_id.startsWith("ng_"));
  const verifier = randomBytes(32).toString("base64url"), challenge = createHash("sha256").update(verifier).digest("base64url");
  const authUrl = `${BASE}/oauth/authorize?response_type=code&client_id=${reg.client_id}&redirect_uri=${encodeURIComponent("https://example.com/cb")}&state=st&code_challenge=${challenge}&code_challenge_method=S256&scope=read+write`;
  const anon = await fetch(authUrl, { redirect: "manual" }); assert.equal(anon.status, 302); assert.match(anon.headers.get("location"), /^\/api\/auth\/steam\?next=/);
  const nobody = await fetch(authUrl, { headers: { cookie: "tl_session=test-nobody" } }); assert.equal(nobody.status, 403); // MCP beta: moderators only
  const page = await (await fetch(authUrl, { headers: { cookie: "tl_session=test-admin" } })).text(); const nonce = /name="nonce" value="([^"]+)"/.exec(page)[1];
  const form = new URLSearchParams({ response_type: "code", client_id: reg.client_id, redirect_uri: "https://example.com/cb", state: "st", code_challenge: challenge, code_challenge_method: "S256", scope: "read write", nonce, decision: "allow" });
  const ok = await fetch(BASE + "/oauth/authorize", { method: "POST", redirect: "manual", headers: { cookie: "tl_session=test-admin", "content-type": "application/x-www-form-urlencoded" }, body: form });
  assert.equal(ok.status, 302); const loc = new URL(ok.headers.get("location")); const code = loc.searchParams.get("code"); assert.ok(code); assert.equal(loc.searchParams.get("state"), "st");
  const badTok = await (await fetch(BASE + "/oauth/token", { method: "POST", body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: reg.client_id, redirect_uri: "https://example.com/cb", code_verifier: "wrong" }) })).json();
  assert.equal(badTok.error, "invalid_grant");
  // the code is single-use: get another one
  const page2 = await (await fetch(authUrl, { headers: { cookie: "tl_session=test-admin" } })).text(); form.set("nonce", /name="nonce" value="([^"]+)"/.exec(page2)[1]);
  const ok2 = await fetch(BASE + "/oauth/authorize", { method: "POST", redirect: "manual", headers: { cookie: "tl_session=test-admin", "content-type": "application/x-www-form-urlencoded" }, body: form });
  const code2 = new URL(ok2.headers.get("location")).searchParams.get("code");
  const tok = await (await fetch(BASE + "/oauth/token", { method: "POST", body: new URLSearchParams({ grant_type: "authorization_code", code: code2, client_id: reg.client_id, redirect_uri: "https://example.com/cb", code_verifier: verifier }) })).json();
  assert.ok(tok.access_token && tok.refresh_token);
  const rpc = async (method, params, id = 1) => (await fetch(BASE + "/mcp", { method: "POST", headers: { authorization: "Bearer " + tok.access_token, "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) })).json();
  const unauth = await fetch(BASE + "/mcp", { method: "POST", body: "{}" }); assert.equal(unauth.status, 401); assert.match(unauth.headers.get("www-authenticate"), /resource_metadata/);
  const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } }); assert.equal(init.result.serverInfo.name, "Next Grace");
  const tools = await rpc("tools/list", {}); const names = tools.result.tools.map(t => t.name); for (const n of ["list_characters", "get_character", "missing_items", "find_places", "set_route"]) assert.ok(names.includes(n), n);
  const list = await rpc("tools/call", { name: "list_characters", arguments: {} }); assert.match(list.result.content[0].text, /Arcano/);
  const fp = await rpc("tools/call", { name: "find_places", arguments: { query: "altus highway" } }); assert.match(fp.result.content[0].text, /Altus Highway Junction \(grace, overworld, pinned\)/, "game-placed grace is pinned");
  const set = await rpc("tools/call", { name: "set_route", arguments: { char_key: CK, title: "MCP", stops: [{ name: "Altus Highway Junction", why: "x" }, { name: "Margit, the Fell Omen", why: "y" }] } }); assert.match(set.result.content[0].text, /Route saved with 2 stops/);
  const gr = await rpc("tools/call", { name: "get_route", arguments: { char_key: CK } }); assert.match(gr.result.content[0].text, /by mcp/);
  const foreign = await rpc("tools/call", { name: "get_route", arguments: { char_key: CK2 } }); assert.equal(foreign.result.isError, true);
  const bosses = await rpc("tools/call", { name: "pending_bosses", arguments: { char_key: CK, region: "Limgrave" } }); assert.match(bosses.result.content[0].text, /Tree Sentinel|Agheel/);
  const miss = await rpc("tools/call", { name: "missing_items", arguments: { char_key: CK, category: "talisman", limit: 3 } }); assert.match(miss.result.content[0].text, /missing/);
  const refreshed = await (await fetch(BASE + "/oauth/token", { method: "POST", body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: tok.refresh_token, client_id: reg.client_id }) })).json(); assert.ok(refreshed.access_token);
  const conns = await j("/api/connections"); assert.ok(conns.body.connections.some(c => c.client_id === reg.client_id));
  const rev = await j("/api/connections", { method: "POST", body: { action: "revoke", client_id: reg.client_id } }); assert.equal(rev.status, 200);
  const after = await fetch(BASE + "/mcp", { method: "POST", headers: { authorization: "Bearer " + refreshed.access_token, "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 9, method: "ping" }) }); assert.equal(after.status, 401, "revoked token is dead");
});

test("data: unobtainable rules name real items and bosses", () => {
  const items = JSON.parse(readFileSync("data/items.json", "utf8")).items, flags = JSON.parse(readFileSync("data/flags.json", "utf8")), rules = JSON.parse(readFileSync("data/unobtainable.json", "utf8")).rules;
  const names = new Set(Object.values(items).map(e => e.n)), bosses = new Set(flags.bosses.map(b => b.name));
  for (const r of rules) { for (const n of r.items) assert.ok(names.has(n), "item " + n); if (r.when.boss) assert.ok(bosses.has(r.when.boss), "boss " + r.when.boss); if (r.when.owns) assert.ok(names.has(r.when.owns), "owns " + r.when.owns); }
});

test("i18n: every Spanish key used in the pages has an English translation", () => {
  // run src/i18n.js in a sandbox as an English browser: T(key) returns the key itself when there is no translation
  const sandbox = { localStorage: { getItem: k => (k === "tl.lang" ? "en" : null), setItem() {} }, location: { href: "http://x/", search: "" }, navigator: { language: "en-GB" }, document: { documentElement: {} }, console };
  sandbox.self = sandbox; vm.createContext(sandbox); vm.runInContext(readFileSync("src/i18n.js", "utf8"), sandbox);
  const en = new Proxy({}, { has: (_, k) => sandbox.I18N.has(k) });
  const used = new Set(); const files = ["src/app.js", "src/shell.js", "map.html", "index.html", "about.html", "privacy.html"];
  for (const f of files) { const s = readFileSync(f, "utf8"); for (const m of s.matchAll(/\bT\("((?:[^"\\]|\\.)*)"/g)) { try { used.add(JSON.parse('"' + m[1] + '"')); } catch (e) { used.add(m[1]); } } for (const m of s.matchAll(/data-i18n(?:-title)?="([^"]+)"/g)) used.add(m[1]); }
  const missing = [...used].filter(k => !(k in en)); assert.deepEqual(missing, [], "missing EN for: " + missing.slice(0, 20).join(" | "));
});
