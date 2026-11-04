// advice_lab.mjs — generates the advisor's report for the characters in tools/lab/summaries/*.json with several models and prompt
// variants, to compare them side by side. Writes tools/lab/results/<date>/<char>-<model>-<variant>.md and an index README.md
// (summaries and results are gitignored: personal game data; make a summary with summarize_save.mjs).
//   ANTHROPIC_API_KEY=… node tools/lab/advice_lab.mjs [--models claude-sonnet-5-5,claude-opus-5-5] [--variants A,B,C] [--lang es] [--chars Arcano]
// Variants: A = the prompt the site uses today; B = A + a "Hoy en 1 hora" section (a concrete plan for a one-hour session);
//           C = compact (≈250 words, priorities first). Add more below.
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
import { ask, cost } from "./anthropic.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { buildContext, SYSTEM, SYSTEM_EN } = await import(path.join(ROOT, "functions/api/advice/[char_key].js"));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const dry = process.argv.includes("--dry"); // write contexts and prompts only
const models = arg("--models", "claude-sonnet-5-5,claude-opus-5-5").split(","), variants = arg("--variants", "A,B,C").split(","), lang = arg("--lang", "es"), only = arg("--chars", "").split(",").filter(Boolean);
const FLAGS = JSON.parse(fs.readFileSync(path.join(ROOT, "data/flags.json"), "utf8")), PROG = JSON.parse(fs.readFileSync(path.join(ROOT, "data/progression.json"), "utf8"));
const base = lang === "en" ? SYSTEM_EN : SYSTEM;
const VARIANTS = {
  A: base,
  B: base, // since PROMPT_VERSION 3 the site's prompt already carries "Hoy en 1 hora" (B = A); kept so old result tables still read
  C: (lang === "en" ? SYSTEM_EN : SYSTEM).replace(/Use exactly these sections[\s\S]*?Note" line[^\n]*\n|Usa exactamente estas secciones[\s\S]*?línea "Aviso"[^\n]*\n/, lang === "en" ? 'Structure: a one-line summary of where the character is, then "Priorities" (3 bullets, most valuable first, each with the why), then "Next session" (an ordered route of at most 5 steps), then one line "Note".\n' : 'Estructura: una línea con dónde está el personaje, luego "Prioridades" (3 viñetas, la más valiosa primero, cada una con el porqué), luego "Próxima sesión" (una ruta ordenada de 5 pasos como máximo) y una línea "Aviso".\n').replace(/350[–-]500/g, "200-280"),
};
const chars = [];
for (const f of fs.readdirSync(path.join(ROOT, "tools/lab/summaries")).filter(f => f.endsWith(".json"))) for (const c of JSON.parse(fs.readFileSync(path.join(ROOT, "tools/lab/summaries", f), "utf8"))) if (!only.length || only.includes(c.name)) chars.push(c);
const day = new Date().toISOString().slice(0, 10), out = path.join(ROOT, "tools/lab/results", day); fs.mkdirSync(out, { recursive: true });
const rows = [];
for (const c of chars) {
  const ctx = buildContext({ name: c.name, class: c.class, level: c.level }, c.summary, FLAGS, PROG) + (lang === "en" ? "\n\n(Notes in the data above are in Spanish; answer in English.)" : "");
  fs.writeFileSync(path.join(out, `${c.name}-context.txt`), ctx);
  if (dry) { for (const v of variants) fs.writeFileSync(path.join(out, `prompt-${v}-${lang}.txt`), VARIANTS[v]); console.log(`${c.name}: contexto ${ctx.length} caracteres (~${Math.round(ctx.length / 3.5)} tokens)`); continue; }
  for (const model of models) for (const v of variants) {
    const name = `${c.name}-${model}-${v}`; process.stdout.write(name + " … ");
    try {
      const r = await ask({ model, system: VARIANTS[v], user: ctx, maxTokens: model.includes("sonnet") ? 16000 : 8000 });
      const words = r.text.split(/\s+/).length, c$ = cost(model, r.usage);
      fs.writeFileSync(path.join(out, name + ".md"), `<!-- model ${r.model} · variant ${v} · ${r.usage.input_tokens} in / ${r.usage.output_tokens} out · ${r.seconds} s · ~$${c$.toFixed(3)} · stop ${r.stop} -->\n\n${r.text}\n`);
      rows.push([c.name, model, v, r.usage.input_tokens, r.usage.output_tokens, r.seconds, words, c$.toFixed(3), name + ".md"]);
      console.log(`${words} palabras, ${r.seconds} s, ~$${c$.toFixed(3)}`);
    } catch (e) { console.log("ERROR " + e.message); rows.push([c.name, model, v, "-", "-", "-", "-", "-", "ERROR " + e.message.slice(0, 80)]); }
  }
}
if (dry) process.exit(0);
const idx = [`# Advisor lab · ${day} · lang ${lang}`, "", "Variants: " + Object.keys(VARIANTS).map(k => `**${k}**`).join(", ") + " (see advice_lab.mjs). Same context per character (`<char>-context.txt`).", "", "| character | model | variant | in | out | s | words | ~$ | file |", "|---|---|---|---|---|---|---|---|---|", ...rows.map(r => "| " + r.map((x, i) => i === 8 && !String(x).startsWith("ERROR") ? `[${x}](${x})` : x).join(" | ") + " |"), "", `Total ≈ $${rows.reduce((a, r) => a + (+r[7] || 0), 0).toFixed(2)}`];
fs.writeFileSync(path.join(out, "README.md"), idx.join("\n") + "\n");
console.log(`→ ${out}/README.md`);
