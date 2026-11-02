// summarize_save.mjs — builds the account summary of every character in a .sl2 exactly as the browser does (Cloud.summarize),
// so the advisor can be exercised outside the site (tools/lab/advice_lab.mjs). Usage:
//   node tools/lab/summarize_save.mjs path/to/ER0000.sl2 > tools/lab/summaries/<name>.json
import fs from "node:fs"; import vm from "node:vm"; import path from "node:path"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const g = { console, URL, TextDecoder, TextEncoder, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, navigator: { language: "es" }, location: { search: "", href: "http://localhost/" } };
g.self = g; g.window = g; g.globalThis = g;
const ctx = vm.createContext(g);
for (const f of ["src/ersave.js", "src/i18n.js", "src/rules.js", "src/marks.js", "src/cloud.js"]) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
const DB = JSON.parse(fs.readFileSync(path.join(ROOT, "data/items.json"), "utf8")), FLAGS = JSON.parse(fs.readFileSync(path.join(ROOT, "data/flags.json"), "utf8")), REQS = JSON.parse(fs.readFileSync(path.join(ROOT, "data/reqs.json"), "utf8"));
const R = g.Rules.create(DB, REQS); g.TL_USE = (c, i) => R.canUse(c, i);
const buf = fs.readFileSync(process.argv[2]); const save = g.ERSave.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const out = [];
for (const c of save.chars) {
  if (c.error) continue;
  c.enriched = g.ERSave.enrich(c, DB);
  c.all = c.enriched.inventory.concat(c.enriched.keyItems, c.enriched.storage, c.enriched.storageKeys).filter(R.real);
  if (c.eventFlags) { const flag = g.ERSave.makeFlagReader(FLAGS.bst, c.eventFlags); c.progress = { graces: FLAGS.graces.filter(x => flag(x.id)).map(x => x.id), bosses: FLAGS.bosses.filter(b => flag(b.id)).map(b => b.id), picked: Object.entries(FLAGS.pickups || {}).filter(([, f]) => flag(f)).map(([id]) => +id), regions: Object.keys(FLAGS.mapRegions || {}).filter(k => flag(+k)).map(Number) }; }
  out.push({ slot: c.slot, name: c.name, level: c.level, class: c.className, playtime: c.playtimeSec, summary: g.Cloud.summarize(c) });
}
process.stdout.write(JSON.stringify(out));
