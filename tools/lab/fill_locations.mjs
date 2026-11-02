// fill_locations.mjs — asks Claude for a where-to-find text for the items the wiki has no page or no text for (data/locations.json
// "missing"), as DRAFTS: data/locations_draft.json, lowest priority in tools/apply_locations.py (override > wiki > draft) and shown
// in the site with a "draft, unverified" note. The model must answer UNKNOWN when unsure; those stay empty.
//   ANTHROPIC_API_KEY=… node tools/lab/fill_locations.mjs [--model claude-sonnet-5-5] [--limit N] [--batch 25]
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
import { ask, cost } from "./anthropic.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const model = arg("--model", "claude-sonnet-5-5"), limit = +arg("--limit", "9999"), batch = +arg("--batch", "25");
const store = JSON.parse(fs.readFileSync(path.join(ROOT, "data/locations.json"), "utf8"));
const DB = JSON.parse(fs.readFileSync(path.join(ROOT, "data/items.json"), "utf8")).items;
const kindOf = {}; for (const e of Object.values(DB)) kindOf[e.n] = kindOf[e.n] || `${e.k}${e.s ? " / " + e.s : ""}${e.c ? " (" + e.c + ")" : ""}`;
const draftPath = path.join(ROOT, "data/locations_draft.json");
const draft = fs.existsSync(draftPath) ? JSON.parse(fs.readFileSync(draftPath, "utf8")) : { entries: {}, unknown: [] };
const todo = (store.missing || []).filter(n => !store.entries[n] && !draft.entries[n]).slice(0, limit);
console.log(`${todo.length} nombres sin texto (ya en borrador: ${Object.keys(draft.entries).length}, desconocidos previos: ${draft.unknown.length})`);
const SYS = `You write short "where to find" notes for Elden Ring items (base game and Shadow of the Erdtree), in English, like the Acquisition section of a wiki. Rules: 1-2 sentences per item, concrete (area, merchant, boss, chest, quest step), no spoilers of story twists, no markdown. If you are not confident the information is correct, answer exactly UNKNOWN for that item: a wrong location is worse than none. Reply with a JSON object mapping each item name to its text or UNKNOWN, nothing else.`;
let total = 0, done = 0;
for (let i = 0; i < todo.length; i += batch) {
  const names = todo.slice(i, i + batch);
  const user = "Items (name — type):\n" + names.map(n => `- ${n} — ${kindOf[n] || "?"}`).join("\n");
  try {
    const r = await ask({ model, system: SYS, user, maxTokens: 4000, temperature: 0 });
    const m = r.text.match(/\{[\s\S]*\}/); const obj = m ? JSON.parse(m[0]) : {};
    for (const n of names) {
      const t = typeof obj[n] === "string" ? obj[n].trim() : "";
      if (!t || /^unknown$/i.test(t)) { if (!draft.unknown.includes(n)) draft.unknown.push(n); }
      else { draft.entries[n] = { text: t.slice(0, 420), model: r.model, date: new Date().toISOString().slice(0, 10) }; done++; draft.unknown = draft.unknown.filter(x => x !== n); }
    }
    total += cost(model, r.usage); console.log(`  ${Math.min(i + batch, todo.length)}/${todo.length} · ~$${total.toFixed(3)}`);
  } catch (e) { console.log("  ERROR " + e.message); }
}
draft.source = `Claude (${model}), unverified drafts; review and move good ones to data/overrides/locations.json`; draft.updated = new Date().toISOString().slice(0, 10);
fs.writeFileSync(draftPath, JSON.stringify(draft, null, 1) + "\n");
console.log(`borradores nuevos ${done}, desconocidos ${draft.unknown.length} → data/locations_draft.json (~$${total.toFixed(2)})`);
