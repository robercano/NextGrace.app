# icons/

Icon pack for personal use. **Never commit icons to a public repo**: they are FromSoftware's art. For a public
deployment, extract them from your own copy of the game (`tools/EXTRACT.md`) and serve them from outside the repo
(the plan is an R2 bucket behind the Worker). The site works without icons: it shows the item name instead.

Option A (automatic, legacy): with the repo **private**, Actions → **icons** → Run workflow. It downloads the icons
from eldenring.wiki.gg (1 request/s, ~1 h for all), converts them to 64 px WebP, regenerates `index.json` and
commits to `main`. It can be re-run: it only fetches what is missing. `icons-pages` does a second pass using the
image named in each item's wiki infobox.

Option B (manual): `tools/tl-icons.js` pasted into the browser console on the wiki produces `er-icons.zip`;
unzip it here and run `python tools/icons_index.py`.

File names: `<item id>.webp` (preferred; upgraded weapons use the base id) or `<slug of the name>.webp`
(e.g. `dagger.webp`, `verdigris_helm.webp`). `src/icons.js` documents the lookup order (id, name, name without
affinity or +N, family fallbacks for bell bearings, cookbooks, letters…).
