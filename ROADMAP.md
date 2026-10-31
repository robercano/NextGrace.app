# Tarnished Ledger — estado del proyecto y hoja de ruta

Documento de continuidad: lo que hay, por qué está así y lo que falta. Léelo entero antes de tocar nada; el README cubre la instalación.

## Qué es

Lector de partidas de Elden Ring (PC, `ER0000.sl2`) para preparar la siguiente sesión desde el móvil: ficha del personaje al estilo de los menús del juego, inventario con iconos, planificador de forja, progreso (gracias, jefes, objetos únicos), mapa con lo pendiente, cuenta opcional con Steam para sincronizar marcas y un "consejero" que genera un informe con Claude. Privado por ahora (Cloudflare Access); objetivo: público y con mapa editable por la comunidad.

Usuario: Rob (SteamID REPLACE_WITH_YOUR_STEAMID64, moderador). Dos personajes: Gabriell (Astrologer 220, casi todo hecho) y Arcano (Prophet ~44, Liurnia a medias; usa Finger Seal + Winged Scythe). Idioma de la interfaz: español; nombres de objetos en inglés (los de la wiki).

## Arquitectura

- **Todo en el navegador** para leer el save: `src/ersave.js` (parser), `src/app.js` (ficha), `map.html` (mapa), `src/marks.js` (marcas manuales, localStorage), `src/cloud.js` (capa de cuenta), `src/glossary.js` (explicaciones + enlaces a la wiki). PWA (`sw.js`, subir `VERSION` en cada cambio; actualmente `tl-v28`).
- **Despliegue**: Cloudflare **Worker con assets estáticos** (no Pages): `wrangler.toml` + `worker/index.js`, que enruta `/api/*` a los handlers de `functions/api/**` (escritos con la forma de Pages Functions, por si se vuelve a Pages) y sirve el resto como ficheros (`html_handling = "none"`, `/` → `index.html` en el worker). `.assetsignore` excluye código y herramientas. Deploy automático en cada push a `main` (Workers Builds, `npx wrangler deploy`). Los bindings viven en `wrangler.toml`: D1 `DB` (`tarnished-ledger`, id `1e0ef758-…`) y `ADMIN_STEAMIDS`. Secreto en el panel: `ANTHROPIC_API_KEY`.
- **Base de datos (D1)**: `db/schema.sql` (+ `db/migrations/`). Tablas: `users`, `sessions` (token hasheado, cookie `tl_session` 30 días), `characters` (`char_key = <steamid>:<slot>`, resumen JSON; nunca el .sl2), `marks` (marcas manuales por personaje), `markers` (comunidad; `pending|approved|rejected`), `advice` y `advice_log` (consejero).
- **Auth**: Steam OpenID (solo identidad pública). Un personaje solo puede sincronizarlo la cuenta de Steam dueña del save.
- **Datos del juego**: `data/items.json` (4184 objetos, de SaveForge + ER-Save-Editor), `data/flags.json` (BST de event flags; 396 gracias, 173 jefes, 318 objetos únicos, 271 zonas de mapa), `data/places.json` + `data/map.json` (marcadores del mapa interactivo de eldenring.wiki.gg, CC BY-NC-SA), `data/progression.json` (tabla curada: zonas, niveles, softcaps, piedras, bell bearings), `data/user_markers.json` (marcadores estáticos, legado).
- **Arte**: `icons/*.webp` (2858 iconos de la wiki) y `icons/map/*.webp` (fondos 4K). Es arte de FromSoftware: solo en repo privado; los workflows se niegan si el repo es público. Antes de abrir el repo hay que sacarlos del historial.

## Formato del save (lo que costó encontrar)

- BND4, cabecera 0x300; 10 slots × (MD5 0x10 + 0x280000); UserData10 después (slots activos +0x1954, perfiles +0x195E stride 0x24C: nombre, nivel +34, tiempo +38; SteamID +4).
- Slot: GaItem map (0x1400 entradas), PlayerGameData 0x1B0 (atributos, runas, nombre UTF-16, clase, regalo, +0xBE huecos de talismán, **+0xBF runa mayor equipada** (hallado por diff de dos saves: 3 = Godrick; Gabriell tiene 10 = "Great Rune of the Unborn", pendiente de confirmar), +0xF7 runa activa, +0xF9/+0xFA frascos), bloques de equipo, inventario (registros de 12 bytes), hechizos, accesos rápidos y bolsa (como handles de GaItem), cofre, 29 bytes de escalares (muertes, última gracia), event flags 0x1BF99F.
- Event flags: `block = id/1000 → pos` (tabla BST de SaveForge); byte = pos·125 + (id%1000)/8; bit = 7 − (id%1000)%8.
- Id de arma = base·10000 + infusión·100 + nivel; sombrías máx +10, normales +25.

## Decisiones tomadas

- No se sube el save: solo un resumen por personaje (nivel, atributos, equipo, armas con nivel, piedras, hechizos, talismanes, cenizas, objetos clave, progreso).
- Steam Cloud: no hay API de descarga para terceros (ICloudService es solo para el AppID propio; los ids de descarga son opacos). Solución: botón que abre `store.steampowered.com/account/remotestorageapp/?appid=1245620` y "Abrir .sl2". Nada de credenciales ni scraping.
- Mapa: idea de MapGenie (pictogramas por tipo, filtros, estados), nunca sus iconos ni sus datos.
- Moderación: propuestas pendientes hasta que un moderador aprueba; los moderadores publican directo (con casilla para enviar como pendiente y probar).
- Consejero: no es un MCP que consulte Claude, sino un informe que genera el Worker con la API y cachea en D1 (1 h entre informes, 5/día; moderadores sin límite). Modelo por defecto `claude-sonnet-5-5` (`ADVICE_MODEL`). `ADVICE_MOCK=1` en local devuelve el contexto sin gastar.
- Iconos: extraídos de la wiki (no de los ficheros del juego). Faltan ~171 (nombres con corchetes, notas, gloveworts).

## Hecho (cronológico)

1. Parser + ficha (estado, equipo, inventario, forja) y selector de personaje.
2. Iconos de la wiki (script en PC + workflow), enlaces a la wiki, filtro tengo/no tengo.
3. Progreso desde event flags; mapa con gracias, jefes, lugares, objetos pendientes por lugar, editor de marcadores.
4. Rediseño al estilo de los menús del juego; jerarquía save → personaje → Ficha/Mapa → pestañas.
5. Pictogramas por tipo en el mapa, filtros de lugar, estados visitado/pendiente, marcas manuales por personaje.
6. Runa mayor equipada (offset +0xBF).
7. Alpha con cuenta: Steam OpenID, D1, sync de marcas, resúmenes de personaje, marcadores de la comunidad con moderación; conversión a Worker con assets.
8. Glosario con explicaciones y enlaces en la ficha; moderación con casilla "enviar como pendiente".
9. Progreso con casillas tocables → listas pendientes/hechos/todos por región y enlace al mapa filtrado (`map.html#l=boss&t=main&s=todo`); selector Todo/Pendiente/Hecho en el mapa.
10. Consejero (pestaña + API + migración 002).

## Pendiente / ideas

- [ ] Rob: ejecutar `db/migrations/002_advice.sql`, poner `ANTHROPIC_API_KEY` y probar el primer informe; ajustar el prompt con el resultado.
- [ ] Consejero: herramienta de wiki (que compruebe escalado/requisitos de armas antes de recomendarlas); quizá pedir "qué hacer hoy en 1 hora".
- [ ] Confirmar la tabla de ids de runa mayor (valores distintos de 0, 3 y 10).
- [ ] Mapa: más coordenadas (solo 17 de 35 jefes principales tienen pin; vía marcadores de la comunidad); iconos por objeto en marcadores comunitarios; filtro de tipo de jefe visible en la UI (hoy solo por hash).
- [ ] Iconos que faltan (alias de nombres).
- [ ] Gestión de cuenta: borrar cuenta/personajes; que un usuario pueda retirar un marcador aprobado suyo.
- [ ] Público: sacar el arte del repo y del historial, licencia (GPL-3.0 por SaveForge), atribuciones (wiki CC BY-NC-SA), quitar Cloudflare Access, OAuth propio si se expone un MCP.
- [ ] MCP remoto (`/mcp/<token>`) con las mismas herramientas, para usar desde la app de Claude o Claude Code.
- [ ] Opcional PC: vigilar el .sl2 con File System Access API para actualizar sin abrir el archivo a mano.

## Cómo trabajar

- Local (`wrangler.toml` ya está en el repo): `npx wrangler d1 execute DB --local --file db/schema.sql` y `npx wrangler dev --port 8791 [--var ADVICE_MOCK:1]`. Para probar con sesión, inserta en la D1 local un usuario y una sesión (`sessions.id` = SHA-256 del token de la cookie).
- Saves de prueba (fuera del repo, `.gitignore`): un save de octubre con Arcano 35 y otro con Arcano 44 y la runa de Godrick equipada.
- Fuentes consultadas: oisis/EldenRing-SaveForge (Go), ClayAmore/ER-Save-Editor (Rust), Ariescyn/EldenRing-Save-Manager, eldenring.wiki.gg (API MediaWiki y DataMaps).
- Commits en español, firmados como Rob; subir `VERSION` del service worker con cada cambio de ficheros.
