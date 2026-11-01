/* i18n.js — UI language. Source strings are Spanish (the keys); EN is the translation table.
 * T("texto") / T("texto {0}", x). Missing keys fall back to Spanish. Language: ?lang=, then localStorage tl.lang, then the browser.
 * Static markup: elements with data-i18n (text), data-i18n-ph (placeholder), data-i18n-title (title) are translated by I18N.apply().
 */
(function (root) {
  const EN = {
    // header / onboarding
    "onb1": "Steam opens the page with your Elden Ring files (sign in to Steam if asked). Tap <i>Download</i> next to <code>ER0000.sl2</code>.",
    "onb2": "Pick the <code>ER0000.sl2</code> you just downloaded (on PC the one in <code>%AppData%\\EldenRing\\&lt;SteamID&gt;\\</code> works too).",
    "Abrir Steam Cloud": "Open Steam Cloud", "Elegir archivo": "Choose file", "Runas": "Runes", "Mostrar más": "Show more", "Acceso rápido y bolsa": "Quick items & pouch",
    "Abrir .sl2": "Open .sl2", "Entrar": "Sign in", "Cerrar": "Close", "Ficha": "Sheet", "Mapa": "Map", "Cuenta": "Account",
    "Estado": "Status", "Equipo": "Equipment", "Inventario": "Inventory", "Forja": "Smithing", "Progreso": "Progress", "Consejero": "Advisor",
    "Lector de partida de Elden Ring": "Elden Ring save reader",
    "Tu partida se lee entera en este navegador: no se sube a ningún sitio.": "Your save is read entirely in this browser: nothing is uploaded.",
    "Descarga el archivo de Steam Cloud": "Download the file from Steam Cloud",
    "Ábrelo aquí": "Open it here",
    "Descargar la partida de Steam Cloud": "Download the save from Steam Cloud",
    // status
    "Atributos": "Attributes", "planificar": "plan", "Personaje": "Character", "Resistencias (acumulado actual)": "Resistances (current build-up)", "Carga y frascos": "Load & flasks",
    "Pendiente de aplicar": "Waiting to be used", "Objetos del inventario que aún no has gastado o entregado y que mejoran al personaje.": "Items in your inventory you haven't used or handed in yet that improve the character.",
    "Vigor": "Vigor", "Mente": "Mind", "Resistencia": "Endurance", "Fuerza": "Strength", "Destreza": "Dexterity", "Inteligencia": "Intelligence", "Fe": "Faith", "Arcano": "Arcane",
    "FUE": "STR", "DES": "DEX", "INT": "INT", "FE": "FAI", "ARC": "ARC",
    "Nivel": "Level", "Clase": "Class", "Regalo": "Keepsake", "ninguno": "none", "ninguna": "none", "Runas totales": "Total runes", "Muertes": "Deaths", "Ciclo": "Cycle",
    "Nivel de arma (matchmaking)": "Weapon level (matchmaking)", "Runa mayor equipada": "Great Rune equipped", "Runa mayor activa (Arco de Runa)": "Great Rune active (Rune Arc)", "sí": "yes", "no": "no", "Huecos de talismán": "Talisman slots",
    "Veneno": "Poison", "Putrefacción": "Scarlet Rot", "Hemorragia": "Hemorrhage", "Congelación": "Frostbite", "Sueño": "Sleep", "Locura": "Madness", "Muerte": "Death Blight",
    "Carga de equipo": "Equip load", "Carga ligera": "Light Load", "Carga media": "Medium Load", "Carga pesada": "Heavy Load", "Sobrecargado": "Overloaded", "(aprox.)": "(approx.)",
    "Frasco carmesí": "Crimson flask", "Frasco cerúleo": "Cerulean flask", "Hechizos memorizados": "Memorized spells",
    "{0} muertes": "{0} deaths", "Base {0} + {1}": "Base {0} + {1}", "Base {0} · {1}": "Base {0} · {1}",
    "Ver en la wiki ↗": "See on the wiki ↗", "Ver en la wiki": "See on the wiki", "Ver en el mapa": "See on the map",
    // planner
    "cap {0}/{1}": "cap {0}/{1}", "base; con bonus {0}": "base; with bonus {0}", "por encima del segundo soft cap: rinde muy poco": "above the second soft cap: very little gain", "por encima del primer soft cap: rinde menos": "above the first soft cap: diminishing returns",
    "Coste en runas": "Rune cost", "Runas disponibles": "Runes available", " (incl. {0} en objetos)": " (incl. {0} in items)", "Te sobrarían": "You'd have left", "Te faltarían": "You'd be short",
    "Con lo que tienes puedes subir": "With what you have you can gain", "{0} nivel{1} (hasta {2})": "{0} level{1} (up to {2})", "es": "s",
    "Reiniciar": "Reset", "Gastar lo disponible": "Spend what you have", "Reparte los niveles que puedes pagar en los atributos que ya has tocado, o en Vigor si no has tocado ninguno": "Spreads the levels you can afford across the attributes you've touched, or Vigor if none",
    "Soft caps: a partir del primero cada punto rinde menos; a partir del segundo, casi nada. El coste por nivel es el del juego (crece con el nivel, no con el atributo). Se planifica sobre el valor base; entre paréntesis, el efectivo con tu equipo.": "Soft caps: past the first each point gives less; past the second, almost nothing. Level cost is the game's (it grows with level, not with the attribute). Planning uses base values; in brackets, the effective value with your gear.",
    // spirits
    "máx": "max", "puedes subir a +{0}": "can go to +{0}", "para +{0} falta {1}": "for +{0} you need {1}", "Sin cenizas de espíritu.": "No spirit ashes.",
    "Cenizas de espíritu · gloveworts": "Spirit ashes · gloveworts", "Tus cenizas de espíritu": "Your spirit ashes",
    "Roderika (Mesa Redonda) sube cada ceniza hasta +10: un glovewort del número del nivel y uno \"Great\" para el +10. Las cenizas con nombre (Mimic Tear, Tiche, Oleg…) usan Ghost Glovewort; el resto, Grave Glovewort.": "Roderika (Roundtable Hold) upgrades each ash up to +10: one glovewort of the level's number and a \"Great\" one for +10. Named ashes (Mimic Tear, Tiche, Oleg…) use Ghost Glovewort; the rest, Grave Glovewort.",
    "Hasta dónde puedes subir cada una ahora con lo que llevas, y qué falta para el siguiente nivel.": "How far you can upgrade each one right now, and what's missing for the next level.",
    // unused
    "En un lugar de gracia": "At a site of grace", "Se aplican desde el menú de la gracia: más cargas y curación de los frascos; en la expansión, la bendición del Scadutree y de las cenizas.": "Used from the grace menu: more flask charges and healing; in the expansion, the Scadutree and spirit-ash blessings.",
    " Ya tienes las 14 cargas máximas: las semillas sobrantes no se pueden usar.": " You already have the 14 maximum charges: spare seeds can't be used.",
    "Runas sin consumir": "Unconsumed runes", "Valen {0} runas en total; úsalas cuando vayas a subir de nivel o comprar.": "Worth {0} runes in total; use them when you're about to level up or buy.",
    "Remembranzas": "Remembrances", "Enia (Mesa Redonda) las cambia por el arma o hechizo del jefe; también se pueden consumir por runas.": "Enia (Roundtable Hold) trades them for the boss's weapon or spell; they can also be consumed for runes.",
    "Entregar a un PNJ": "Hand in to an NPC", "Libros de oración → Corhyn o Miriel; pergaminos → Sellen o Thops; Deathroot → Gurranq; Dragon Heart → altares de Comunión Dragón.": "Prayerbooks → Corhyn or Miriel; scrolls → Sellen or Thops; Deathroot → Gurranq; Dragon Hearts → Dragon Communion altars.",
    "Campanas de vendedor": "Bell bearings", "Entrégalas a las Gemelas Vendedoras de la Mesa Redonda para comprar lo que vendía ese mercader (piedras incluidas).": "Give them to the Twin Maiden Husks at the Roundtable Hold to buy what that merchant sold (stones included).",
    "Para Roderika (espíritus)": "For Roderika (spirits)", "Mejoran las cenizas de espíritu en la Mesa Redonda.": "Upgrade spirit ashes at the Roundtable Hold.",
    "Piedras de dragón": "Dragon stones", "Suben un arma al máximo (+25 o +10 sombría). Elige bien: no se compran.": "Take a weapon to max (+25, or +10 somber). Choose well: they can't be bought.",
    "Otros": "Other", "Larval Tear: redistribuir atributos con Rennala. Rune Arc: activa la runa mayor equipada.": "Larval Tear: respec with Rennala. Rune Arc: activates the equipped Great Rune.",
    // equipment
    "Dcha {0}": "Right {0}", "Izq {0}": "Left {0}", "Flecha {0}": "Arrow {0}", "Virote {0}": "Bolt {0}", "Cabeza": "Head", "Pecho": "Chest", "Brazos": "Arms", "Piernas": "Legs", "Runa mayor": "Great Rune", "Talismán {0}": "Talisman {0}", "Rápido {0}": "Quick {0}", "Bolsa {0}": "Pouch {0}", "Hechizo {0}": "Spell {0}", "Físico {0}": "Physick {0}",
    "Toca un hueco para ver el objeto.": "Tap a slot to see the item.", "Toca un objeto para ver el detalle.": "Tap an item for details.",
    "Ceniza: {0}": "Ash: {0}", "Peso {0}": "Weight {0}", "en el cofre": "in the chest",
    "Armamento": "Armament", "Armadura y talismanes": "Armor & talismans", "Accesos rápidos y bolsa": "Quick items & pouch", "Hechizos y físico": "Spells & physick",
    // requirements
    "con {0}": "with {0}", ", a dos manos": ", two-handed", "a dos manos": "two-handed", "faltan {0}": "need {0}",
    "solo gracias a {0}{1}: tus atributos base no llegan": "only thanks to {0}{1}: your base attributes fall short", " (y a dos manos)": " (and two-handed)", "solo a dos manos": "two-handed only", "no cumples: {0}": "requirements not met: {0}", "{0} {1} (tienes {2})": "{0} {1} (you have {2})",
    "Requisitos: {0}": "Requirements: {0}", "Sin requisitos": "No requirements", "Escalado: {0}": "Scaling: {0}", "huecos {0}": "slots {0}",
    // forge
    "Dragón": "Dragon", "(máx +{0})": "(max +{0})", "Ninguna arma a medias: todo lo que has tocado está al máximo.": "No weapons in progress: everything you've touched is maxed.", "{0} armas al máximo": "{0} weapons at max",
    "Ya está al máximo.": "Already at max.", "De +{0} a +{1}": "From +{0} to +{1}", " (está en el cofre)": " (it's in the chest)", "✓ tienes todo": "✓ you have everything", "faltan piedras": "missing stones",
    "Qué armas puedes subir de nivel con las piedras que llevas (inventario y cofre).": "Which weapons you can upgrade with the stones you carry (inventory and chest).",
    "Piedras de forja · armas normales (hasta +25)": "Smithing stones · regular weapons (up to +25)", "Piedras sombrías · armas especiales (hasta +10)": "Somber stones · special weapons (up to +10)",
    "Planificar una mejora": "Plan an upgrade", "hasta +": "up to +", "Armas a medias": "Weapons in progress", "Toca una para planificarla.": "Tap one to plan it.",
    // inventory
    "Todo": "All", "Armas": "Weapons", "Armadura": "Armor", "Talismanes": "Talismans", "Cenizas": "Ashes", "Magia": "Magic", "Consumibles": "Consumables", "Clave": "Key",
    "Tengo": "Have", "No tengo": "Don't have", "Puedo usar": "Can use", "Solo con bonus": "Only with bonus", "No cumplo": "Can't use",
    "Con tus atributos base (a una o dos manos)": "With your base attributes (one- or two-handed)", "Solo gracias a talismanes, cascos o runa mayor": "Only thanks to talismans, helms or Great Rune", "Ni con el equipo actual": "Not even with current gear",
    "{0} por conseguir de {1}": "{0} to get out of {1}", " (filtrado)": " (filtered)", "{0} objetos": "{0} items", "Mostrar {0} más ({1} restantes)": "Show {0} more ({1} left)",
    "Buscar objeto…": "Search items…", "Cargar iconos": "Load icons", "Añadir iconos": "Add icons", "{0} iconos del sitio.": "{0} icons from the site.", "{0} iconos disponibles.": "{0} icons available.", "{0} iconos guardados en este navegador.": "{0} icons saved in this browser.",
    "No se pudo cargar el lector de zip; sube las imágenes sueltas.": "Couldn't load the zip reader; upload the images individually.", "Este navegador no permite guardar los iconos.": "This browser can't store the icons.", "Error al importar: {0}": "Import error: {0}",
    "Armas": "Weapons", "Arcos y catalizadores": "Bows & catalysts", "Escudos": "Shields", "Munición": "Ammunition", "Cascos": "Helms", "Pechos": "Chest armor", "Brazos": "Gauntlets", "Piernas": "Greaves", "Talismanes": "Talismans", "Cenizas de guerra": "Ashes of War", "Cenizas espirituales": "Spirit Ashes", "Hechicerías": "Sorceries", "Encantamientos": "Incantations", "Herramientas": "Tools", "Objetos clave": "Key items", "Materiales": "Materials", "Mejora": "Upgrade materials", "Información": "Info", "Gestos": "Gestures",
    // progress
    "Gracias": "Graces", "Jefes principales": "Main bosses", "Jefes de campo": "Field bosses", "Jefes de campo y mazmorras": "Field & dungeon bosses", "Objetos únicos": "Unique items", "Objetos únicos del mundo": "Unique world items", "Zonas de mapa": "Map areas",
    "Jefes de mazmorras legado y de historia.": "Legacy dungeon and story bosses.", "Según el save; si uno está mal (opcional ya vencido que el juego no marca), márcalo a mano.": "From the save; if one is wrong (an optional boss you beat that the game doesn't flag), mark it by hand.", "Jefes que dejan una remembranza al morir.": "Bosses that drop a remembrance.", "Notas, mapas, cartas, lágrimas, recetarios, llaves… que existen una sola vez y aún no has cogido.": "Notes, maps, letters, tears, cookbooks, keys… that exist only once and you haven't picked up yet.",
    "Pendientes": "Pending", "Hechos": "Done", "Todos": "All", "Filtrar…": "Filter…", "Nada pendiente.": "Nothing pending.", "Nada todavía.": "Nothing yet.", "remembranza": "remembrance", "✓ a mano": "✓ by hand", "marcar": "mark", "✓ marcado": "✓ marked", "Marcar a mano": "Mark by hand",
    "Toca una casilla para ver la lista de pendientes y hechos.": "Tap a tile to see the pending and done lists.",
    "Marcas manuales ({0})": "Manual marks ({0})", "Lo que has marcado a mano para este personaje (lugares en el mapa, jefes, gracias, objetos). Se guarda en este navegador{0}. \"Exportar\" copia el JSON.": "What you've marked by hand for this character (map places, bosses, graces, items). Stored in this browser{0}. \"Export\" copies the JSON.",
    " y en tu cuenta (sincronizado con Steam)": " and in your account (synced with Steam)", "; si entras con Steam (botón de cuenta arriba) se sincroniza entre dispositivos": "; if you sign in with Steam (account button above) it syncs across devices",
    "quitar": "remove", "Ninguna todavía.": "None yet.", "Exportar": "Export", "Importar": "Import", "Copiado": "Copied", "Copia este JSON:": "Copy this JSON:", "JSON no válido": "Invalid JSON",
    "Sin datos de progreso (vuelve a abrir el .sl2).": "No progress data (open the .sl2 again).",
    "Gracias descubiertas y jefes vencidos, leídos de los event flags de la partida.": "Graces discovered and bosses beaten, read from the save's event flags.",
    // diary
    "Diario: primera sesión registrada ({0}). A partir de la próxima partida que abras verás aquí qué ha cambiado.": "Diary: first session recorded ({0}). From the next save you open you'll see here what changed.",
    "Diario · desde la sesión anterior": "Diary · since last session", "nivel ({0})": "level ({0})", "jugado": "played", "jefes": "bosses", "gracias": "graces", "objetos": "items", "muertes": "deaths",
    "Jefes vencidos:": "Bosses beaten:", "Armas mejoradas:": "Weapons upgraded:", "Atributos:": "Attributes:", "Nivel por sesión": "Level per session", "{0}: nivel {1}": "{0}: level {1}", "nv {0}": "lv {0}",
    "{0} sesiones registradas (una por cada partida con tiempo de juego distinto que abres con la sesión iniciada).": "{0} sessions recorded (one per save with a different play time opened while signed in).",
    // loading
    "No se pudo leer {0} slot(s): {1}": "Couldn't read {0} slot(s): {1}", "No hay personajes legibles en este archivo.": "No readable characters in this file.", "Leyendo {0}…": "Reading {0}…",
    "Resumen de personajes guardado en tu cuenta.": "Character summary saved to your account.", "No se pudo guardar el resumen en tu cuenta: {0}": "Couldn't save the summary to your account: {0}",
    "última partida abierta en este navegador; usa \"Abrir otro .sl2\" para actualizar": "last save opened in this browser; use \"Open .sl2\" to update",
    "No se pudo cargar la base de datos de objetos: {0}": "Couldn't load the item database: {0}", "Nv {0}": "Lv {0}",
    // advisor
    "Informe para tu próxima sesión, generado por Claude a partir del resumen del personaje guardado en tu cuenta (atributos, armas, piedras, jefes y gracias). Orientativo: el juego es tuyo.": "A report for your next session, generated by Claude from the character summary stored in your account (attributes, weapons, stones, bosses and graces). Guidance only: the game is yours.",
    "Entra con Steam (botón de cuenta, arriba) y abre tu .sl2 una vez: el consejero trabaja sobre el resumen del personaje guardado en tu cuenta.": "Sign in with Steam (account button above) and open your .sl2 once: the advisor works from the character summary stored in your account.",
    "Entrar con Steam": "Sign in with Steam", "Cargando…": "Loading…", "Este personaje aún no está en tu cuenta: vuelve a abrir el .sl2 con la sesión iniciada.": "This character isn't in your account yet: open the .sl2 again while signed in.",
    "El consejero no está configurado en el servidor (falta la clave de la API).": "The advisor isn't configured on the server (API key missing).", "Podrás pedir otro informe en {0} h.": "You can request another report in {0} h.", "Has llegado al máximo diario de informes.": "You've reached today's report limit.", "Has abierto una partida más reciente que la de este informe.": "You've opened a newer save than this report's.",
    "Generado el {0}": "Generated {0}", " · desactualizado": " · out of date", "Todavía no hay informe para este personaje.": "No report for this character yet.", " · {0}/{1} hoy": " · {0}/{1} today", "Generando…": "Generating…", "Actualizar": "Refresh", "Generar informe": "Generate report",
    // about.html / privacy.html
    "← Ficha": "← Sheet", "Créditos y licencias": "Credits & licences", "Qué es": "What it is", "Sin afiliación": "Not affiliated", "Datos del juego": "Game data", "Código y componentes": "Code & components", "Contacto": "Contact", "Política de privacidad": "Privacy policy",
    "ab.what1": "Tarnished Ledger is a fan project that reads your Elden Ring save (PC, <code>ER0000.sl2</code>) to plan your next session: character sheet, inventory, smithing, progress, map and an advisor.",
    "ab.what2": "<b>Read-only.</b> The site reads the save file and never modifies it. It does not touch the game, its files or any anti-cheat system, and never connects to the game in any way. The file is parsed entirely in your browser and is not uploaded anywhere; if you sign in with Steam, only a per-character summary (level, attributes, gear, progress) is stored. See the <a href=\"privacy.html\">privacy policy</a> for details.",
    "ab.aff1": "This site is not affiliated with or endorsed by FromSoftware or Bandai Namco Entertainment. ELDEN RING and the game's names, images and other elements belong to their respective owners and are used here for informational purposes only, for people who already own the game.",
    "ab.aff2": "If you hold rights to any content on this site and want it removed, write to the contact address below and it will be taken down.",
    "ab.data1": "<a href=\"https://eldenring.wiki.gg\" target=\"_blank\" rel=\"noopener\">Elden Ring Wiki (eldenring.wiki.gg)</a>, licensed <a href=\"https://creativecommons.org/licenses/by-sa/4.0/\" target=\"_blank\" rel=\"noopener\">CC BY-SA 4.0</a>: weapon and spell requirements and scaling, weights, where-to-find texts and the interactive map markers. The derived data files (<code>data/reqs.json</code>, <code>data/locations.json</code>, <code>data/map.json</code>, <code>data/places.json</code>) are published under the same licence.",
    "ab.data2": "Item names, identifiers and event flags: extracted with <a href=\"https://github.com/oisis/EldenRing-SaveForge\" target=\"_blank\" rel=\"noopener\">EldenRing-SaveForge</a> (GPL-3.0). The save format was also studied with <a href=\"https://github.com/ClayAmore/ER-Save-Editor\" target=\"_blank\" rel=\"noopener\">ER-Save-Editor</a> and <a href=\"https://github.com/Ariescyn/EldenRing-Save-Manager\" target=\"_blank\" rel=\"noopener\">EldenRing-Save-Manager</a> as references.",
    "ab.data3": "The indicative progression table, the glossary and the interface texts are our own.",
    "ab.code1": "Tarnished Ledger's code is released under <a href=\"https://www.gnu.org/licenses/gpl-3.0.html\" target=\"_blank\" rel=\"noopener\">GPL-3.0</a>: <a href=\"https://github.com/robercano/TarnishedViewer\" target=\"_blank\" rel=\"noopener\">github.com/robercano/TarnishedViewer</a>.",
    "ab.code2": "<a href=\"https://leafletjs.com\" target=\"_blank\" rel=\"noopener\">Leaflet</a> (BSD-2-Clause) for the map; <a href=\"https://stuk.github.io/jszip/\" target=\"_blank\" rel=\"noopener\">JSZip</a> (MIT) for exports; <a href=\"https://fonts.google.com/specimen/Cinzel\" target=\"_blank\" rel=\"noopener\">Cinzel</a> and <a href=\"https://fonts.google.com/specimen/EB+Garamond\" target=\"_blank\" rel=\"noopener\">EB Garamond</a> typefaces (SIL Open Font License).",
    "ab.code3": "Hosted on Cloudflare Workers. Sign-in through Steam (OpenID); Steam is a trademark of Valve Corporation. The advisor's report is generated with Claude, by Anthropic, and is guidance only.",
    "ab.contact": "Contact address not published yet.",
    "Otra opinión": "Another opinion", "Generando el informe desde otra pestaña o dispositivo… ({0} s)": "Generating the report from another tab or device… ({0} s)",
    "Este informe ya corresponde a la partida abierta; se genera solo cuando abres un save nuevo.": "This report already matches the open save; a new one is generated automatically when you open a newer save.",
    "El informe ya corresponde a esta partida: generar otro solo dará una variante y cuenta para el cupo diario. ¿Generar de todos modos?": "The report already matches this save: another run only gives a variant and counts towards the daily cap. Generate anyway?",
    "Generando el informe del consejero en segundo plano…": "Generating the advisor's report in the background…", "Informe del consejero listo.": "Advisor's report ready.",
    "No se pudo generar el informe: {0}": "Couldn't generate the report: {0}", "Pidiendo el informe a Claude (suele tardar entre 15 y 40 segundos)…": "Asking Claude for the report (usually 15–40 seconds)…", "Guardando el resumen del personaje en tu cuenta…": "Saving the character summary to your account…",
    "no se pudo guardar el resumen ({0})": "couldn't save the summary ({0})", "este personaje pertenece a otra cuenta de Steam": "this character belongs to another Steam account", "Claude está escribiendo el informe… ({0} s)": "Claude is writing the report… ({0} s)", "Claude está pensando… ({0} s)": "Claude is thinking… ({0} s)",
    "el resumen guardado es de una versión anterior; vuelve a abrir el .sl2 con la sesión iniciada.": "the stored summary is from an older version; open the .sl2 again while signed in.", "falta la clave de la API en el servidor.": "the API key is missing on the server.", "has llegado al máximo diario.": "you've reached the daily limit.", "este personaje no está en tu cuenta todavía; abre el .sl2 con la sesión iniciada.": "this character isn't in your account yet; open the .sl2 while signed in.",
    // account
    "No se pudo sincronizar la marca: {0}": "Couldn't sync the mark: {0}", "Steam": "Steam",
    "Entra con Steam para guardar tus marcas manuales y el resumen de tus personajes en tu cuenta, y para proponer marcadores al mapa de la comunidad. Solo usamos tu identidad pública de Steam (nombre y avatar); nunca pedimos contraseña ni accedemos a tu partida.": "Sign in with Steam to keep your manual marks and character summaries in your account, and to propose markers for the community map. We only use your public Steam identity (name and avatar); we never ask for your password or access your save.",
    "La partida (.sl2) no se sube: todo se lee en este navegador y solo se guarda un resumen (nivel, equipo, progreso).": "The save (.sl2) is never uploaded: everything is read in this browser and only a summary is stored (level, gear, progress).",
    "moderador": "moderator", "jugador": "player", "Salir": "Sign out", "Marcas de este personaje": "This character's marks", "Sincronizar ahora": "Sync now", "Resumen de personajes de la partida abierta": "Character summary of the open save", "Guardar en la cuenta": "Save to account",
    "Moderación": "Moderation", "Cargando propuestas…": "Loading proposals…", "marcador": "marker", "No hay propuestas pendientes.": "No pending proposals.", "Marcas sincronizadas.": "Marks synced.", "Resumen guardado.": "Summary saved.", "Error: {0}": "Error: {0}", "Sesión iniciada con Steam.": "Signed in with Steam.",
    // map
    "Tierras Intermedias": "Lands Between", "Subsuelo": "Underground", "Reino de las Sombras": "Land of Shadow", "Pendiente": "Pending", "Hecho": "Done",
    "Buscar lugar, gracia u objeto…": "Search place, grace or item…", "Jefes": "Bosses", "Lugares": "Places", "Me faltan": "Missing", "Añadidos": "Added", "+ Añadir": "+ Add", "Toca el mapa donde está el objeto.": "Tap the map where the item is.",
    "Nuevo marcador": "New marker", "Objeto (empieza a escribir)": "Item (start typing)", "Nota (opcional): cofre, enemigo, cómo llegar…": "Note (optional): chest, enemy, how to get there…", "Guardar": "Save", "Cancelar": "Cancel",
    "Se guarda en este navegador. Desde <b>Añadidos → Exportar</b> puedes copiar el JSON y enviarlo al repo para compartirlo.": "Stored in this browser. From <b>Added → Export</b> you can copy the JSON and send it to the repo to share it.",
    "Enviar como propuesta pendiente (para probar la moderación)": "Send as a pending proposal (to test moderation)", "Marcadores añadidos": "Added markers", "Copiar JSON": "Copy JSON", "Importar JSON": "Import JSON",
    "Se publica directamente en el mapa de la comunidad (eres moderador).": "Published straight to the community map (you're a moderator).", "Se envía al mapa de la comunidad y aparecerá para todos cuando un moderador lo apruebe. Mientras, lo verás solo tú.": "Sent to the community map; it will show for everyone once a moderator approves it. Until then only you see it.",
    "Se guarda en este navegador. Si entras con Steam desde la <a href=\"./\">ficha</a>, tus marcadores se envían al mapa de la comunidad.": "Stored in this browser. If you sign in with Steam from the <a href=\"./\">sheet</a>, your markers are sent to the community map.",
    "Copiado. Pégalo en data/user_markers.json del repo (o en un issue).": "Copied. Paste it into data/user_markers.json in the repo (or an issue).", "JSON no válido.": "Invalid JSON.",
    "Todavía no has añadido marcadores. Pulsa “+ Añadir” y toca el mapa.": "You haven't added markers yet. Press “+ Add” and tap the map.",
    "Gracia": "Grace", "Jefe": "Boss", "Lugar": "Place", "visitada": "visited", "pendiente": "pending", "vencido": "beaten", "visitado (según el save)": "visited (from the save)", "visitado (marcado a mano)": "visited (marked by hand)", "✓ Visitado": "✓ Visited", "Marcar como visitado": "Mark as visited",
    "{0} objeto{1} que te faltan": "{0} item{1} you're missing", "conseguido": "got it", "Marcador": "Marker", "ya lo tienes": "you already have it", "por {0}": "by {0}", " · pendiente de revisión": " · pending review", " · rechazado": " · rejected", " · enviado": " · sent", " · solo en este navegador": " · only in this browser",
    "No tengo coordenadas de este sitio todavía.": "No coordinates for this place yet.",
    "gracia pendiente": "pending grace", "visitada": "visited", "jefe pendiente": "pending boss", "objetos que te faltan": "items you're missing", "lugar visitado": "visited place", "lugar pendiente": "pending place", "lugar sin datos": "place without data", "añadido": "added",
    "Falta el progreso": "Progress missing", "Esta copia de la partida se guardó con una versión anterior. Vuelve a abrir tu .sl2 en la <a href=\"./\">ficha</a> para ver gracias y jefes visitados.": "This copy of the save was stored by an older version. Open your .sl2 again in the <a href=\"./\">sheet</a> to see visited graces and bosses.",
    "Sin partida cargada": "No save loaded", "Abre tu .sl2 en la <a href=\"./\">ficha</a> y vuelve: verás gracias, jefes y objetos pendientes.": "Open your .sl2 in the <a href=\"./\">sheet</a> and come back: you'll see pending graces, bosses and items.",
    "Capa": "Layer", "Marcadores del mapa interactivo de": "Markers from the interactive map of", "Mapa: idea de MapGenie, datos propios.": "",
    // place kinds (map)
    "Gracias": "Graces", "Iglesias": "Churches", "Catacumbas": "Catacombs", "Cuevas": "Caves", "Túneles": "Tunnels", "Mazmorras": "Dungeons", "Ruinas": "Ruins", "Fuertes": "Forts", "Torres": "Towers", "Evergaols": "Evergaols", "Pueblos": "Villages", "Puntos de interés": "Points of interest", "Mercaderes": "Merchants", "Cuerpos de agua": "Bodies of water", "Grietas": "Rifts", "Minas": "Mines",
  };
  let lang = "es";
  try { const q = new URLSearchParams(location.search).get("lang"); if (q === "en" || q === "es") { lang = q; localStorage.setItem("tl.lang", q); } else { const s = localStorage.getItem("tl.lang"); lang = s === "en" || s === "es" ? s : (navigator.language || "es").toLowerCase().startsWith("es") ? "es" : "en"; } } catch (e) {}
  const fmt = (s, a) => a.length ? s.replace(/\{(\d)\}/g, (m, i) => a[+i] === undefined ? "" : a[+i]) : s;
  const T = (s, ...a) => fmt(lang === "en" && EN[s] !== undefined && EN[s] !== "" ? EN[s] : s, a);
  const I18N = {
    get lang() { return lang; },
    set(l) { try { localStorage.setItem("tl.lang", l); } catch (e) {} try { const u = new URL(location.href); if (u.searchParams.has("lang")) { u.searchParams.delete("lang"); history.replaceState(null, "", u.toString()); } } catch (e) {} location.reload(); },
    locale() { return lang === "en" ? "en-GB" : "es-ES"; },
    apply(root) {
      root = root || document; document.documentElement.lang = lang;
      for (const b of root.querySelectorAll("[data-lang-toggle]")) { b.textContent = lang === "en" ? "ES" : "EN"; b.title = lang === "en" ? "Cambiar a español" : "Switch to English"; b.onclick = () => I18N.set(lang === "en" ? "es" : "en"); }
      if (lang === "es") return; // markup is written in Spanish
      for (const el of root.querySelectorAll("[data-i18n]")) { const k = el.dataset.i18n || el.textContent.trim(); if (EN[k]) el.innerHTML = EN[k]; }
      for (const el of root.querySelectorAll("[data-i18n-ph]")) { const k = el.dataset.i18nPh || el.placeholder; el.dataset.i18nPh = k; el.placeholder = T(k); }
      for (const el of root.querySelectorAll("[data-i18n-title]")) { const k = el.dataset.i18nTitle || el.title; el.dataset.i18nTitle = k; el.title = T(k); }
    },
  };
  root.T = T; root.I18N = I18N;
})(typeof self !== "undefined" ? self : this);
