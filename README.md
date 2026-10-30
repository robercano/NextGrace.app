# Tarnished Ledger

Lector de partidas de Elden Ring (PC, `ER0000.sl2`) que funciona entero en el navegador: estado del personaje, equipo, inventario y planificador de forja. Pensado para consultar desde el móvil y preparar la siguiente sesión.

El save se lee entero en el navegador y nunca se sube. Opcionalmente puedes entrar con Steam para guardar tus marcas manuales y un resumen de tus personajes en tu cuenta (base de datos D1) y proponer marcadores al mapa de la comunidad (con moderación).

## Estructura

```
index.html            página (UI + estilos)
src/ersave.js         parser del .sl2 (cabecera BND4, 10 slots, GaItem map, inventario, cofre, equipo)
src/app.js            lógica de la página
src/marks.js          marcas manuales por personaje (localStorage)
src/cloud.js          capa de cuenta opcional (login Steam, sincronización, marcadores de la comunidad)
functions/api/        Pages Functions: la API (auth Steam OpenID, personajes, marcas, marcadores, moderación)
db/schema.sql         esquema de la base de datos D1
wrangler.example.toml bindings para desarrollo local (copiar a wrangler.toml)
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

## Alpha con cuenta (D1 + Pages Functions)

La web sigue funcionando sin cuenta. Para activar el login con Steam y la base de datos:

1. **Crear la base**: Cloudflare → *Workers & Pages → D1 → Create database* → nombre `tarnished-ledger`.
   En la pestaña *Console* de la base pega el contenido de `db/schema.sql` y ejecútalo (o `wrangler d1 execute tarnished-ledger --remote --file db/schema.sql`).
2. **Enlazarla al proyecto Pages**: *Pages → tarnishedviewer → Settings → Bindings → Add → D1 database*: variable `DB`, base `tarnished-ledger`. Hazlo en *Production* (y en *Preview* si quieres probar ramas).
3. **Variables**: *Settings → Variables and secrets → Add*: `ADMIN_STEAMIDS` = tu SteamID64 (varios separados por comas). Esos usuarios son moderadores: sus marcadores se publican directos y ven la cola de propuestas en *Cuenta → Moderación*.
4. **Redeploy** (*Deployments → Retry deployment* o un push). Comprueba `https://<proyecto>.pages.dev/api/health` → `{"ok":true,"db":true,"admins":true}`.
5. **Cloudflare Access**: para que otros puedan entrar, quita la aplicación de Access (o añade sus correos). El login de Steam es independiente de Access.

Qué guarda la cuenta: identidad pública de Steam (SteamID, nombre, avatar), un resumen por personaje (nivel, clase, tiempo, equipo, progreso, ids de objetos que tienes; nunca el `.sl2`), tus marcas manuales y los marcadores que propongas. Un personaje pertenece a la cuenta de Steam dueña del save (`char_key = <steamid>:<slot>`), así nadie puede sincronizar marcas de un personaje ajeno.

API (`functions/api/`): `GET /api/me`, `PUT /api/characters`, `GET|PUT /api/marks/:char_key`, `GET|POST /api/markers`, `DELETE /api/markers/:id`, `GET|POST /api/admin/markers`, `GET /api/auth/steam` → `/api/auth/callback`, `POST /api/auth/logout`, `GET /api/health`. Sesión: cookie `tl_session` (HttpOnly, 30 días; en la base solo se guarda su hash).

Desarrollo local con la API:

```
cp wrangler.example.toml wrangler.toml      # está en .gitignore; no lo subas
npx wrangler@3 d1 execute DB --local --file db/schema.sql
npx wrangler@3 pages dev . --port 8790
```

(Los bindings de producción viven en el panel de Pages; un `wrangler.toml` en el repo haría que Pages lo usara en el deploy.)

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
- [x] alpha: cuenta con Steam (OpenID), D1 para marcas y resúmenes de personaje, marcadores de la comunidad con moderación
- [ ] v2.1: más lugares y coordenadas exactas aportadas por usuarios; iconos para marcadores comunitarios según el objeto
- [ ] v3: MCP (Worker) para planificación con Claude a partir del save

## Mapa

`map.html` usa los marcadores del mapa interactivo de [eldenring.wiki.gg](https://eldenring.wiki.gg) (`tools/fetch_map.py` → `data/map.json`, licencia CC BY-NC-SA) y sitúa cada objeto que te falta en el lugar que nombra su texto de ubicación (`tools/build_places.py` → `data/places.json`). Los marcadores que añadas se guardan en tu navegador y, si has entrado con Steam, se envían al mapa de la comunidad (visibles para todos cuando un moderador los aprueba). "Copiar JSON" sigue sirviendo para volcarlos en `data/user_markers.json`. Los fondos (`icons/map/*.webp`) son arte del juego: solo en repo privado.

## Créditos

Formato del save reconstruido a partir de [ClayAmore/ER-Save-Editor](https://github.com/ClayAmore/ER-Save-Editor), [Ariescyn/EldenRing-Save-Manager](https://github.com/Ariescyn/EldenRing-Save-Manager) y la especificación de [oisis/EldenRing-SaveForge](https://github.com/oisis/EldenRing-SaveForge). Base de datos de objetos derivada de SaveForge y ER-Save-Editor. Elden Ring es una marca de FromSoftware / Bandai Namco; este proyecto no está afiliado.

<!-- deploy: 2026-10-29T16:18:37Z -->
