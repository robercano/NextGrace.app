// GET  /api/advice/:char_key → cached report for the character (owner only)
// POST /api/advice/:char_key → regenerate if the summary changed and the cooldown/daily cap allow it
//
// The report is produced by Claude from the character summary stored in the account (never the save file),
// the progress flags resolved to names, and a curated progression table (data/progression.json).
import { handler, requireUser, json, bad, sha256 } from "../../_lib.js";

const COOLDOWN_H = 1, DAILY_CAP = 5, MAX_TOKENS = 12000; // los modelos 5.x piensan por defecto y el razonamiento cuenta en max_tokens
const DEFAULT_MODEL = "claude-sonnet-5-5";

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
function buildContext(row, S, FLAGS, PROG) {
  const p = S.progress || {}; const gv = new Set(p.graces || []), bd = new Set(p.bosses || []);
  const bosses = FLAGS.bosses.map(b => ({ n: b.name, r: b.region, t: b.type, rem: b.rem, done: bd.has(b.id) }));
  const byRegion = {}; for (const b of bosses) { (byRegion[b.r] = byRegion[b.r] || []).push(b); }
  const graceByRegion = {}; for (const g of FLAGS.graces) { const o = graceByRegion[g.region] = graceByRegion[g.region] || { done: 0, total: 0 }; o.total++; if (gv.has(g.id)) o.done++; }
  const lastGrace = FLAGS.graces.find(g => g.id === S.lastGrace);
  const weapons = (S.weapons || []).slice().sort((a, b) => b.lvl - a.lvl);
  const fmtW = w => `${w.n}${w.inf ? " (" + w.inf + ")" : ""} +${w.lvl}/${w.max}${w.stored ? " [cofre]" : ""}`;
  const lines = [];
  lines.push(`# Personaje: ${row.name} — ${row.class} nivel ${row.level}, ${S.ng ? "NG+" + S.ng : "NG"}, ${Math.round((S.playtime || 0) / 3600)} h jugadas, ${S.deaths} muertes`);
  lines.push(`Atributos: ${Object.entries(S.stats || {}).map(([k, v]) => k + " " + v).join(", ")}. HP ${S.hp}, FP ${S.fp}, SP ${S.sp}.`);
  lines.push(`Frascos: carmesí ${S.flasks && S.flasks.crimson}, cerúleo ${S.flasks && S.flasks.cerulean}. Huecos de talismán: ${S.talismanSlots}. Runa mayor: ${S.equipped && S.equipped.greatRune || "ninguna"}${S.greatRuneActive ? " (activa)" : ""}. Nivel de arma de matchmaking: +${S.matchmakingWpnLvl}.`);
  if (lastGrace) lines.push(`Última gracia de descanso: ${lastGrace.name} (${lastGrace.region}).`);
  const E = S.equipped || {}; const PH = new Set(["Unarmed", "Head", "Body", "Arms", "Legs"]); for (const k of ["rh", "lh", "talismans"]) E[k] = (E[k] || []).filter(x => x && !PH.has(x)); for (const k of ["head", "chest", "arms", "legs"]) if (PH.has(E[k])) E[k] = null;
  lines.push(`Equipado: mano derecha ${(E.rh || []).filter(Boolean).join(" / ") || "-"}; mano izquierda ${(E.lh || []).filter(Boolean).join(" / ") || "-"}; armadura ${[E.head, E.chest, E.arms, E.legs].filter(Boolean).join(", ") || "-"}; talismanes ${(E.talismans || []).filter(Boolean).join(", ") || "-"}; hechizos memorizados ${(S.spells || []).join(", ") || "-"}.`);
  lines.push(`\n# Armas en inventario (${weapons.length}): ${weapons.map(fmtW).join("; ")}`);
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

const SYSTEM = `Eres un consejero veterano de Elden Ring (juego base y Shadow of the Erdtree). Recibes el estado real de un personaje leído de su partida (atributos, equipo, inventario, piedras, jefes y gracias) y una tabla orientativa de progresión. Escribe en español, en markdown, un informe breve y concreto para la PRÓXIMA sesión de juego. Reglas:
- Basa cada consejo en los datos recibidos: cita niveles, piedras y jefes tal como aparecen. No inventes objetos que el personaje no tiene ni afirmes dónde está si no se deduce de los datos.
- Para las armas, razona con los atributos del personaje (escalado y requisitos), lo que ya lleva subido y las piedras que tiene; si una mejora no es posible con las piedras actuales, di qué piedra falta y dónde suele conseguirse o qué bell bearing la desbloquea.
- No reveles tramas ni giros de historia; sí puedes nombrar zonas, jefes y objetos.
- Usa exactamente estas secciones (## títulos): "Dónde estás", "Qué subir y por qué" (atributos y armas, máximo 3 armas), "Siguientes pasos" (3-5, ordenados), "Retos a tu alcance" (jefes y zonas opcionales razonables para el nivel), "Cosas que se te pueden haber pasado" (objetos o gracias pendientes en zonas ya recorridas), y cierra con una línea "Aviso" recordando que es orientativo.
- Sé directo y conciso: unas 350-500 palabras. Sin introducción ni despedida.`;

async function generate(context, row, S) {
  const [FLAGS, PROG] = await Promise.all([asset(context, "/data/flags.json"), asset(context, "/data/progression.json")]);
  const ctx = buildContext(row, S, FLAGS, PROG);
  const model = context.env.ADVICE_MODEL || DEFAULT_MODEL;
  if (context.env.ADVICE_MOCK) return { text: "## Dónde estás\n(mock) " + ctx.slice(0, 200), model: "mock", usage: null, ctx };
  if (!context.env.ANTHROPIC_API_KEY) throw bad("advisor not configured (ANTHROPIC_API_KEY)", 503);
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "content-type": "application/json", "x-api-key": context.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: MAX_TOKENS, system: SYSTEM, messages: [{ role: "user", content: ctx }] }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw bad("model error: " + (data.error && data.error.message || r.status), 502);
  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
  if (!text) throw bad(`empty report (model ${model}, stop_reason ${data.stop_reason || "?"}, blocks ${JSON.stringify((data.content || []).map(b => b.type))}, raw ${JSON.stringify(data).slice(0, 300)})`, 502);
  return { text, model, usage: data.usage || null };
}

async function usage(context, steamid) {
  const row = await context.env.DB.prepare("SELECT COUNT(*) AS n FROM advice_log WHERE steamid = ? AND created_at > datetime('now', '-1 day')").bind(steamid).first();
  return row ? row.n : 0;
}

export const onRequestGet = handler(async context => {
  const u = await requireUser(context); const ck = decode(context.params.char_key); const row = await own(context, u, ck);
  const a = await context.env.DB.prepare("SELECT text, model, hash, created_at FROM advice WHERE char_key = ?").bind(ck).first();
  const hash = (await sha256(row.summary || "")).slice(0, 16);
  const used = await usage(context, u.steamid);
  const stale = !a || a.hash !== hash;
  const cool = a ? Math.max(0, COOLDOWN_H * 3600 - (Date.now() - Date.parse(a.created_at + "Z")) / 1000) : 0;
  return json({ advice: a ? { text: a.text, model: a.model, created_at: a.created_at } : null, stale, cooldown: Math.round(cool), used, cap: DAILY_CAP, configured: !!(context.env.ANTHROPIC_API_KEY || context.env.ADVICE_MOCK) });
});

export const onRequestPost = handler(async context => {
  const u = await requireUser(context); const ck = decode(context.params.char_key); const row = await own(context, u, ck);
  let S; try { S = JSON.parse(row.summary || "{}"); } catch (e) { S = {}; }
  if (!S.weapons) return bad("summary too old: open the save again while logged in", 409);
  const hash = (await sha256(row.summary || "")).slice(0, 16);
  const a = await context.env.DB.prepare("SELECT text, model, hash, created_at FROM advice WHERE char_key = ?").bind(ck).first();
  if (a && a.hash === hash && !context.env.ADVICE_MOCK) return json({ advice: { text: a.text, model: a.model, created_at: a.created_at }, unchanged: true });
  if (a && (Date.now() - Date.parse(a.created_at + "Z")) < COOLDOWN_H * 3600e3 && u.role !== "admin") return bad(`wait ${COOLDOWN_H} h between reports`, 429);
  const used = await usage(context, u.steamid);
  if (used >= DAILY_CAP && u.role !== "admin") return bad("daily cap reached", 429);
  const g = await generate(context, row, S);
  await context.env.DB.batch([
    context.env.DB.prepare("INSERT INTO advice (char_key, hash, model, text, created_at) VALUES (?, ?, ?, ?, datetime('now')) ON CONFLICT(char_key) DO UPDATE SET hash = excluded.hash, model = excluded.model, text = excluded.text, created_at = datetime('now')").bind(ck, hash, g.model, g.text),
    context.env.DB.prepare("INSERT INTO advice_log (steamid, char_key, model, in_tokens, out_tokens) VALUES (?, ?, ?, ?, ?)").bind(u.steamid, ck, g.model, g.usage ? g.usage.input_tokens : null, g.usage ? g.usage.output_tokens : null),
  ]);
  return json({ advice: { text: g.text, model: g.model, created_at: new Date().toISOString().slice(0, 19).replace("T", " ") }, usage: g.usage, ctx: context.env.ADVICE_MOCK ? g.ctx : undefined });
});
