// Service worker — caches the app shell for instant loads and offline play.
//
// Caching strategy is split by what the resource IS, because getting this wrong
// once bricked returning visitors: code (HTML/JS/CSS) is served NETWORK-FIRST so
// every deploy reaches users on their next load, while binary assets (icons,
// images, fonts) use stale-while-revalidate so they stay fast AND self-update in
// the background. Nothing is pinned "cache-first forever" anymore — an earlier
// version did exactly that for JS modules and left returning users running stale
// JavaScript against a fresh page (store/leaderboard/game all dead) until the
// cache name changed. Do not reintroduce cache-first for code.
const CACHE = 'starfall-v8';
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
  '/assets/icons/favicon-16x16.png',
  '/assets/icons/favicon-32x32.png',
  '/assets/icons/android-chrome-192x192.png',
  '/assets/icons/android-chrome-512x512.png',
  '/assets/icons/icon.png',
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

// Network-first: fetch fresh, fall back to cache only when offline. Used for
// anything whose contents change between deploys (documents + code).
function networkFirst(request, fallbackToIndex) {
  return fetch(request)
    .then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
      }
      return res;
    })
    .catch(() =>
      caches.match(request).then((c) => c || (fallbackToIndex ? caches.match('/index.html') : undefined)),
    );
}

// Stale-while-revalidate: serve cache instantly for speed, refresh in the
// background so the NEXT load is current. Used for binary assets where a
// one-load-stale icon is harmless but "pinned forever" is not.
function staleWhileRevalidate(request) {
  return caches.match(request).then((cached) => {
    const network = fetch(request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      })
      .catch(() => cached);
    return cached || network;
  });
}

// Treat as "code" anything that defines app behavior or layout — must never go
// stale. Everything else same-origin (icons, images, fonts) is a binary asset.
const CODE_RE = /\.(?:js|mjs|css|html|json|webmanifest)$/i;

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Never serve API responses from cache.
  if (url.origin === location.origin && url.pathname.startsWith('/api/')) return;
  // Don't touch cross-origin requests — let the network handle them.
  if (url.origin !== location.origin) return;

  // Page navigations and code: network-first so deploys always reach users.
  if (e.request.mode === 'navigate') {
    e.respondWith(networkFirst(e.request, true));
    return;
  }
  if (CODE_RE.test(url.pathname)) {
    e.respondWith(networkFirst(e.request, false));
    return;
  }

  // Binary assets: fast from cache, refreshed in the background.
  e.respondWith(staleWhileRevalidate(e.request));
});
