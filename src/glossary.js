/* glossary.js — short explanations (ES) + wiki page for the things the sheet shows. ~3 KB, loaded with the page.
 * GLOSSARY[key] = { w: wiki page title (eldenring.wiki.gg), es: one-paragraph explanation }
 */
(function (root) {
  const G = {
    // attributes
    vigor: { w: "Vigor", es: "Salud máxima (HP). También sube la inmunidad (veneno y putrefacción) y la negación de daño de fuego. Rinde mucho hasta 40 y bastante hasta 60; a partir de ahí, poco." },
    mind: { w: "Mind", es: "Puntos de concentración (FP) para hechizos, encantamientos y cenizas de guerra. Sube la concentración (resistencia a sueño y locura). Buen rendimiento hasta 40, menos hasta 60." },
    endurance: { w: "Endurance", es: "Aguante (SP) para atacar, esquivar y correr, carga de equipo máxima (cuánto puedes llevar sin rodar pesado) y robustez (resistencia a hemorragia y congelación). El aguante rinde hasta 50; la carga sigue subiendo hasta 60." },
    strength: { w: "Strength", es: "Escalado de las armas de fuerza y requisito de las pesadas. A dos manos se cuenta ×1,5 (p. ej. 20 FUE a dos manos = 30). Sube un poco la defensa física. Rendimiento alto hasta 55, menor hasta 80." },
    dexterity: { w: "Dexterity", es: "Escalado de las armas de destreza. Acelera el lanzamiento de hechizos (hasta 70), reduce el daño por caída y dificulta que te derriben de Torrentera. Rendimiento alto hasta 55, menor hasta 80." },
    intelligence: { w: "Intelligence", es: "Requisito y escalado de hechicerías y de los bastones y armas mágicas; sube la negación de daño mágico. Rendimiento alto hasta 60, menor hasta 80." },
    faith: { w: "Faith", es: "Requisito y escalado de encantamientos y de los sellos sagrados y armas de fe (sagradas, de fuego, de rayo...). Rendimiento alto hasta 60, menor hasta 80." },
    arcane: { w: "Arcane", es: "Descubrimiento (probabilidad de botín), vitalidad (resistencia a la muerte súbita) y negación de daño sagrado. Escala las armas y encantamientos arcanos (comunión dragón, sangre) y la acumulación de hemorragia y veneno de las armas que escalan con arcano." },
    // gauges
    hp: { w: "HP", es: "Puntos de salud. Dependen sobre todo del vigor; las runas mayores de Godrick/Radahn, el talismán de amuleto carmesí y algunos objetos lo suben temporalmente." },
    fp: { w: "FP", es: "Puntos de concentración: el coste de hechizos, encantamientos, invocaciones de cenizas y cenizas de guerra. Dependen de la mente; se recuperan con el frasco cerúleo." },
    sp: { w: "Stamina", es: "Aguante. Lo gastan ataques, esquivas, bloqueos y correr; se recupera solo. Depende de la resistencia." },
    // character
    level: { w: "Level", es: "Nivel = 1 + puntos invertidos en los ocho atributos por encima de los de la clase inicial (79 en total). El coste en runas de cada nivel crece con el nivel; el máximo es 713." },
    runes: { w: "Runes", es: "Moneda y experiencia: se gastan en subir de nivel y en comprar. Se pierden al morir y se recuperan si vuelves a por ellas sin morir por el camino." },
    class: { w: "Classes", es: "La clase inicial fija los atributos de partida y el equipo inicial; después del principio no limita nada: cualquier personaje puede acabar con cualquier reparto de puntos." },
    gift: { w: "Keepsakes", es: "Objeto de inicio (recuerdo) elegido al crear el personaje. Todos pueden conseguirse también durante la partida." },
    ng: { w: "New Game Plus", es: "Ciclo de la partida. Cada Nueva Partida+ conserva nivel, objetos y hechizos, y sube la vida y el daño de los enemigos y las runas que sueltan (hasta NG+7)." },
    deaths: { w: "Death", es: "Veces que el personaje ha muerto en esta partida." },
    mmlvl: { w: "Weapon Upgrade Level", es: "Nivel de mejora más alto que has alcanzado con un arma (en escala normal; las armas de piedra sombría cuentan ×2,5). Determina con quién puedes jugar en cooperativo e invasiones, junto con el nivel del personaje." },
    greatrune: { w: "Great Runes", es: "Runa mayor equipada en un lugar de gracia. Solo hace efecto tras usar un Arco de Runa, y el efecto se pierde al morir." },
    runearc: { w: "Rune Arc", es: "Objeto consumible que activa la runa mayor equipada hasta que mueras. Lo sueltan ratas gigantes y algunos enemigos; se compra a Kalé y a las gemelas Vendedoras." },
    talismans: { w: "Talismans", es: "Huecos de talismán: empiezas con uno y ganas uno con cada Bolsa de talismanes (hasta cuatro)." },
    // flasks and load
    crimson: { w: "Flask of Crimson Tears", es: "Frasco de lágrimas carmesíes: recupera salud. Semillas doradas añaden cargas (hasta 14 entre ambos frascos), lágrimas sagradas suben la cantidad curada." },
    cerulean: { w: "Flask of Cerulean Tears", es: "Frasco de lágrimas cerúleas: recupera FP. Puedes repartir las cargas entre ambos frascos en cualquier lugar de gracia." },
    load: { w: "Equip Load", es: "Peso total de armas, armaduras, flechas y talismanes equipados frente al máximo (que sube con la resistencia). Por debajo del 30 % ruedas ligero, hasta el 70 % medio, hasta el 100 % pesado; por encima no puedes rodar." },
    spells: { w: "Memory Slots", es: "Hechizos y encantamientos memorizados. Empiezas con dos huecos; cada Piedra de memoria da uno más, hasta diez." },
    // status buildups (what the sheet lists under Resistencias)
    poison: { w: "Poison", es: "Veneno: daño lento durante mucho tiempo. La inmunidad (vigor) frena su acumulación." },
    rot: { w: "Scarlet Rot", es: "Putrefacción escarlata: como el veneno, pero mucho más rápida. Se cura con bolos sanadores o encantamientos de alivio." },
    bleed: { w: "Hemorrhage", es: "Hemorragia: al llenarse, pierdes un porcentaje grande de la salud máxima de golpe. La robustez (resistencia) frena su acumulación." },
    frost: { w: "Frostbite", es: "Congelación: daño instantáneo, menos aguante recuperado y más daño recibido durante un tiempo. También robustez." },
    sleep: { w: "Sleep", es: "Sueño: te deja indefenso unos segundos. La concentración (mente) frena su acumulación." },
    madness: { w: "Madness", es: "Locura: daño instantáneo, pérdida de FP y aturdimiento. Solo la provocan los Tres Dedos y sus seguidores. Concentración." },
    unused_grace: { w: "Golden Seed", es: "Semillas doradas y lágrimas sagradas se gastan en el menú de cualquier gracia (Frascos): cada semilla añade una carga (cada vez hacen falta más) y cada lágrima sube la cantidad curada. En Shadow of the Erdtree, los fragmentos del Scadutree y las cenizas veneradas se activan igual y son la mejora más importante de la expansión." },
    unused_runes: { w: "Golden Rune", es: "Objetos consumibles que dan runas al usarlos. No se pierden al morir, así que son un colchón seguro: consúmelos justo antes de subir de nivel o de comprar." },
    unused_rem: { w: "Remembrances", es: "Cada remembranza se cambia con Enia (Mesa Redonda) por una de dos recompensas del jefe (arma, hechizo o talismán), o se consume por muchas runas. Con un Walking Mausoleum se puede duplicar para conseguir ambas." },
    unused_npc: { w: "Prayerbooks", es: "Los libros de oración se entregan a Corhyn o a Miriel para que vendan esos encantamientos; los pergaminos a Sellen o a Thops para hechicerías. Deathroot a Gurranq (encantamientos de bestia) y Dragon Hearts a los altares de Comunión Dragón." },
    unused_bell: { w: "Bell Bearings", es: "Al entregar una campana a las Gemelas Vendedoras, su inventario pasa a venderse en la Mesa Redonda. Las de minero dan piedras de forja ilimitadas de ese nivel: son las más útiles de entregar cuanto antes." },
    unused_glove: { w: "Grave Glovewort", es: "Las Grave Glovewort mejoran las cenizas de espíritu normales y las Ghost Glovewort las especiales (con nombre), en la Mesa Redonda con Roderika una vez formada como ajustadora de espíritus." },
    unused_dragon: { w: "Ancient Dragon Smithing Stone", es: "Solo hay unas pocas por partida y llevan un arma del +24 al +25 (o del +9 al +10 las sombrías). Guárdalas para el arma que vayas a usar hasta el final." },
    unused_other: { w: "Larval Tear", es: "La Larval Tear permite redistribuir atributos con Rennala (tras vencerla). El Arco de Runa activa la runa mayor equipada hasta la siguiente muerte." },
    deathblight: { w: "Death Blight", es: "Muerte súbita: al llenarse, mueres. La vitalidad (arcano) frena su acumulación." },
  };
  root.GLOSSARY = G;
})(typeof self !== "undefined" ? self : this);
