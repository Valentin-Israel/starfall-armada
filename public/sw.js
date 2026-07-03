// Service worker — caches the app shell for instant loads and offline play.
// NOTE: bump CACHE on ANY asset/icon change, or returning visitors keep the old
// cached copy forever (this SW also runtime-caches same-origin GETs).
const CACHE = 'starfall-v6';
const ASSETS = [
  '/',
  '/index.html',
  '/privacy',
  '/terms',
  '/impressum',
  '/manifest.webmanifest',
  '/styles/main.css',
  '/src/main.js',
  '/src/core/Game.js',
  '/src/core/Renderer.js',
  '/src/core/Input.js',
  '/src/core/AudioManager.js',
  '/src/core/ParticleSystem.js',
  '/src/core/Starfield.js',
  '/src/core/Storage.js',
  '/src/core/utils.js',
  '/src/entities/Player.js',
  '/src/entities/Enemy.js',
  '/src/entities/Boss.js',
  '/src/entities/Bullet.js',
  '/src/entities/PowerUp.js',
  '/src/ui/UI.js',
  '/src/online/api.js',
  '/src/online/Online.js',
  '/favicon.ico',
  '/assets/icons/icon.svg',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/icon-maskable-512.png',
  '/assets/icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Never serve API responses from cache.
  if (url.origin === location.origin && url.pathname.startsWith('/api/')) return;

  // Page loads: NETWORK-FIRST so deploys/fixes always reach users immediately;
  // the cache is only the offline fallback. (Cache-first pages once pinned a
  // broken state until the SW version changed.)
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => caches.match(e.request).then((c) => c || caches.match('/index.html'))),
    );
    return;
  }

  // Static assets: cache-first (fast), network fill on miss.
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request)
        .then((res) => {
          // Runtime-cache same-origin successful responses.
          if (res.ok && url.origin === location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => caches.match('/index.html'));
    }),
  );
});
