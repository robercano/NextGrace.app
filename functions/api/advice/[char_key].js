// GET  /api/advice/:char_key → cached report for the character (owner only)
// POST /api/advice/:char_key → regenerate if the summary changed (or {force:true}) and the cooldown/daily cap allow it;
//      {auto:true} is the browser kicking it off right after uploading a new save. One job per character at a time
//      (advice_jobs, created on the fly): a second request while one runs gets {running:true} and should poll GET.
//
// The report is produced by Claude from the character summary stored in the account (never the save file),
// the progress flags resolved to names, and a curated progression table (data/progression.json).
import { splitRouteBlock, cleanStops, stopIndex, putRoute } from "../../_routes.js";
import { handler, requireUser, json, bad, sha256, advisorEnabled } from "../../_lib.js";

// Limits that bound what the Claude key can cost (see docs/ARCHITECTURE.md → "Advisor access"): per character, per user, and for
// everybody together per day. Admins skip the per-user and global caps. 5.x models think by default and thinking counts
// toward max_tokens; the report itself is ~800 tokens.
// Lab of 2 Nov 2026 (tools/lab/results/2026-11-02): Opus 5.5 finishes in 2.5-4.3k output tokens and writes clearly better
// reports; Sonnet 5.5 spends 8k+ tokens thinking and often returns nothing. Hence Opus by default and a per-model budget.
const COOLDOWN_H = 1, DAILY_CAP = 5, GLOBAL_DAILY_CAP = 60;
const MAX_TOKENS_BY_MODEL = { "claude-opus-5-5": 8000, "claude-sonnet-5-5": 16000 }, MAX_TOKENS_DEFAULT = 12000;
const maxTokensFor = model => MAX_TOKENS_BY_MODEL[model] || MAX_TOKENS_DEFAULT;
const MAX_TOKENS = MAX_TOKENS_DEFAULT; // reported in ADVICE_LIMITS
export const ADVICE_LIMITS = { cooldownH: COOLDOWN_H, dailyCap: DAILY_CAP, globalDailyCap: GLOBAL_DAILY_CAP, maxTokens: MAX_TOKENS };
const DEFAULT_MODEL = "claude-opus-5-5";
const PROMPT_VERSION = 4; // 4: ```route block (stops for the map); 3: "Hoy en 1 hora" section + compact weapon list for big inventories // bump when SYSTEM/buildContext change: the cached report is then considered stale
const JOB_TTL_S = 240; // a job older than this is assumed dead whatever it says
const JOB_DEAD_S = 40; // a job that has not written its heartbeat (beat_at, every 10 s) for this long is dead: the Worker that ran it was
// evicted (it happens when the browser that started it goes away mid-stream). Other tabs then stop waiting and the one that
// is looking at the report starts a new run.

const hashOf = async (summary, lang) => (await sha256((summary || "") + "|" + lang + "|p" + PROMPT_VERSION)).slice(0, 16);
let jobsReady = false;
async function jobs(context) {
  if (jobsReady) return;
  await context.env.DB.prepare("CREATE TABLE IF NOT EXISTS advice_jobs (char_key TEXT PRIMARY KEY, hash TEXT, lang TEXT, started_at TEXT NOT NULL)").run();
  for (const col of ["beat_at TEXT", "progress INTEGER"]) { try { await context.env.DB.prepare(`ALTER TABLE advice_jobs ADD COLUMN ${col}`).run(); } catch (e) {} }
  jobsReady = true;
}
async function runningJob(context, ck) {
  await jobs(context);
  const j = await context.env.DB.prepare("SELECT hash, lang, started_at, beat_at, progress FROM advice_jobs WHERE char_key = ?").bind(ck).first();
  if (!j) return null;
  const sec = Math.round((Date.now() - Date.parse(j.started_at + "Z")) / 1000);
  const idle = Math.round((Date.now() - Date.parse((j.beat_at || j.started_at) + "Z")) / 1000);
  if (sec > JOB_TTL_S || idle > JOB_DEAD_S) { await context.env.DB.prepare("DELETE FROM advice_jobs WHERE char_key = ?").bind(ck).run(); return null; }
  return { seconds: Math.max(0, sec), lang: j.lang, progress: j.progress || 0 };
}

async function asset(context, path) {
  const url = new URL(path, context.request.url);
  const r = await context.env.ASSETS.fetch(new Request(url)); if (!r.ok) throw new Error("asset " + path + " " + r.status); return r.json();
}
const decode = s => decodeURIComponent(s);

async function own(context, u, ck) {
  const row = await context.env.DB.prepare("SELECT char_key, owner, name, level, class, playtime, summary, updated_at FROM characters WHERE char_key = ?").bind(ck).first();
  if (!row) throw bad("unknown character; open the save while logged in first", 404);
  if (row.owner !== u.steamid) throw bad("not your character", 403);
  return row;
}

// ---- context for the model ---------------------------------------------
export function buildContext(row, S, FLAGS, PROG) {
  const p = S.progress || {}; const gv = new Set(p.graces || []), bd = new Set(p.bosses || []);
  const bosses = FLAGS.bosses.map(b => ({ n: b.name, r: b.region, t: b.type, rem: b.rem, done: bd.has(b.id) }));
  const byRegion = {}; for (const b of bosses) { (byRegion[b.r] = byRegion[b.r] || []).push(b); }
  const graceByRegion = {}; for (const g of FLAGS.graces) { const o = graceByRegion[g.region] = graceByRegion[g.region] || { done: 0, total: 0 }; o.total++; if (gv.has(g.id)) o.done++; }
  const lastGrace = FLAGS.graces.find(g => g.id === S.lastGrace);
  // Big inventories (a finished character owns 450 weapons) would cost 35k+ input tokens: keep what matters for advice —
  // upgraded, equipped or usable-and-scaling-with-the-build weapons — and summarise the rest by count.
  const all = (S.weapons || []).slice().sort((a, b) => b.lvl - a.lvl);
  let weapons = all, omitted = 0;
  if (all.length > 80) {
    const top = Object.entries(S.stats || {}).filter(([k]) => ["strength", "dexterity", "intelligence", "faith", "arcane"].includes(k)).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => ({ strength: "str", dexterity: "dex", intelligence: "int", faith: "fai", arcane: "arc" })[k]);
    const eqNames = new Set([].concat((S.equipped || {}).rh || [], (S.equipped || {}).lh || []).filter(Boolean).map(n => n.replace(/\s*\+\d+$/, "")));
    const good = w => w.lvl > 0 || eqNames.has(w.n) || (w.use === "ok" && w.sc && top.some(k => /^[SAB]$/.test(w.sc[k] || "")));
    weapons = all.filter(good).slice(0, 120); omitted = all.length - weapons.length;
  }
  const ST = { str: "FUE", dex: "DES", int: "INT", fai: "FE", arc: "ARC" };
  const fmtW = w => `${w.n}${w.inf ? " (" + w.inf + ")" : ""} +${w.lvl}/${w.max}${w.stored ? " [cofre]" : ""}${w.req ? " {req " + Object.entries(w.req).filter(([, v]) => v).map(([k, v]) => ST[k] + v).join("/") + (w.sc ? "; esc " + Object.entries(w.sc).map(([k, v]) => ST[k] + ":" + v).join("/") : "") + "; " + (w.use === "ok" ? "usable" : w.use === "boost" ? "usable solo gracias a " + (w.via || "un bonus de equipo") : w.use === "2h" ? "solo a dos manos" : "NO usable, faltan " + (w.miss || "")) + "}" : ""}`;
  const lines = [];
  lines.push(`# Personaje: ${row.name} — ${row.class} nivel ${row.level}, ${S.ng ? "NG+" + S.ng : "NG"}, ${Math.round((S.playtime || 0) / 3600)} h jugadas, ${S.deaths} muertes`);
  lines.push(`Atributos: ${Object.entries(S.stats || {}).map(([k, v]) => k + " " + v).join(", ")}. HP ${S.hp}, FP ${S.fp}, SP ${S.sp}.`);
  lines.push(`Frascos: carmesí ${S.flasks && S.flasks.crimson}, cerúleo ${S.flasks && S.flasks.cerulean}. Huecos de talismán: ${S.talismanSlots}. Runa mayor: ${S.equipped && S.equipped.greatRune || "ninguna"}${S.greatRuneActive ? " (activa)" : ""}. Nivel de arma de matchmaking: +${S.matchmakingWpnLvl}.`);
  if (lastGrace) lines.push(`Última gracia de descanso: ${lastGrace.name} (${lastGrace.region}).`);
  const E = S.equipped || {}; const PH = new Set(["Unarmed", "Head", "Body", "Arms", "Legs"]); for (const k of ["rh", "lh", "talismans"]) E[k] = (E[k] || []).filter(x => x && !PH.has(x)); for (const k of ["head", "chest", "arms", "legs"]) if (PH.has(E[k])) E[k] = null;
  lines.push(`Equipado: mano derecha ${(E.rh || []).filter(Boolean).join(" / ") || "-"}; mano izquierda ${(E.lh || []).filter(Boolean).join(" / ") || "-"}; armadura ${[E.head, E.chest, E.arms, E.legs].filter(Boolean).join(", ") || "-"}; talismanes ${(E.talismans || []).filter(Boolean).join(", ") || "-"}; hechizos memorizados ${(S.spells || []).join(", ") || "-"}.`);
  lines.push(`\n# Armas en inventario (${all.length}${omitted ? `, se listan ${weapons.length}: las mejoradas, equipadas o usables con buen escalado; ${omitted} más sin mejorar omitidas` : ""}): ${weapons.map(fmtW).join("; ")}`);
  lines.push(`# Piedras de forja: ${Object.entries(S.stones || {}).map(([k, v]) => k.replace("Smithing Stone", "SS") + " ×" + v).join(", ") || "ninguna"}`);
  lines.push(`# Talismanes (${(S.talismans || []).length}): ${(S.talismans || []).join(", ")}`);
  lines.push(`# Hechizos/encantamientos que posee (${(S.spellsOwned || []).length}): ${(S.spellsOwned || []).join(", ")}`);
  lines.push(`# Cenizas (espíritus y de guerra) (${(S.ashes || []).length}): ${(S.ashes || []).slice(0, 80).join(", ")}`);
  lines.push(`# Objetos clave: ${(S.keyItems || []).join(", ")}`);
  lines.push(`\n# Progreso: gracias ${gv.size}/${FLAGS.graces.length}; jefes ${bosses.filter(b => b.done).length}/${bosses.length} (principales ${bosses.filter(b => b.t === "main" && b.done).length}/${bosses.filter(b => b.t === "main").length}); zonas de mapa reveladas ${(p.regions || []).length}.`);
  lines.push(`Gracias por región (descubiertas/total): ${Object.entries(graceByRegion).map(([r, o]) => `${r} ${o.done}/${o.total}`).join("; ")}`);
  lines.push(`Jefes por región [✓ vencido, ✗ pendiente]: ${Object.entries(byRegion).map(([r, bs]) => `${r}: ${bs.map(b => (b.done ? "✓" : "✗") + b.n + (b.rem ? "*" : "")).join(", ")}`).join(" | ")}`);
  lines.push(`\n# Tabla de progresión orientativa (comunidad)\n${PROG.note}\n` + PROG.zones.map(z => `- ${z.zone}: nivel ${z.level}, arma ${z.wpn}. Jefes: ${z.bosses.join(", ")}. ${z.notes}`).join("\n"));
  lines.push(`Softcaps: ${Object.entries(PROG.softcaps).map(([k, v]) => k + " " + v).join("; ")}.`);
  lines.push(`Piedras: ${PROG.stones.normal} ${PROG.stones.somber} ${PROG.stones.bells}`);
  return lines.join("\n");
}

export const SYSTEM_EN = `You are a veteran Elden Ring advisor (base game and Shadow of the Erdtree). You receive a character's real state read from their save (attributes, gear, inventory, stones, bosses and graces) and an indicative progression table. Write, in English and in markdown, a short, concrete report for the NEXT play session. Rules:
- Base every piece of advice on the data you were given: quote levels, stones and bosses as they appear. Don't invent items the character doesn't have, and don't claim where they are unless it follows from the data.
- Each weapon carries in braces its real requirements, its scaling (letters) and whether the character can use it now ("usable", "two-handed only" or "NOT usable, missing STR+N…"): don't recommend NOT usable weapons unless you propose raising exactly those attributes; if a weapon is "usable only thanks to" a talisman or helm, say so (it depends on keeping it equipped), and prefer weapons that scale with the character's high attributes; if an upgrade isn't possible with the current stones, say which stone is missing and where it's usually found or which bell bearing unlocks it.
- No story spoilers; naming areas, bosses and items is fine.
- Use exactly these sections (## headings): "Where you are", "What to level and why" (attributes and weapons, 3 weapons at most), "Next steps" (3–5, in order), "Challenges within reach" (bosses and optional areas reasonable for the level), "Things you may have missed" (pending items or graces in areas already explored), "Today in one hour" (what to do if the next session is only one hour long: one goal, the route, what to bring), and close with a "Note" line reminding this is guidance only.
- After the "Note" line, append the route of "Today in one hour" as a fenced block for the map, exactly in this form (3 to 8 stops, in visiting order; each name must be the exact English name of a site of grace, a boss or a map place; "why" is a short line): \`\`\`route\n[{"name":"Site of Grace or boss or place","why":"what to do there"}]\n\`\`\`
- Be direct and concise: about 350–500 words. No introduction or sign-off.`;
export const SYSTEM = `Eres un consejero veterano de Elden Ring (juego base y Shadow of the Erdtree). Recibes el estado real de un personaje leído de su partida (atributos, equipo, inventario, piedras, jefes y gracias) y una tabla orientativa de progresión. Escribe en español, en markdown, un informe breve y concreto para la PRÓXIMA sesión de juego. Reglas:
- Basa cada consejo en los datos recibidos: cita niveles, piedras y jefes tal como aparecen. No inventes objetos que el personaje no tiene ni afirmes dónde está si no se deduce de los datos.
- Cada arma lleva entre llaves sus requisitos reales, su escalado (letras) y si el personaje puede usarla ahora ("usable", "solo a dos manos" o "NO usable, faltan FUE+N…"): no recomiendes armas NO usables salvo que propongas subir justo esos atributos; si una arma es "usable solo gracias a" un talismán o casco, dilo (depende de llevarlo equipado), y prioriza las que escalen con los atributos altos del personaje; si una mejora no es posible con las piedras actuales, di qué piedra falta y dónde suele conseguirse o qué bell bearing la desbloquea.
- No reveles tramas ni giros de historia; sí puedes nombrar zonas, jefes y objetos.
- Usa exactamente estas secciones (## títulos): "Dónde estás", "Qué subir y por qué" (atributos y armas, máximo 3 armas), "Siguientes pasos" (3-5, ordenados), "Retos a tu alcance" (jefes y zonas opcionales razonables para el nivel), "Cosas que se te pueden haber pasado" (objetos o gracias pendientes en zonas ya recorridas), "Hoy en 1 hora" (qué hacer si la próxima sesión dura solo una hora: un objetivo, la ruta y qué llevar), y cierra con una línea "Aviso" recordando que es orientativo.
- Tras la línea "Aviso", añade la ruta de "Hoy en 1 hora" como bloque para el mapa, exactamente así (de 3 a 8 paradas en orden de visita; cada nombre debe ser el nombre exacto en inglés de una gracia, un jefe o un lugar del mapa; "why" es una línea corta): \`\`\`route\n[{"name":"Gracia o jefe o lugar","why":"qué hacer allí"}]\n\`\`\`
- Sé directo y conciso: unas 350-500 palabras. Sin introducción ni despedida.`;

// Streams the model's answer (SSE) so neither leg of the connection sits idle; onBeat is called as deltas arrive.
async function generate(context, row, S, onBeat, lang) {
  const [FLAGS, PROG] = await Promise.all([asset(context, "/data/flags.json"), asset(context, "/data/progression.json")]);
  const ctx = buildContext(row, S, FLAGS, PROG) + (lang === "en" ? "\n\n(Notes in the data above are in Spanish; answer in English.)" : "");
  const model = context.env.ADVICE_MODEL || DEFAULT_MODEL;
  if (context.env.ADVICE_MOCK) { await new Promise(r => setTimeout(r, 1500)); return { text: "## Dónde estás\n(mock) " + ctx.slice(0, 200) + "\n\nAviso: orientativo.\n\n```route\n[{\"name\":\"Gatefront\",\"why\":\"empezar aquí\"},{\"name\":\"Grace: Stormhill Shack\",\"why\":\"activar la gracia\"},{\"name\":\"Margit, the Fell Omen\",\"why\":\"jefe a tu alcance\"},{\"name\":\"Sitio inventado\",\"why\":\"no existe\"}]\n```", model: "mock", usage: null, ctx }; }
  if (!context.env.ANTHROPIC_API_KEY) throw bad("advisor not configured (ANTHROPIC_API_KEY)", 503);
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "content-type": "application/json", "x-api-key": context.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: maxTokensFor(model), stream: true, system: lang === "en" ? SYSTEM_EN : SYSTEM, messages: [{ role: "user", content: ctx }] }),
  });
  if (!r.ok) { const data = await r.json().catch(() => ({})); throw bad("model error: " + (data.error && data.error.message || r.status), 502); }
  let text = "", usage = { input_tokens: null, output_tokens: null }, stop = null, buf = "";
  const reader = r.body.getReader(), dec = new TextDecoder();
  const handle = line => {
    if (!line.startsWith("data:")) return; let ev; try { ev = JSON.parse(line.slice(5).trim()); } catch (e) { return; }
    if (ev.type === "content_block_delta" && ev.delta && ev.delta.type === "text_delta") text += ev.delta.text;
    else if (ev.type === "message_start" && ev.message && ev.message.usage) usage.input_tokens = ev.message.usage.input_tokens;
    else if (ev.type === "message_delta") { if (ev.usage) usage.output_tokens = ev.usage.output_tokens; if (ev.delta) stop = ev.delta.stop_reason; }
    else if (ev.type === "error") throw bad("model error: " + (ev.error && ev.error.message || "stream error"), 502);
    if (onBeat) onBeat(text.length);
  };
  for (;;) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i; while ((i = buf.indexOf("\n")) >= 0) { handle(buf.slice(0, i).trim()); buf = buf.slice(i + 1); } }
  if (buf.trim()) handle(buf.trim());
  text = text.trim();
  if (!text) throw bad(`empty report (model ${model}, stop_reason ${stop || "?"})`, 502);
  return { text, model, usage };
}

async function usage(context, steamid) {
  const row = await context.env.DB.prepare("SELECT COUNT(*) AS n FROM advice_log WHERE steamid = ? AND created_at > datetime('now', '-1 day')").bind(steamid).first();
  return row ? row.n : 0;
}
async function usageAll(context) {
  const row = await context.env.DB.prepare("SELECT COUNT(*) AS n FROM advice_log WHERE created_at > datetime('now', '-1 day')").first();
  return row ? row.n : 0;
}

export const onRequestGet = handler(async context => {
  const u = await requireUser(context); const ck = decode(context.params.char_key);
  const lang = new URL(context.request.url).searchParams.get("lang") === "en" ? "en" : "es";
  if (new URL(context.request.url).searchParams.get("ctx")) { // the context the advisor would get, as text, for "ask an AI yourself" (no model call, so no gate: it is the user's own data)
    const row = await own(context, u, ck); const S = JSON.parse(row.summary || "{}");
    const [FLAGS, PROG] = await Promise.all([asset(context, "/data/flags.json"), asset(context, "/data/progression.json")]);
    const a = await context.env.DB.prepare("SELECT text, created_at FROM advice WHERE char_key = ?").bind(ck).first();
    return json({ context: buildContext(row, S, FLAGS, PROG), advice: a ? a.text : null, adviceAt: a ? a.created_at : null });
  }
  if (!advisorEnabled(u, context.env)) return json({ enabled: false, advisor: u.advisor, configured: !!(context.env.ANTHROPIC_API_KEY || context.env.ADVICE_MOCK) });
  const row = await own(context, u, ck);
  const a = await context.env.DB.prepare("SELECT text, model, hash, created_at FROM advice WHERE char_key = ?").bind(ck).first();
  const hash = await hashOf(row.summary, lang);
  const used = await usage(context, u.steamid);
  const stale = !a || a.hash !== hash;
  const cool = a ? Math.max(0, COOLDOWN_H * 3600 - (Date.now() - Date.parse(a.created_at + "Z")) / 1000) : 0;
  const running = await runningJob(context, ck);
  const globalUsed = u.role === "admin" ? 0 : await usageAll(context);
  return json({ enabled: true, advice: a ? { text: a.text, model: a.model, created_at: a.created_at } : null, stale, running, cooldown: Math.round(cool), used, cap: DAILY_CAP, globalFull: globalUsed >= GLOBAL_DAILY_CAP, configured: !!(context.env.ANTHROPIC_API_KEY || context.env.ADVICE_MOCK) });
});

export const onRequestPost = handler(async context => {
  const u = await requireUser(context); const ck = decode(context.params.char_key);
  if (!advisorEnabled(u, context.env)) return bad("advisor not enabled for this account", 403);
  const row = await own(context, u, ck);
  let S; try { S = JSON.parse(row.summary || "{}"); } catch (e) { S = {}; }
  if (!S.weapons) return bad("summary too old: open the save again while logged in", 409);
  let body = {}; try { body = await context.request.json(); } catch (e) {}
  const lang = body.lang === "en" ? "en" : "es";
  const hash = await hashOf(row.summary, lang);
  const a = await context.env.DB.prepare("SELECT text, model, hash, created_at FROM advice WHERE char_key = ?").bind(ck).first();
  if (a && a.hash === hash && !body.force) return json({ advice: { text: a.text, model: a.model, created_at: a.created_at }, unchanged: true });
  const running = await runningJob(context, ck);
  if (running) return json({ running });
  if (a && (Date.now() - Date.parse(a.created_at + "Z")) < COOLDOWN_H * 3600e3 && u.role !== "admin") return bad(`wait ${COOLDOWN_H} h between reports`, 429);
  const used = await usage(context, u.steamid);
  if (used >= DAILY_CAP && u.role !== "admin") return bad("daily cap reached", 429);
  if (u.role !== "admin" && (await usageAll(context)) >= GLOBAL_DAILY_CAP) return bad("global daily cap reached", 429);
  // Long job (30-120 s): answer as a newline-delimited stream with heartbeats so proxies and mobile browsers keep the connection; last line is the result.
  const { readable, writable } = new TransformStream(); const w = writable.getWriter(), enc = new TextEncoder();
  const send = obj => w.write(enc.encode(JSON.stringify(obj) + "\n")).catch(() => {});
  await context.env.DB.prepare("INSERT INTO advice_jobs (char_key, hash, lang, started_at, beat_at, progress) VALUES (?, ?, ?, datetime('now'), datetime('now'), 0) ON CONFLICT(char_key) DO UPDATE SET hash = excluded.hash, lang = excluded.lang, started_at = datetime('now'), beat_at = datetime('now'), progress = 0").bind(ck, hash, lang).run();
  const job = (async () => {
    let beat = Date.now(), last = 0; const hb = setInterval(() => send({ beat: Math.round((Date.now() - beat) / 1000) }), 4000);
    // heartbeat in D1 so other tabs can tell a live job from a dead one (JOB_DEAD_S)
    const db = setInterval(() => { context.env.DB.prepare("UPDATE advice_jobs SET beat_at = datetime('now'), progress = ? WHERE char_key = ?").bind(last, ck).run().catch(() => {}); }, 10000);
    try {
      const g = await generate(context, row, S, n => { if (n - last > 400) { last = n; send({ progress: n }); } }, lang);
      const split = splitRouteBlock(g.text); g.text = split.text; // the ```route block goes to the routes table, not into the report
      if (split.stops) { try { const stops = cleanStops(await stopIndex(context), split.stops); await putRoute(context.env, ck, u.steamid, { title: lang === "en" ? "Today in one hour" : "Hoy en 1 hora", stops, source: "advisor" }); } catch (e) { console.error("route block rejected", e && e.message); } }
      await context.env.DB.batch([
        context.env.DB.prepare("INSERT INTO advice (char_key, hash, model, text, created_at) VALUES (?, ?, ?, ?, datetime('now')) ON CONFLICT(char_key) DO UPDATE SET hash = excluded.hash, model = excluded.model, text = excluded.text, created_at = datetime('now')").bind(ck, hash, g.model, g.text),
        context.env.DB.prepare("INSERT INTO advice_log (steamid, char_key, model, in_tokens, out_tokens) VALUES (?, ?, ?, ?, ?)").bind(u.steamid, ck, g.model, g.usage ? g.usage.input_tokens : null, g.usage ? g.usage.output_tokens : null),
      ]);
      await send({ advice: { text: g.text, model: g.model, created_at: new Date().toISOString().slice(0, 19).replace("T", " ") }, usage: g.usage, ctx: context.env.ADVICE_MOCK ? g.ctx : undefined });
    } catch (e) {
      let msg = e && e.message || String(e); if (e instanceof Response) { try { msg = (await e.json()).error || msg; } catch (x) { msg = e.statusText || msg; } }
      await send({ error: msg });
    } finally { clearInterval(hb); clearInterval(db); try { await context.env.DB.prepare("DELETE FROM advice_jobs WHERE char_key = ?").bind(ck).run(); } catch (e) {} try { await w.close(); } catch (e) {} }
  })();
  if (context.waitUntil) context.waitUntil(job);
  return new Response(readable, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
});
