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
worker/index.js       entrada del Worker: /api/* → functions, resto → assets
db/schema.sql         esquema de la base de datos D1
wrangler.toml         configuración del Worker (assets, D1 `DB`, var `ADMIN_STEAMIDS`); .assetsignore excluye código y herramientas
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

## Alpha con cuenta (Worker + D1)

El sitio se despliega como **Cloudflare Worker con assets estáticos** (`wrangler.toml`): `worker/index.js` enruta `/api/*` a los handlers de `functions/api/**` y sirve el resto como ficheros. La web sigue funcionando sin cuenta; para activar el login con Steam y la base de datos:

1. **Crear la base**: panel de Cloudflare → *Storage & Databases → D1 SQL Database → Create* → nombre `tarnished-ledger`. En la pestaña *Console* pega `db/schema.sql` y ejecútalo.
2. **Poner su ID en `wrangler.toml`**: en la página de la base aparece *Database ID* (un UUID); sustituye `REPLACE_WITH_D1_DATABASE_ID`. Los bindings viven en `wrangler.toml` (no en el panel): cada deploy los aplica.
3. **Moderadores**: `ADMIN_STEAMIDS` en `wrangler.toml` (SteamID64, separados por comas). Sus marcadores se publican directos y ven la cola en *Cuenta → Moderación*.
4. **Deploy**: push a `main` (Workers Builds ejecuta `npx wrangler deploy`) o `npx wrangler deploy` en local. Comprueba `https://<worker>.workers.dev/api/health` → `{"ok":true,"db":true,"admins":true}`.
5. **Cloudflare Access**: para que otros puedan entrar, quita la aplicación de Access (o añade sus correos). El login de Steam es independiente de Access.

Qué guarda la cuenta: identidad pública de Steam (SteamID, nombre, avatar), un resumen por personaje (nivel, clase, tiempo, equipo, progreso, ids de objetos que tienes; nunca el `.sl2`), tus marcas manuales y los marcadores que propongas. Un personaje pertenece a la cuenta de Steam dueña del save (`char_key = <steamid>:<slot>`), así nadie puede sincronizar marcas de un personaje ajeno.

API: `GET /api/me`, `PUT /api/characters`, `GET|PUT /api/marks/:char_key`, `GET|POST /api/markers`, `DELETE /api/markers/:id`, `GET|POST /api/admin/markers`, `GET /api/auth/steam` → `/api/auth/callback`, `POST /api/auth/logout`, `GET /api/health`. Sesión: cookie `tl_session` (HttpOnly, 30 días; en la base solo se guarda su hash). Los handlers tienen la forma de Pages Functions, así que el mismo código sirve si el proyecto se despliega como Pages (carpeta `functions/`).

Desarrollo local con la API (base D1 local en `.wrangler/`):

```
npx wrangler d1 execute DB --local --file db/schema.sql
npx wrangler dev --port 8791
```

## Consejero (informe con Claude)

Pestaña *Consejero* de la ficha: el Worker llama a la API de Claude con el resumen del personaje (lo mismo que ya guarda la cuenta: atributos, armas y piedras, jefes y gracias, nunca el `.sl2`), más `data/progression.json` (tabla orientativa de zonas, niveles y piedras), y guarda el informe en D1 (`advice`). El informe se genera automáticamente al abrir un save nuevo con la sesión iniciada (en cuanto se guarda el resumen; puedes seguir mirando otras pestañas y el mapa mientras tanto). Si el save no ha cambiado, el botón *Otra opinión* permite pedir otra versión (pide confirmación: mismo contexto, solo cambia la redacción). Límites: 1 h de espera entre informes y 5 al día por usuario (los moderadores no tienen límite). Al cambiar el prompt, sube `PROMPT_VERSION` en el handler para que los informes guardados cuenten como desactualizados. `functions/api/advice/[char_key].js`.

Activarlo:
1. Ejecuta `db/migrations/002_advice.sql` en la *Console* de la base D1 (el `schema.sql` completo también lo incluye).
2. *Worker → Settings → Variables and secrets → Add → Secret*: `ANTHROPIC_API_KEY` con una clave de [console.anthropic.com](https://console.anthropic.com/). Opcional: variable `ADVICE_MODEL` (por defecto `claude-sonnet-5-5`).
3. En local: `npx wrangler dev --var ADVICE_MOCK:1` devuelve un informe falso con el contexto que se enviaría al modelo (campo `ctx`), útil para revisar el prompt sin gastar.

## Iconos

Ver `icons/README.md`. La página busca primero `icons/index.json` (pack subido al repo) y, si no existe, el pack cargado con el botón "Cargar iconos" (guardado en IndexedDB del navegador).

## Desarrollo local

Cualquier servidor estático vale:

```
python -m http.server 8080
```

y abre `http://localhost:8080`. Al cambiar ficheros, sube `VERSION` en `sw.js` para que los clientes instalados refresquen la caché.

## Hoja de ruta

Ver [ROADMAP.md](ROADMAP.md): estado del proyecto, decisiones, formato del save y pendientes.

## Mapa

`map.html` usa los marcadores del mapa interactivo de [eldenring.wiki.gg](https://eldenring.wiki.gg) (`tools/fetch_map.py` → `data/map.json`, licencia CC BY-SA 4.0) y sitúa cada objeto que te falta en el lugar que nombra su texto de ubicación (`tools/build_places.py` → `data/places.json`). Los marcadores que añadas se guardan en tu navegador y, si has entrado con Steam, se envían al mapa de la comunidad (visibles para todos cuando un moderador los aprueba). "Copiar JSON" sigue sirviendo para volcarlos en `data/user_markers.json`. Los fondos (`icons/map/*.webp`) son arte del juego: solo en repo privado.

## Créditos

Formato del save reconstruido a partir de [ClayAmore/ER-Save-Editor](https://github.com/ClayAmore/ER-Save-Editor), [Ariescyn/EldenRing-Save-Manager](https://github.com/Ariescyn/EldenRing-Save-Manager) y la especificación de [oisis/EldenRing-SaveForge](https://github.com/oisis/EldenRing-SaveForge). Base de datos de objetos derivada de SaveForge y ER-Save-Editor. Elden Ring es una marca de FromSoftware / Bandai Namco; este proyecto no está afiliado.

<!-- deploy: 2026-10-29T16:18:37Z -->

## Idioma

La interfaz está en español y en inglés. El botón ES/EN de la cabecera cambia el idioma (también `?lang=en` en la URL); la elección se guarda en el navegador. Los nombres de objetos, jefes y lugares se mantienen en inglés, como en la wiki. Para añadir textos nuevos: escribirlos en español dentro de `T()` (o con `data-i18n` en el HTML) y añadir la traducción a la tabla `EN` de `src/i18n.js`.

## Licencia y créditos

Código bajo GPL-3.0 (`LICENSE`). Datos derivados de [eldenring.wiki.gg](https://eldenring.wiki.gg) (`data/reqs.json`, `data/locations.json`, `data/map.json`, `data/places.json`) bajo CC BY-SA 4.0. Nombres, ids y banderas de evento extraídos con EldenRing-SaveForge (GPL-3.0). La página `about.html` recoge todas las atribuciones, el aviso de no afiliación y el de solo lectura; `CONTACT` en ese fichero es el correo para retiradas. Proyecto de fans sin relación con FromSoftware ni Bandai Namco.
