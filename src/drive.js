/*
 * drive.js — read the save from the user's own Google Drive, in the browser (the Worker never sees the file).
 *
 * Flow: the user picks ER0000.sl2 once with the Google Picker (OAuth scope drive.file: the app can only read the files the user
 * picked, nothing else in their Drive). We keep the file id in localStorage ("tl.drive") and, with a short-lived access token
 * (Google Identity Services, kept in sessionStorage while valid), ask Drive for the file's modifiedTime and download it when it
 * changed. On the PC, Google Drive for desktop (or a copy script) keeps the file in Drive while the game writes it.
 *
 *   Drive.configured()            SITE.google.clientId is set
 *   Drive.state()                 { id, name, modifiedTime, auto } | null
 *   Drive.connect()               picker → stores the file; needs a user gesture (opens Google's popup)
 *   Drive.check()                 → { changed, modifiedTime, size } (needs a token; may open the popup if there is none)
 *   Drive.download()              → File (name = the Drive file's name); marks the stored modifiedTime
 *   Drive.setAuto(on) / Drive.disconnect()
 *   Drive.hasToken()              a valid token is cached: check/download will not prompt
 * Needs SITE (src/site.js) with google: { clientId, apiKey, appId }.
 */
(function (root) {
  "use strict";
  const KEY = "tl.drive", TOK = "tl.drive.token", SCOPE = "https://www.googleapis.com/auth/drive.file";
  const cfg = () => (root.SITE && root.SITE.google) || {};
  const configured = () => !!cfg().clientId;
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } };
  const save = s => { try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch (e) {} };
  let token = null; try { token = JSON.parse(sessionStorage.getItem(TOK) || "null"); } catch (e) {}
  const hasToken = () => !!(token && token.exp > Date.now() + 30e3);

  const scripts = {};
  function script(src) { return scripts[src] || (scripts[src] = new Promise((ok, ko) => { const s = document.createElement("script"); s.src = src; s.async = true; s.onload = ok; s.onerror = () => ko(new Error("No se pudo cargar " + src)); document.head.appendChild(s); })); }
  async function gis() { await script("https://accounts.google.com/gsi/client"); return root.google.accounts.oauth2; }

  /** Access token; silent when Google already has the consent and the session, otherwise Google's popup (call from a click). */
  function getToken() {
    if (hasToken()) return Promise.resolve(token.v);
    return gis().then(o => new Promise((ok, ko) => {
      const tc = o.initTokenClient({ client_id: cfg().clientId, scope: SCOPE, callback: r => { if (r.error) return ko(new Error(r.error_description || r.error)); token = { v: r.access_token, exp: Date.now() + (r.expires_in || 3600) * 1000 - 60e3 }; try { sessionStorage.setItem(TOK, JSON.stringify(token)); } catch (e) {} ok(token.v); }, error_callback: e => ko(new Error(e.message || e.type || "oauth")) });
      tc.requestAccessToken({ prompt: "" });
    }));
  }

  async function api(path, opts) {
    const t = await getToken();
    const r = await fetch("https://www.googleapis.com/drive/v3/" + path, Object.assign({ headers: { authorization: "Bearer " + t } }, opts || {}));
    if (r.status === 401) { token = null; try { sessionStorage.removeItem(TOK); } catch (e) {} throw new Error("token"); }
    if (!r.ok) { let m = r.statusText; try { m = (await r.json()).error.message || m; } catch (e) {} throw new Error(m); }
    return r;
  }

  /** Google Picker over the user's Drive; resolves with the picked file or null. */
  async function connect() {
    const t = await getToken();
    await script("https://apis.google.com/js/api.js");
    await new Promise(ok => root.gapi.load("picker", ok));
    const g = root.google && root.google.picker; if (!g) throw new Error("picker API not loaded");
    return new Promise((ok, ko) => {
      const view = new g.DocsView(g.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(false).setQuery("ER0000");
      const b = new g.PickerBuilder().addView(view).setOAuthToken(t).setTitle("ER0000.sl2").setCallback(d => {
        if (d.action === g.Action.PICKED) { const f = d.docs[0]; const s = { id: f.id, name: f.name, modifiedTime: null, auto: true }; save(s); ok(s); }
        else if (d.action === g.Action.CANCEL) ok(null);
        else if (d.action === "error") ko(new Error("picker: " + JSON.stringify(d).slice(0, 200)));
      });
      if (cfg().apiKey) b.setDeveloperKey(cfg().apiKey);
      if (cfg().appId) b.setAppId(cfg().appId);
      try { b.build().setVisible(true); } catch (e) { ko(e); }
    });
  }

  async function check() {
    const s = load(); if (!s) throw new Error("not connected");
    const r = await api("files/" + encodeURIComponent(s.id) + "?fields=name,modifiedTime,size&supportsAllDrives=true");
    const j = await r.json();
    return { changed: j.modifiedTime !== s.modifiedTime, modifiedTime: j.modifiedTime, size: +j.size || 0, name: j.name };
  }

  async function download() {
    const s = load(); if (!s) throw new Error("not connected");
    const meta = await check();
    const r = await api("files/" + encodeURIComponent(s.id) + "?alt=media&supportsAllDrives=true");
    const buf = await r.arrayBuffer();
    s.modifiedTime = meta.modifiedTime; s.name = meta.name || s.name; s.syncedAt = new Date().toISOString(); save(s);
    return new File([buf], s.name || "ER0000.sl2");
  }

  const setAuto = on => { const s = load(); if (s) { s.auto = !!on; save(s); } };
  const disconnect = () => { save(null); token = null; try { sessionStorage.removeItem(TOK); } catch (e) {} };

  root.Drive = { configured, state: load, connect, check, download, setAuto, disconnect, hasToken };
})(typeof self !== "undefined" ? self : this);
