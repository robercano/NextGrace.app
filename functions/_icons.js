// Icons served from R2 (binding ICONS, bucket of the game art extracted from the owner's copy; tools/EXTRACT.md) with the
// static assets as fallback, so the public repo never has to carry the pictures. Keys in the bucket: "icons/<file>" and
// "icons/map/<file>". icons/index.json is built from the bucket listing (cached per isolate) so src/icons.js keeps working.
const INDEX_TTL_MS = 10 * 60e3;
let indexCache = { at: 0, body: null };
const TYPES = { webp: "image/webp", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", svg: "image/svg+xml", json: "application/json" };

export function iconsEnabled(env) { return !!env.ICONS; }

export async function listIcons(env) {
  const names = []; let cursor;
  do { const r = await env.ICONS.list({ prefix: "icons/", cursor, limit: 1000 }); for (const o of r.objects) { const n = o.key.slice(6); if (n && !n.includes("/") && n !== "index.json") names.push(n); } cursor = r.truncated ? r.cursor : undefined; } while (cursor);
  names.sort();
  return names;
}

/** GET /icons/* → R2 object, else the static asset. */
export async function serveIcon(request, env, url) {
  const key = url.pathname.slice(1); // "icons/x.webp" | "icons/map/tlb.webp" | "icons/index.json"
  if (key === "icons/index.json") {
    if (Date.now() - indexCache.at > INDEX_TTL_MS || !indexCache.body) {
      // union of the bucket and whatever the static assets still carry (during the migration both exist; after the purge only R2)
      try {
        const names = new Set(await listIcons(env));
        try { const a = await env.ASSETS.fetch(new Request(url)); if (a.ok) for (const n of await a.json()) names.add(n); } catch (e) {}
        if (names.size) indexCache = { at: Date.now(), body: JSON.stringify([...names].sort()) };
      } catch (e) { console.error("icons list", e); }
    }
    if (indexCache.body) return new Response(indexCache.body, { headers: { "content-type": "application/json", "cache-control": "public, max-age=300" } });
    return env.ASSETS.fetch(request);
  }
  const obj = await env.ICONS.get(key);
  if (obj) {
    const ext = key.split(".").pop().toLowerCase();
    const h = new Headers({ "content-type": obj.httpMetadata && obj.httpMetadata.contentType || TYPES[ext] || "application/octet-stream", "cache-control": "public, max-age=2592000, immutable", etag: obj.httpEtag });
    if (request.headers.get("if-none-match") === obj.httpEtag) return new Response(null, { status: 304, headers: h });
    return new Response(obj.body, { headers: h });
  }
  return env.ASSETS.fetch(request);
}

/** Called after uploads so the next index.json reflects the bucket. */
export function invalidateIndex() { indexCache = { at: 0, body: null }; }
