# Extraer los iconos de tu copia de Elden Ring (Windows)

Objetivo: generar `icons/<id>.webp` para todos los objetos a partir de los ficheros del juego, sin usar ninguna wiki.
Son arte de FromSoftware: sirven para tu despliegue, no para un repo público.

Herramientas (gratuitas, de la comunidad de modding; descárgalas de sus páginas de GitHub):

- **UXM Selective Unpacker** (Nordgaren) — desempaqueta los archivos del juego.
- **WitchyBND** (ividyon) — abre `.tpf.dcx` (texturas) y `.sblytbnd.dcx` (layouts de sprites).
- **texconv** (DirectXTex, Microsoft) — convierte DDS a PNG (los atlas usan compresión BC7 que no todas las librerías leen).
- **Smithbox** (vawser) — exporta los params a CSV.

## Pasos

1. **UXM**: ábrelo, selecciona `eldenring.exe` y pulsa *Unpack* (o *Selective unpack* marcando solo `menu`). No hace
   falta *Patch* (no vamos a modificar el juego). Resultado: carpeta `Game\menu\...` dentro de la instalación.
2. **WitchyBND**: arrastra sobre `WitchyBND.exe` estos dos ficheros de `Game\menu\hi\`:
   - `01_common.tpf.dcx` → carpeta `01_common-tpf-dcx\` con los atlas `.dds` (busca los que se llamen `SB_ItemIcon_*` o similar).
   - `01_common.sblytbnd.dcx` → carpeta con los `.layout` (XML) que dicen en qué atlas y rectángulo está cada `MENU_ItemIcon_NNNNN`.
   Si hay un `02_dlc` o similar en la misma carpeta (iconos de Shadow of the Erdtree), haz lo mismo con él.
3. **texconv**: desde una consola en la carpeta de los `.dds`:
   `texconv -ft png -o png *.dds`
   (crea la carpeta `png` con los atlas en PNG). Copia también los `.layout` a una carpeta junto a esos PNG, o pasa la carpeta padre con `--menu`.
4. **Smithbox**: abre el proyecto apuntando a la instalación, ve a *Param Editor* y exporta a CSV estos params (clic derecho → *Export CSV* → *All rows*):
   `EquipParamWeapon`, `EquipParamProtector`, `EquipParamAccessory`, `EquipParamGoods`, `EquipParamGem`.
   Guárdalos en una carpeta `params\` con esos nombres (el script los reconoce por el prefijo del nombre de fichero).
5. **Script** (Python 3 con Pillow: `pip install pillow`), desde la carpeta del repo:
   ```
   python tools\extract_icons_game.py --menu "C:\...\01_common" --params "C:\...\params" --dry
   python tools\extract_icons_game.py --menu "C:\...\01_common" --params "C:\...\params"
   ```
   La primera línea solo informa (cuántos sprites, cuántos objetos casan). La segunda escribe `icons/<id>.webp` y regenera `icons/index.json`.

## Comprobación

Abre `icons.html` en la web o el inventario: los iconos se buscan primero por id de objeto, así que estos sustituyen a los de la wiki sin tocar nada más. Cuando confirmes que se ven bien, se pueden borrar los `.webp` por nombre (los de la wiki) de la carpeta.

## Si algo no cuadra

- "No encuentro sprites ItemIcon": los `.layout` pueden tener otro nombre de nodo; manda uno de ejemplo (son XML pequeños) y ajusto el parser.
- "iconId sin sprite": iconos que existen en el param pero no en los layouts del juego base; suelen ser del DLC (paso 2, segundo fichero).
- Atlas que no abren: no se convirtieron a PNG (paso 3).
