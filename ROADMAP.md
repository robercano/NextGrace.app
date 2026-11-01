# Tarnished Ledger — estado del proyecto y hoja de ruta

Documento de continuidad: lo que hay, por qué está así y lo que falta. Léelo entero antes de tocar nada; el README cubre la instalación.

## Qué es

Lector de partidas de Elden Ring (PC, `ER0000.sl2`) para preparar la siguiente sesión desde el móvil: ficha del personaje al estilo de los menús del juego, inventario con iconos, planificador de forja, progreso (gracias, jefes, objetos únicos), mapa con lo pendiente, cuenta opcional con Steam para sincronizar marcas y un "consejero" que genera un informe con Claude. Privado por ahora (Cloudflare Access); objetivo: público y con mapa editable por la comunidad.

Usuario: Rob (SteamID REPLACE_WITH_YOUR_STEAMID64, moderador). Dos personajes: Gabriell (Astrologer 220, casi todo hecho) y Arcano (Prophet ~44, Liurnia a medias; usa Finger Seal + Winged Scythe). Idioma de la interfaz: español o inglés (conmutador ES/EN en la cabecera; `?lang=en`, se guarda en `localStorage` `tl.lang`); nombres de objetos siempre en inglés (los de la wiki).

## Arquitectura

- **Todo en el navegador** para leer el save: `src/ersave.js` (parser), `src/app.js` (ficha), `map.html` (mapa), `src/marks.js` (marcas manuales, localStorage), `src/cloud.js` (capa de cuenta), `src/glossary.js` (explicaciones + enlaces a la wiki, `es`/`en`), `src/i18n.js` (traducción: las claves son el texto en español, `T("texto", …args)` con `{0}`; en HTML `data-i18n`, `data-i18n-ph`, `data-i18n-title`; `I18N.apply()` al cargar, `I18N.locale()` para números y fechas). Para añadir un texto nuevo: escribirlo en español envuelto en `T()` y añadir su traducción a la tabla `EN`. PWA (`sw.js`, subir `VERSION` en cada cambio; actualmente `tl-v57`).
- **Despliegue**: Cloudflare **Worker con assets estáticos** (no Pages): `wrangler.toml` + `worker/index.js`, que enruta `/api/*` a los handlers de `functions/api/**` (escritos con la forma de Pages Functions, por si se vuelve a Pages) y sirve el resto como ficheros (`html_handling = "none"`, `/` → `index.html` en el worker). `.assetsignore` excluye código y herramientas. Deploy automático en cada push a `main` (Workers Builds, `npx wrangler deploy`). Los bindings viven en `wrangler.toml`: D1 `DB` (`tarnished-ledger`, id `1e0ef758-…`) y `ADMIN_STEAMIDS`. Secreto en el panel: `ANTHROPIC_API_KEY`.
- **Base de datos (D1)**: `db/schema.sql` (+ `db/migrations/`). Tablas: `users`, `sessions` (token hasheado, cookie `tl_session` 30 días), `characters` (`char_key = <steamid>:<slot>`, resumen JSON; nunca el .sl2), `marks` (marcas manuales por personaje), `markers` (comunidad; `pending|approved|rejected`), `advice` y `advice_log` (consejero).
- **Auth**: Steam OpenID (solo identidad pública). Un personaje solo puede sincronizarlo la cuenta de Steam dueña del save.
- **Datos del juego**: `data/reqs.json` (requisitos/escalado desde la wiki; el workflow `reqs` lo regenera y deja el log en `tools/reqs_log.txt` porque los logs de Actions no se pueden leer desde la sesión), `data/items.json` (4184 objetos, de SaveForge + ER-Save-Editor), `data/flags.json` (BST de event flags; 396 gracias, 173 jefes, 318 objetos únicos, 271 zonas de mapa), `data/places.json` + `data/map.json` (marcadores del mapa interactivo de eldenring.wiki.gg, CC BY-NC-SA), `data/progression.json` (tabla curada: zonas, niveles, softcaps, piedras, bell bearings), `data/user_markers.json` (marcadores estáticos, legado).
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
- Consejero, cuándo se genera: automáticamente al subir un save cuyo resumen cambió (el navegador lo lanza tras guardar el resumen, solo para el personaje en pantalla; si cambias de personaje mientras tanto se encola). La caché va por hash de resumen + idioma + `PROMPT_VERSION` (súbela al cambiar el prompt o el contexto y el siguiente save regenera solo). Con el mismo save el botón pasa a "Otra opinión" (pide confirmación y manda `force: true`). Un solo trabajo por personaje a la vez (`advice_jobs`, creada al vuelo; otra pestaña ve "generando…" y sondea cada 5 s).
- Iconos: hoy extraídos de la wiki (faltan 13 sin página). Para la web pública se sustituyen por los extraídos de la copia del juego de Rob (ver «Beta pública»).

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
10. Consejero (pestaña + API + migración 002); respuesta en streaming con latidos; enlaces del informe al mapa (`#focus=`).
12. "¿Puedo usarlo?": `tools/fetch_reqs.py` + workflow `reqs` → `data/reqs.json` (requisitos, escalado, tipo, skill, FP/huecos de hechizos; 740/748 armas). Marcas rojas/amarillas (no cumples / solo a dos manos) en inventario, equipo y forja, filtro "Puedo usar / No cumplo", requisitos en el detalle, y el Consejero recibe por arma requisitos, escalado y usabilidad.
11. Estado: "Pendiente de aplicar" (semillas, runas sin consumir, remembranzas, libros/pergaminos, campanas, gloveworts, piedras de dragón) y planificador de nivel (coste real por nivel, soft caps, runas en objetos). Forja: cenizas de espíritu con gloveworts. Progreso: diario de sesión (tabla `history`, creada por el Worker al vuelo; snapshot por cada tiempo de juego distinto).
13. Traducción al inglés de toda la web (ficha, mapa, glosario, mensajes de error) y del informe del Consejero (`SYSTEM_EN`; la caché va por idioma).
14. Consejero automático al subir un save nuevo, versión de prompt en el hash, "Otra opinión" con confirmación y estado "generando" compartido entre pestañas.

## Pendiente / ideas

- [ ] Rob: ejecutar `db/migrations/002_advice.sql`, poner `ANTHROPIC_API_KEY` y probar el primer informe; ajustar el prompt con el resultado.
- [ ] Consejero: si molesta que se corte al cerrar la web enseguida, pasar a cola en D1 + cron del Worker. Herramienta de wiki (que compruebe escalado/requisitos de armas antes de recomendarlas); quizá pedir "qué hacer hoy en 1 hora".
- [ ] Confirmar la tabla de ids de runa mayor (valores distintos de 0, 3 y 10).
- [ ] Mapa: más coordenadas (solo 17 de 35 jefes principales tienen pin; vía marcadores de la comunidad); iconos por objeto en marcadores comunitarios; filtro de tipo de jefe visible en la UI (hoy solo por hash).
- [ ] Iconos que faltan (alias de nombres).
- [ ] Gestión de cuenta: que un usuario pueda retirar un marcador aprobado suyo (el borrado de cuenta está en «Beta pública»).
- [ ] Público (ver «Beta pública» abajo): quitar Cloudflare Access; OAuth propio si se expone un MCP.
- [ ] MCP remoto (`/mcp/<token>`) con las mismas herramientas, para usar desde la app de Claude o Claude Code.
- [ ] Opcional PC: vigilar el .sl2 con File System Access API para actualizar sin abrir el archivo a mano.

## Beta pública: revisión legal y plan (1 nov 2026)

Inventario de lo que hay en el repo y qué decidió Rob sobre cada punto. No es asesoramiento legal.

| Material | Origen y situación | Decisión |
|---|---|---|
| `icons/*.webp` (2858) y `icons/map/*.webp` (fondos 4K) | Arte de FromSoftware/Bandai Namco, bajado de la wiki. Riesgo real: aviso de retirada (DMCA), no demanda. | Extraer de la copia del juego de Rob (`tools/extract_icons_game.py`, `tools/EXTRACT.md`), guardarlos en un **repo privado aparte** y servirlos desde el servidor (bucket R2 detrás del Worker, workflow del repo privado que sube al bucket). Riesgo asumido por Rob. Aviso "no afiliado" + contacto de retirada. Nunca en el repo público ni en su historial; la web funciona sin iconos (muestra el nombre). |
| `items.json → loc` (3629 textos de ubicación) y `places.json` (derivado) | Prosa de **Fextralife** copiada por SaveForge (`item_text_generated.go`, delatada por "[Map Link]"). Fextralife no licencia su contenido. | Sustituir por la sección Location/Where to find de eldenring.wiki.gg (API MediaWiki, lotes de 50), aceptando huecos. Workflow `locations` repetible (rellena huecos en ejecuciones posteriores, nunca borra) + `data/overrides/locations.json` manual que gana siempre. `reqs` pasa al mismo esquema. Log en `tools/locations_log.txt`. |
| `reqs.json`, `map.json`, textos de ubicación nuevos | eldenring.wiki.gg: **CC BY-SA 4.0** (comprobado en el pie de la wiki; el README decía BY-NC-SA, es un error). Las cifras son hechos del juego. | Atribución en la página de créditos con enlace a la licencia; esos ficheros de datos quedan bajo CC BY-SA 4.0. No afecta al código ni a los informes. |
| `src/ersave.js`, `flags.json`, `items.json` (ids/nombres) | Escritos/extraídos con SaveForge (GPL-3.0), ER-Save-Editor y EldenRing-Save-Manager como referencia. Leaflet BSD-2. Cinzel y EB Garamond (Google Fonts, libres). | Proyecto bajo **GPL-3.0** (`LICENSE`), créditos a los tres proyectos con sus licencias, aviso de Leaflet y fuentes. Lectura del formato del save por ingeniería inversa: riesgo asumido; disclaimer de **solo lectura** (nunca se modifica el save, no se toca el juego ni ningún anti-cheat) en la pantalla de inicio y en la página legal. Sin logo ni tipografías de Elden Ring. |
| Datos de usuarios: SteamID, nombre y avatar, resúmenes de personaje, marcadores, logs de Cloudflare | Rob pasa a ser responsable del tratamiento (RGPD). El resumen del personaje se envía a Anthropic para el informe (nunca el save ni la identidad de Steam). | Página de privacidad (qué, para qué, cuánto tiempo, encargados: Cloudflare y Anthropic, cómo borrar), **borrado de cuenta y datos desde la web**, "Powered by Steam" si el callback usa la Web API, condiciones mínimas para marcadores de la comunidad + contacto de retirada. **Nada de analítica** → sin banner de cookies (sesión y localStorage son estrictamente necesarios). Contacto a decidir por Rob (correo propio o del proyecto). |
| `progression.json`, glosario, informes del consejero, nombre "Tarnished Ledger" | Propios / permitidos por los términos de la API. | Sin cambios. |

### Tareas (un commit por cada una, para probar una a una)

1. [ ] `tools/fetch_locations.py` + workflow `locations` (manual y mensual): textos de ubicación desde wiki.gg a `items.json`, log de huecos, fecha de recarga en el fichero. No borra lo existente si la wiki no tiene texto.
2. [ ] `data/overrides/locations.json` (y `reqs`): correcciones manuales que ganan sobre la wiki; `reqs` usa el mismo mecanismo de recarga.
3. [ ] Ejecutar `locations` en Actions, revisar el log con Rob, regenerar `places.json` y retirar los textos de Fextralife.
4. [ ] `LICENSE` GPL-3.0 y página de créditos/legal (`about.html`): atribuciones (wiki.gg CC BY-SA 4.0, SaveForge, ER-Save-Editor, EldenRing-Save-Manager, Leaflet, fuentes), aviso "no afiliado", arte propiedad de sus dueños con contacto de retirada, disclaimer de solo lectura. Enlace desde el pie de la ficha y del mapa. Corregir README (CC BY-SA).
5. [ ] Disclaimer de solo lectura en la pantalla de inicio.
6. [ ] Página de privacidad (ES/EN) y condiciones mínimas de los marcadores de la comunidad.
7. [ ] Borrado de cuenta y datos desde la hoja de cuenta (`DELETE /api/me`: users, sessions, characters, marks, advice, advice_log, history; los marcadores aprobados quedan anonimizados o se borran, a decidir).
8. [ ] "Powered by Steam" si el callback usa la Web API (revisar `functions/api/auth/`).
9. [ ] Iconos propios: primera ejecución de `extract_icons_game.py` con los ficheros de Rob (ajustar el parser de `.layout` si hace falta) → repo privado de assets → bucket R2 → el Worker sirve `/icons/` desde R2 → retirar `icons/` del repo.
10. [ ] Abrir el repo: purgar el arte del historial (`git filter-repo`), comprobar que los workflows siguen negándose con arte, quitar Cloudflare Access.

## Cómo trabajar

- Local (`wrangler.toml` ya está en el repo): `npx wrangler d1 execute DB --local --file db/schema.sql` y `npx wrangler dev --port 8791 [--var ADVICE_MOCK:1]`. Para probar con sesión, inserta en la D1 local un usuario y una sesión (`sessions.id` = SHA-256 del token de la cookie).
- Saves de prueba (fuera del repo, `.gitignore`): un save de octubre con Arcano 35 y otro con Arcano 44 y la runa de Godrick equipada.
- Fuentes consultadas: oisis/EldenRing-SaveForge (Go), ClayAmore/ER-Save-Editor (Rust), Ariescyn/EldenRing-Save-Manager, eldenring.wiki.gg (API MediaWiki y DataMaps).
- Commits en español, firmados como Rob; subir `VERSION` del service worker con cada cambio de ficheros.
