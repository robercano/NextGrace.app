(async () => {
  if (!/wiki\.gg$/.test(location.hostname)) { alert("Abre primero cualquier página de eldenring.wiki.gg y lanza el marcador allí."); return; }
  const old = document.getElementById("tl-icons"); if (old) old.remove();
  const box = document.createElement("div");
  box.id = "tl-icons";
  box.style.cssText = "position:fixed;inset:auto 0 0 0;z-index:99999;background:#17161b;color:#e8e2d3;font:15px system-ui,sans-serif;padding:14px 16px;max-height:70vh;overflow:auto;box-shadow:0 -4px 20px #000a;border-top:2px solid #d6a93d";
  box.innerHTML = '<b style="color:#d6a93d">Next Grace · pack de iconos</b> <button id="tl-x" style="float:right">✕</button><div id="tl-st" style="margin:8px 0">Listando ficheros…</div><div id="tl-g"></div><div id="tl-out"></div>';
  document.body.appendChild(box);
  const st = box.querySelector("#tl-st"), g = box.querySelector("#tl-g"), out = box.querySelector("#tl-out");
  box.querySelector("#tl-x").onclick = () => { stop = true; box.remove(); };
  let stop = false;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const api = async p => { const u = new URL("/api.php", location.origin); Object.entries(Object.assign({ format: "json", formatversion: 2 }, p)).forEach(([k, v]) => u.searchParams.set(k, v)); const r = await fetch(u); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); };

  // 1) list all "ER Icon ..." files
  const files = []; let cont = null;
  do {
    const r = await api(Object.assign({ action: "query", list: "allimages", aiprefix: "ER Icon ", ailimit: 500, aiprop: "url" }, cont || {}));
    for (const f of r.query.allimages) files.push({ name: f.name, url: f.url });
    cont = r.continue; await sleep(1000);
  } while (cont && !stop);
  const groups = {};
  for (const f of files) { const n = String(f.name).replace(/^File:/, "").replace(/_/g, " ").trim(); const m = n.match(/^ER Icon ([^ ]+) (.+)\.(png|webp|jpe?g)$/i); if (!m) { f.skip = n; continue; } f.kind = m[1]; f.item = m[2]; (groups[f.kind] = groups[f.kind] || []).push(f); }
  if (!Object.keys(groups).length) { st.innerHTML = "No reconozco los nombres. Ejemplos: <code>" + files.slice(0, 5).map(f => f.name).join("</code>, <code>") + "</code>"; return; }
  const kindsFound = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  st.textContent = files.length + " iconos en la wiki. Descargando todos…";
  g.innerHTML = '<span style="color:#9a948a">' + kindsFound.map(([k, v]) => `${k} (${v.length})`).join(" · ") + "</span>";

  // minimal ZIP (store) writer
  const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const zip = entries => { // entries: [{name, data:Uint8Array}]
    const enc = new TextEncoder(), parts = [], cd = []; let off = 0;
    const u16 = n => [n & 255, (n >> 8) & 255], u32 = n => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
    for (const e of entries) {
      const nm = enc.encode(e.name), crc = crc32(e.data), hdr = new Uint8Array([80, 75, 3, 4, ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(e.data.length), ...u32(e.data.length), ...u16(nm.length), ...u16(0), ...nm]);
      cd.push(new Uint8Array([80, 75, 1, 2, ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(e.data.length), ...u32(e.data.length), ...u16(nm.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off), ...nm]));
      parts.push(hdr, e.data); off += hdr.length + e.data.length;
    }
    const cdLen = cd.reduce((a, b) => a + b.length, 0);
    const end = new Uint8Array([80, 75, 5, 6, ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length), ...u32(cdLen), ...u32(off), ...u16(0)]);
    return new Blob([...parts, ...cd, end], { type: "application/zip" });
  };
  const slug = n => n.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const toWebp = async (blob, size) => { const im = await createImageBitmap(blob); const c = document.createElement("canvas"); const s = Math.min(1, size / Math.max(im.width, im.height)); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); const b = await new Promise(r => c.toBlob(r, "image/webp", 0.85)); return new Uint8Array(await (b || blob).arrayBuffer()); };

  await (async () => {
    let lock = null; try { lock = await navigator.wakeLock.request("screen"); } catch (e) {}
    const todo = files.filter(f => f.kind);
    const entries = [], failed = []; let n = 0;
    for (const f of todo) {
      if (stop) return;
      try { const r = await fetch(f.url); if (!r.ok) throw new Error("HTTP " + r.status); entries.push({ name: slug(f.item) + ".webp", data: await toWebp(await r.blob(), 64) }); }
      catch (e) { failed.push(f.name + " (" + e.message + ")"); }
      n++; st.textContent = `Descargando ${n}/${todo.length}… (${failed.length} fallos)`;
      await sleep(1000);
    }
    if (lock) { try { await lock.release(); } catch (e) {} }
    const blob = zip(entries), url = URL.createObjectURL(blob);
    st.textContent = `Listo: ${entries.length} iconos, ${Math.round(blob.size / 1024)} KB.`;
    out.innerHTML = `<a id="tl-save" href="${url}" download="er-icons.zip" style="display:inline-block;margin-top:8px;padding:10px 16px;background:#6fb37e;color:#111;border-radius:8px;font-weight:700;text-decoration:none">Guardar er-icons.zip</a>` + (failed.length ? `<details style="margin-top:8px"><summary>${failed.length} fallos</summary><pre style="white-space:pre-wrap;font-size:12px">${failed.join("\n")}</pre></details>` : "");
    try { out.querySelector("#tl-save").click(); } catch (e) {}
  })();
})();
