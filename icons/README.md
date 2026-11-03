# icons/

The game art is **not in this repo and never was in its published history**: the pictures are FromSoftware's. The site
serves `/icons/*` from the R2 bucket `nextgrace-assets` (binding `ICONS` in `wrangler.toml`, `functions/_icons.js`),
which is filled by the private repo `robercano/nextgrace-assets` (workflow `sync-r2`) with the icons extracted from the
owner's own copy of the game (`tools/EXTRACT.md`). `icons/index.json` is built from the bucket listing at request time.
Without the bucket the site still works: it shows the item name instead of a picture.

`.gitignore` excludes `icons/*.webp`, `icons/*.png`, `icons/map/` and the `guard` workflow fails any push that adds an
image under `icons/`, so the art cannot come back by accident.

File names (in the bucket): `icons/<item id>.webp` (preferred; upgraded weapons use the base id) or
`icons/<slug of the name>.webp` (e.g. `dagger.webp`, `verdigris_helm.webp`); map backgrounds `icons/map/<name>.webp`.
`src/icons.js` documents the lookup order (id, name, name without affinity or +N, family fallbacks for bell bearings,
cookbooks, letters…). A user can also load their own pack with the *Load icons* button (kept in IndexedDB).

Legacy tools kept for reference: `tools/fetch_icons.py`, `tools/fetch_icons_pages.py`, `tools/tl-icons.js`,
`tools/icons_index.py` (wiki downloads, only for personal use; their workflows were removed).
