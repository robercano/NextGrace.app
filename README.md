# Tarnished Ledger

Lector de partidas de Elden Ring (PC, `ER0000.sl2`) que funciona entero en el navegador: estado del personaje, equipo, inventario y planificador de forja. Pensado para consultar desde el móvil y preparar la siguiente sesión.

Sin backend: es un sitio estático. El save nunca sale del navegador.

## Estructura

```
index.html            página (UI + estilos)
src/ersave.js         parser del .sl2 (cabecera BND4, 10 slots, GaItem map, inventario, cofre, equipo)
src/app.js            lógica de la página
data/items.json       base de datos de objetos (ID → nombre, tipo, clase, nivel máx.)
icons/                tu pack de iconos (ver icons/README.md) + index.json
sw.js, manifest.*     PWA: se puede "añadir a pantalla de inicio" y funciona offline
tools/                scripts auxiliares (extraer la DB, generar el pack de iconos)
```

## Desplegar en Cloudflare Pages (privado)

1. Sube este repo a GitHub (público o privado; si vas a incluir los iconos, privado).
2. Cloudflare → **Workers & Pages → Create → Pages → Connect to Git** → elige el repo.
   - Framework preset: *None*. Build command: vacío. Build output directory: `/`.
   - Deploy. Tendrás `https://<proyecto>.pages.dev`; cada push a `main` vuelve a desplegar.
3. Hacerlo privado: **Zero Trust → Access → Applications → Add an application → Self-hosted**.
   - Application domain: `<proyecto>.pages.dev` (y también `*.<proyecto>.pages.dev` para las previews).
   - Policy: *Allow* → Include → *Emails* → tu correo. Login method: One-time PIN.
   - Cloudflare te pedirá el PIN por email la primera vez en cada dispositivo (sesión de 24 h por defecto; se puede subir a 1 mes en la aplicación).
4. Opcional: en Pages → Settings → *Access policy* puedes activar la protección de las previews con un clic.

## Iconos

Ver `icons/README.md`. La página busca primero `icons/index.json` (pack subido al repo) y, si no existe, el pack cargado con el botón "Cargar iconos" (guardado en IndexedDB del navegador).

## Desarrollo local

Cualquier servidor estático vale:

```
python -m http.server 8080
```

y abre `http://localhost:8080`. Al cambiar ficheros, sube `VERSION` en `sw.js` para que los clientes instalados refresquen la caché.

## Hoja de ruta

- [x] v1: estado, equipo, inventario, forja (qué armas mejorar y qué piedras faltan)
- [x] v2: progreso (gracias y jefes desde los event flags), "No tengo" contra el catálogo, mapa con lugares de la wiki y objetos pendientes por lugar, editor de marcadores propio (exportable)
- [ ] v2.1: más lugares y coordenadas exactas aportadas por usuarios (`data/user_markers.json`)
- [ ] v3: MCP (Worker) para planificación con Claude a partir del save

## Mapa

`map.html` usa los marcadores del mapa interactivo de [eldenring.wiki.gg](https://eldenring.wiki.gg) (`tools/fetch_map.py` → `data/map.json`, licencia CC BY-NC-SA) y sitúa cada objeto que te falta en el lugar que nombra su texto de ubicación (`tools/build_places.py` → `data/places.json`). Los marcadores que añadas en la página se guardan en tu navegador; con "Copiar JSON" puedes volcarlos en `data/user_markers.json` para compartirlos. Los fondos (`icons/map/*.webp`) son arte del juego: solo en repo privado.

## Créditos

Formato del save reconstruido a partir de [ClayAmore/ER-Save-Editor](https://github.com/ClayAmore/ER-Save-Editor), [Ariescyn/EldenRing-Save-Manager](https://github.com/Ariescyn/EldenRing-Save-Manager) y la especificación de [oisis/EldenRing-SaveForge](https://github.com/oisis/EldenRing-SaveForge). Base de datos de objetos derivada de SaveForge y ER-Save-Editor. Elden Ring es una marca de FromSoftware / Bandai Namco; este proyecto no está afiliado.

<!-- deploy: 2026-10-29T16:18:37Z -->
