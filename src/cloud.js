/* cloud.js — optional account layer on top of the local app (Steam login, sync of marks, character summaries, community markers).
 * Everything keeps working without login; this module only adds sync when a session exists.
 */
(function (root) {
  const api = async (path, opts = {}) => {
    const r = await fetch("/api" + path, Object.assign({ credentials: "same-origin", headers: opts.body ? { "content-type": "application/json" } : {} }, opts, opts.body ? { body: JSON.stringify(opts.body) } : {}));
    if (r.status === 401) return { error: "login", status: 401 };
    let data = null; try { data = await r.json(); } catch (e) {}
    if (!r.ok) return Object.assign({ error: (data && data.error) || r.statusText, status: r.status }, data || {});
    return data;
  };
  let me = null, available = null, pushP = Promise.resolve(null);
  const Cloud = {
    async init() { try { const r = await api("/me"); available = !r.error || r.status === 401; me = r.user || null; return me; } catch (e) { available = false; return null; } },
    user() { return me; },
    available() { return available !== false; },
    isAdmin() { return !!(me && me.role === "admin"); },
    login() { location.href = "/api/auth/steam"; },
    async logout() { await api("/auth/logout", { method: "POST" }); me = null; },
    // Deletes the account server-side (see privacy.html) and forgets the session locally.
    async deleteAccount() { const r = await api("/me", { method: "DELETE" }); if (r && !r.error) me = null; return r; },

    // Character summaries (no save file is uploaded): what the account needs for sync and the map.
    summarize(c) {
      const eq = c.enriched && c.enriched.equipped || {};
      const n = x => x && x.display || null;
      return { level: c.level, class: c.className, ng: c.clearCount, playtime: c.playtimeSec, deaths: c.deaths, totalRunes: c.totalRunes, stats: c.stats, hp: c.maxHp, fp: c.maxFp, sp: c.maxSp,
        equipped: { rh: (eq.rh || []).map(n), lh: (eq.lh || []).map(n), head: n(eq.head), chest: n(eq.chest), arms: n(eq.arms), legs: n(eq.legs), talismans: (eq.talismans || []).map(n), greatRune: n(eq.greatRune) },
        progress: c.progress || null, itemCount: (c.all || []).length, haveKeys: (c.all || []).map(i => i.id).slice(0, 3000),
        // for the advisor: what matters for build/route advice, by name (ids are resolved client-side already)
        weapons: (c.all || []).filter(i => i.kind === "weapon" && i.maxLevel > 0 && i.cat !== "arrows_and_bolts").map(i => { const u = root.TL_USE ? root.TL_USE(c, i) : null; return { n: i.name.replace(/\s*\+\d+$/, ""), inf: i.infusion && i.infusion !== "Standard" ? i.infusion : undefined, lvl: i.level, max: i.maxLevel, cat: i.sub || i.cat, stored: i.stored || undefined,
          req: u ? u.req : undefined, sc: u && u.scale ? u.scale : undefined, use: u ? (u.boosted ? "boost" : u.ok ? "ok" : u.twoHand ? "2h" : "no") : undefined, via: u && u.boosted ? u.via.join(" + ") : undefined, miss: u && !u.ok && !u.twoHand ? u.missing.map(m => m.k + "+" + (m.need - m.have)).join(" ") : undefined }; }),
        talismans: (c.all || []).filter(i => i.kind === "talisman").map(i => i.name),
        spells: (c.enriched && c.enriched.spells || []).map(n).filter(Boolean),
        spellsOwned: (c.all || []).filter(i => i.cat === "sorceries" || i.cat === "incantations").map(i => { const u = root.TL_USE ? root.TL_USE(c, i) : null; return u && !u.ok ? i.name + " (faltan " + u.missing.map(m => m.k + "+" + (m.need - m.have)).join(" ") + ")" : i.name; }),
        ashes: (c.all || []).filter(i => i.cat === "ashes" || i.cat === "ashes_of_war").map(i => i.name),
        stones: Object.fromEntries((c.all || []).filter(i => /Smithing Stone/.test(i.name)).map(i => [i.name, i.qty || 1])),
        keyItems: (c.all || []).filter(i => i.cat === "key_items").map(i => i.name).slice(0, 300),
        flasks: { crimson: c.crimsonFlasks, cerulean: c.ceruleanFlasks }, talismanSlots: 1 + (c.talismanSlots || 0), greatRuneActive: !!c.greatRuneActive, matchmakingWpnLvl: c.matchmakingWpnLvl, lastGrace: c.lastGrace };
    },
    pushed() { return pushP.catch(() => null); },
    pushCharacters(chars) {
      if (!me) return Promise.resolve(null);
      return pushP = api("/characters", { method: "PUT", body: { characters: chars.filter(c => !c.error).map(c => ({ char_key: Marks.charKey(c), name: c.name, level: c.level, class: c.className, playtime: c.playtimeSec, summary: Cloud.summarize(c) })) } });
    },
    // Marks: push local → remote, then merge remote → local (union; remote wins only for new entries).
    async syncMarks(charKey) {
      if (!me) return null;
      await pushP.catch(() => {});
      const local = Marks.all(charKey);
      const r = await api("/marks/" + encodeURIComponent(charKey), { method: "PUT", body: { marks: local.map(e => ({ kind: e.k, ref: e.id, state: e.s, at: e.at })) } });
      if (r.error) return r;
      for (const m of r.marks || []) if (!Marks.has(charKey, m.kind, m.ref)) Marks.set(charKey, m.kind, m.ref, true, m.at || undefined);
      return r;
    },
    async removeMark(charKey, k, id) { if (!me) return null; return api("/marks/" + encodeURIComponent(charKey), { method: "PUT", body: { remove: [{ kind: k, ref: id }] } }); },
    // Community markers
    async markers(layer) { const r = await api("/markers" + (layer ? "?layer=" + layer : "")); return r.markers || []; },
    async proposeMarker(m) { return api("/markers", { method: "POST", body: m }); },
    async deleteMarker(id) { return api("/markers/" + id, { method: "DELETE" }); },
    async pending() { const r = await api("/admin/markers"); return r.markers || []; },
    async history(charKey) { const r = await api("/history/" + encodeURIComponent(charKey)); return r.history || []; },
    // Advisor (server-side report cached in the account)
    async advice(charKey) { return api("/advice/" + encodeURIComponent(charKey) + "?lang=" + (root.I18N ? root.I18N.lang : "es")); },
    async adviceContext(charKey) { return api("/advice/" + encodeURIComponent(charKey) + "?ctx=1&lang=" + (root.I18N ? root.I18N.lang : "es")); },
    // POST streams ndjson: {beat}/{progress} lines while the model works, then {advice} or {error}
    // opts: {force} regenerate even if the save is unchanged ("another opinion"); {auto} started by the app after uploading a save.
    // Non-stream answers: {advice, unchanged} (same save) or {running:{seconds}} (a job is already in progress: poll advice()).
    async adviceRefresh(charKey, onProgress, opts) {
      const r = await fetch("/api/advice/" + encodeURIComponent(charKey), { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.assign({ lang: root.I18N ? root.I18N.lang : "es" }, opts || {})) });
      if (r.status === 401) return { error: "login", status: 401 };
      const ct = r.headers.get("content-type") || "";
      if (!ct.includes("ndjson")) { let d = null; try { d = await r.json(); } catch (e) {} return r.ok ? d : Object.assign({ error: (d && d.error) || r.statusText, status: r.status }, d || {}); }
      const reader = r.body.getReader(), dec = new TextDecoder(); let buf = "", last = null;
      for (;;) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i; while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue; try { const o = JSON.parse(line); if (o.advice || o.error) last = o; else if (onProgress) onProgress(o); } catch (e) {} } }
      if (buf.trim()) { try { const o = JSON.parse(buf.trim()); if (o.advice || o.error) last = o; } catch (e) {} }
      return last || { error: "la conexión se cortó antes de recibir el informe" };
    },
    async review(id, action) { return api("/admin/markers", { method: "POST", body: { id, action } }); },
    // Advisor access (who may spend the Claude key): state from the Steam ownership check or a moderator's decision
    async advisor() { return api("/advisor"); },
    async advisorCheck() { return api("/advisor", { method: "POST", body: { action: "check" } }); },
    async advisorRequest(contact, note, previous) { return api("/advisor", { method: "POST", body: { action: "request", contact, note, previous } }); },
    async adminAdvisor() { return api("/admin/advisor"); },
    // Icon pack → R2 (admin). name = "<file>.webp" or "map/<file>.webp"
    async adminIcons() { return api("/admin/icons"); },
    async adminIconPut(name, blob) { const r = await fetch("/api/admin/icons/" + name.split("/").map(encodeURIComponent).join("/"), { method: "PUT", credentials: "same-origin", headers: { "content-type": blob.type || "application/octet-stream" }, body: blob }); let d = null; try { d = await r.json(); } catch (e) {} return r.ok ? d : { error: (d && d.error) || r.statusText, status: r.status }; },
    async adminAdvisorReview(steamid, action, note) { return api("/admin/advisor", { method: "POST", body: { steamid, action, note } }); },
  };
  root.Cloud = Cloud;
})(typeof self !== "undefined" ? self : this);
