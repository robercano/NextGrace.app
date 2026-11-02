/*
 * shell.js — the header both pages share (styles in src/shell.css): title, Steam account indicator, menu button,
 * the Sheet/Map row with the character on screen, and the drawer (characters, save, language, legal links).
 *
 *   Shell.mount({ current: "sheet" | "map", openFile: true | false, onPick(slot), onAccount() })
 *     Renders into <div id="shell"> (inside the page's sticky .top) and appends the drawer to <body> (a drawer inside a
 *     backdrop-filtered header would be clipped). openFile: the "open another save" item is a label for #file (sheet) or a
 *     link to the sheet (map). onPick(slot) is called when a character is chosen in the drawer; onAccount() when the
 *     account button is tapped by a signed-in user (an anonymous user is sent to Steam login).
 *   Shell.setChars(chars, curSlot)   chars: [{ slot, name, level, className }] — fills the drawer and the "who" chip
 *   Shell.setUser(user, available)   user: { name, avatar } | null — the account button
 *   Shell.showSaveItems(on)          "open another save" / "Steam Cloud" items (the sheet shows them once a save is loaded)
 *   Shell.menu(open)
 * Needs T/I18N (src/i18n.js) and Cloud (src/cloud.js) loaded first.
 */
(function (root) {
  "use strict";
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const $ = s => document.querySelector(s);
  let opts = {}, chars = [], cur = null;

  function markup(o) {
    const sheet = o.current === "sheet", map = o.current === "map";
    const openItem = o.openFile
      ? `<label class="mitem" for="file" id="barOpen" hidden><b data-i18n="Abrir otro .sl2">Abrir otro .sl2</b><span class="help" data-i18n="Carga una partida más reciente">Carga una partida más reciente</span></label>`
      : `<a class="mitem" href="./" id="barOpen"><b data-i18n="Abrir otro .sl2">Abrir otro .sl2</b><span class="help" data-i18n="Desde la ficha">Desde la ficha</span></a>`;
    return {
      header: `<div class="topi">
    <h1>Next Grace</h1>
    <button class="btn acct" id="acct" hidden title="Cuenta" data-i18n-title="Cuenta"></button>
    <button class="btn menub" id="menuBtn" aria-expanded="false" aria-controls="menu" title="Menú" data-i18n-title="Menú"><span></span><span></span><span></span></button>
  </div>
  <div class="modes" id="modes"${sheet ? " hidden" : ""}><button class="who" id="who" title="Cambiar de personaje" data-i18n-title="Cambiar de personaje"></button><div class="modec"><a class="mode" href="./"${sheet ? ' aria-current="true"' : ""} data-i18n="Ficha">Ficha</a><a class="mode" href="map.html"${map ? ' aria-current="true"' : ""} data-i18n="Mapa">Mapa</a></div></div>`,
      drawer: `<div class="menuback" id="menuBack" hidden></div>
<nav class="menu" id="menu" hidden aria-label="Menú">
  <div class="menusec" id="menuChars" hidden><div class="menuh" data-i18n="Personaje">Personaje</div><div class="chars" id="chars"></div></div>
  <div class="menusec"><div class="menuh" data-i18n="Partida">Partida</div>
    ${openItem}
    <a class="mitem" id="barSteam" href="https://store.steampowered.com/account/remotestorageapp/?appid=1245620" target="_blank" rel="noopener"${o.openFile ? " hidden" : ""}><b>Steam Cloud</b><span class="help" data-i18n="Descargar la partida de Steam Cloud">Descargar la partida de Steam Cloud</span></a>
  </div>
  <div class="menusec"><div class="menuh" data-i18n="Idioma">Idioma</div><button class="mitem" data-lang-toggle><b>English</b></button></div>
  <div class="menusec"><a class="mitem" href="about.html"><b data-i18n="Créditos y licencias">Créditos y licencias</b></a><a class="mitem" href="privacy.html"><b data-i18n="Política de privacidad">Política de privacidad</b></a></div>
</nav>`,
    };
  }

  const menu = on => { const m = $("#menu"); if (!m) return; m.hidden = !on; $("#menuBack").hidden = !on; $("#menuBtn").setAttribute("aria-expanded", on); };

  function mount(o) {
    opts = o || {};
    const host = $("#shell"); if (!host) throw new Error("Shell.mount: no #shell element");
    const m = markup(opts);
    host.innerHTML = m.header;
    const d = document.createElement("div"); d.innerHTML = m.drawer; while (d.firstChild) document.body.appendChild(d.firstChild);
    $("#menuBtn").addEventListener("click", () => menu($("#menu").hidden));
    $("#menuBack").addEventListener("click", () => menu(false));
    $("#who").addEventListener("click", () => menu(true));
    $("#menu").addEventListener("click", e => { if (e.target.closest("#barOpen, a")) menu(false); });
    $("#chars").addEventListener("click", e => { const b = e.target.closest("[data-slot]"); if (!b) return; menu(false); if (opts.onPick) opts.onPick(+b.dataset.slot); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") menu(false); });
    $("#acct").addEventListener("click", () => { if (!root.Cloud || !root.Cloud.user()) { if (root.Cloud) root.Cloud.login(); return; } if (opts.onAccount) opts.onAccount(); });
    if (root.I18N) { root.I18N.apply(host); root.I18N.apply($("#menu")); }
  }

  function setChars(list, curSlot) {
    chars = list || []; cur = chars.find(c => c.slot == curSlot) || chars[0] || null;
    const cs = $("#chars"), mc = $("#menuChars"), who = $("#who"), modes = $("#modes"); if (!cs) return;
    mc.hidden = chars.length < 2;
    cs.innerHTML = chars.map(c => `<button data-slot="${c.slot}" aria-pressed="${cur && c.slot == cur.slot}"><b>${esc(c.name || "Slot " + (c.slot + 1))}</b><span>${root.T("Nv {0}", c.level)} · ${esc(c.className || "")}</span></button>`).join("");
    who.innerHTML = cur ? `${esc(cur.name || "Slot " + (cur.slot + 1))}<small>${root.T("Nv {0}", cur.level)}${chars.length > 1 ? " ▾" : ""}</small>` : "";
    if (modes && opts.current === "sheet") modes.hidden = !cur; // the sheet shows the row once a save is open; the map always
  }

  function setUser(u, available) {
    const b = $("#acct"); if (!b) return; b.hidden = available === false;
    if (u) { b.className = "btn acct"; b.innerHTML = `${u.avatar ? `<img src="${esc(u.avatar)}" alt="">` : ""}<span>${esc(u.name || "Steam")}</span>`; }
    else { b.className = "btn acct out"; b.textContent = root.T("Entrar"); }
  }

  function showSaveItems(on) { for (const id of ["barOpen", "barSteam"]) { const el = document.getElementById(id); if (el) el.hidden = !on; } }

  root.Shell = { mount, setChars, setUser, showSaveItems, menu };
})(typeof self !== "undefined" ? self : this);
