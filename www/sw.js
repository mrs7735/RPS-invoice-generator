/* RPS Invoice — Service Worker (network-first for app, cache for offline) */
const CACHE = 'rps-invoice-web-v6';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/logo.png',
  './assets/js/pdfmake.min.js',
  './assets/js/vfs_fonts.js',
];

// Install — pre-cache the app shell, activate immediately
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

// Activate — wipe ALL old caches so stale HTML/JS can never be served again
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/*
 * Fetch strategy:
 *  - HTML documents & scripts  → NETWORK-FIRST (always get the latest app),
 *                                fall back to cache only when offline.
 *  - Other static assets       → CACHE-FIRST (fast), network fallback.
 * This guarantees a fixed/updated app is never blocked by a stale cache.
 */
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);
  const isHTML = e.request.mode === 'navigate' ||
                 e.request.destination === 'document' ||
                 url.pathname.endsWith('.html') ||
                 url.pathname === '/' ;
  const isScript = e.request.destination === 'script' || url.pathname.endsWith('.js');

  if (isHTML || isScript) {
    // NETWORK-FIRST
    e.respondWith(
      fetch(e.request).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => caches.match(e.request).then((c) => c || caches.match('./index.html')))
    );
    return;
  }

  // CACHE-FIRST for images, manifest, fonts, etc.
  e.respondWith(
    caches.match(e.request).then((cached) =>
      cached || fetch(e.request).then((res) => {
        if (res && res.status === 200 && url.origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => cached)
    )
  );
});
