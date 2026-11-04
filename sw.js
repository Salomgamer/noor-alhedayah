// Service Worker for Noor Al-Hidayah (نور الهداية) PWA - v3
const CACHE_NAME = 'noor-alhidayah-v3';

const CORE_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './manifest.webmanifest',
  './favicon.svg'
];

// Install: pre-cache core assets and activate immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_ASSETS);
    })
  );
});

// Activate: clean up old caches and claim all clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: network-first for HTML, stale-while-revalidate for JS/CSS/assets
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1. Navigation / HTML: Network-first, fallback to cache for offline
  if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return response;
        })
        .catch(() => caches.match('./index.html') || caches.match('./'))
    );
    return;
  }

  // 2. Same-origin assets (JS, CSS, SVGs): Stale-While-Revalidate with automatic cache refresh
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
            }
            return networkResponse;
          })
          .catch(() => cached);

        return cached || fetchPromise;
      })
    );
    return;
  }

  // 3. External assets (fonts, APIs): Network with cache fallback
  event.respondWith(
    caches.match(req).then((cached) => {
      return cached || fetch(req).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
