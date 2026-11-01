# Extracting the item icons from your own copy of Elden Ring (Windows)

Goal: produce `icons/<id>.webp` for every item from the game files, without touching any wiki.
They are FromSoftware's art: fine for your own deployment, never for a public repo.

Tools (free, from the modding community; download them from their GitHub pages):

- **UXM Selective Unpacker** (Nordgaren) — unpacks the game archives.
- **WitchyBND** (ividyon) — opens `.tpf.dcx` (textures) and `.sblytbnd.dcx` (sprite layouts).
- **texconv** (DirectXTex, Microsoft) — converts DDS to PNG (the atlases use BC7 compression, which not every library reads).
- **Smithbox** (vawser) — exports the params to CSV.

## Steps

1. **UXM**: open it, select `eldenring.exe` and press *Unpack* (or *Selective unpack* ticking only `menu`). No need to
   *Patch* (we are not modifying the game). Result: a `Game\menu\...` folder inside the installation.
2. **WitchyBND**: drag these two files from `Game\menu\hi\` onto `WitchyBND.exe`:
   - `01_common.tpf.dcx` → folder `01_common-tpf-dcx\` with the `.dds` atlases (look for ones named `SB_ItemIcon_*` or similar).
   - `01_common.sblytbnd.dcx` → folder with the `.layout` files (XML) that say in which atlas and rectangle each `MENU_ItemIcon_NNNNN` lives.
   If there is a `02_dlc` or similar in the same folder (Shadow of the Erdtree icons), do the same with it.
3. **texconv**: from a console in the folder with the `.dds` files:
   `texconv -ft png -o png *.dds`
   (creates a `png` folder with the atlases as PNG). Copy the `.layout` files next to those PNGs, or pass the parent folder with `--menu`.
4. **Smithbox**: open the project pointing at the installation, go to *Param Editor* and export these params to CSV (right click → *Export CSV* → *All rows*):
   `EquipParamWeapon`, `EquipParamProtector`, `EquipParamAccessory`, `EquipParamGoods`, `EquipParamGem`.
   Save them in a `params\` folder with those names (the script recognises them by the file name prefix).
5. **Script** (Python 3 with Pillow: `pip install pillow`), from the repo folder:
   ```
   python tools\extract_icons_game.py --menu "C:\...\01_common" --params "C:\...\params" --dry
   python tools\extract_icons_game.py --menu "C:\...\01_common" --params "C:\...\params"
   ```
   The first line only reports (how many sprites, how many items match). The second writes `icons/<id>.webp` and regenerates `icons/index.json`.

## Checking

Open the inventory: icons are looked up by item id first, so these replace the wiki ones without touching anything else.
Once they look right, the name-based `.webp` files (the wiki ones) can be deleted from the folder.

## If something doesn't match

- "No ItemIcon sprites found": the `.layout` files may use another node name; send one as an example (they are small XML files) and adjust `load_layouts` in the script.
- "iconId without sprite": icons that exist in the param but not in the base game layouts; usually DLC (step 2, second file).
- Atlases that won't open: they were not converted to PNG (step 3).
