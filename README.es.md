# Next Grace (resumen en español)

**https://nextgrace.app** (beta privada por ahora). Antes se llamaba "Tarnished Ledger"; el repo de GitHub es robercano/NextGrace.app.

Lector de partidas de Elden Ring (PC, `ER0000.sl2`) que funciona entero en el navegador: ficha del personaje, equipo, inventario, planificador de forja, progreso, mapa interactivo y un "consejero" que redacta un informe para la siguiente sesión. Pensado para consultarlo desde el móvil.

El save se lee en el navegador y **nunca se sube ni se modifica**. Opcionalmente puedes entrar con Steam para guardar tus marcas y un resumen de tus personajes en tu cuenta, proponer marcadores al mapa de la comunidad y pedir el informe del consejero.

La documentación completa está en inglés para que el proyecto lo pueda usar más gente:

- [README.md](README.md): despliegue en Cloudflare (Worker + D1), API, consejero, mapa, datos de la wiki, licencias.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): cómo encaja el código y recetas para ampliarlo (añadir un texto, un dato, una pestaña, una ruta de la API, refrescar datos de la wiki).
- [ROADMAP.md](ROADMAP.md): estado del proyecto, decisiones, formato del save y pendientes.

La interfaz está en inglés por defecto y en español (opción de idioma en el menú, o `?lang=es`; se recuerda en el navegador). Los nombres de objetos, jefes y lugares se mantienen en inglés, como en la wiki. Proyecto de fans sin relación con FromSoftware ni Bandai Namco; código bajo GPL-3.0, datos de la wiki bajo CC BY-SA 4.0 (ver `about.html`).
