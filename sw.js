// Service worker: app shell offline. Bump VERSION when files change.
const VERSION = "tl-v2";
const SHELL = ["./", "index.html", "src/ersave.js", "src/app.js", "data/items.json", "manifest.webmanifest", "favicon.svg"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // icons: cache on first use; shell: network first, cache fallback
  if (url.pathname.includes("/icons/")) {
    e.respondWith(caches.open(VERSION + "-icons").then(async c => (await c.match(e.request)) || fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; })));
    return;
  }
  e.respondWith(fetch(e.request).then(r => { if (r.ok) caches.open(VERSION).then(c => c.put(e.request, r.clone())); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
