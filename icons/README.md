# icons/

Pack de iconos para uso personal. **No subas iconos a un repo público**: son arte de FromSoftware.

Opción A (automática): con el repo en **privado**, Actions → **icons** → Run workflow. Descarga los iconos
de eldenring.wiki.gg (1 petición/segundo, ~1 h para todos), los convierte a WebP de 64 px, regenera
`index.json` y hace commit a `main`. Se puede relanzar: solo baja los que faltan.

Opción B (manual): `tools/tl-icons.js` pegado en la consola del navegador en la wiki genera `er-icons.zip`;
descomprímelo aquí y ejecuta `python tools/icons_index.py`.

Nombres: `<slug del objeto>.webp` (p. ej. `dagger.webp`, `verdigris_helm.webp`). La página busca por
nombre base sin afinidad ni +N.
