// Offline copy of Time Well Billed. The app page is fetched fresh when online
// (so updates show straight away) and served from this cache when there's no signal.
const CACHE = "twb-v13";
const CORE = [
  "./",
  "./app.js",
  "./vendor/jspdf.umd.min.js",
  "./vendor/html2canvas.min.js",
  "./vendor/supabase.js"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // The app itself: network first, cached copy when offline
  if (req.mode === "navigate" || url.origin === location.origin) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req.mode === "navigate" ? "./" : req, copy)); }
          return res;
        })
        .catch(() => caches.match(req.mode === "navigate" ? "./" : req, { ignoreSearch: true }))
    );
    return;
  }

  // Libraries and fonts never change at a given address: cache first
  if (/^(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(url.hostname)) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
  }
});
