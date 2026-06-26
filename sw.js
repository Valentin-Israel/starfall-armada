// Service worker — caches the app shell for instant loads and offline play.
const CACHE = 'starfall-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles/main.css',
  './src/main.js',
  './src/core/Game.js',
  './src/core/Renderer.js',
  './src/core/Input.js',
  './src/core/AudioManager.js',
  './src/core/ParticleSystem.js',
  './src/core/Starfield.js',
  './src/core/Storage.js',
  './src/core/utils.js',
  './src/entities/Player.js',
  './src/entities/Enemy.js',
  './src/entities/Boss.js',
  './src/entities/Bullet.js',
  './src/entities/PowerUp.js',
  './src/ui/UI.js',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
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
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request)
        .then((res) => {
          // Runtime-cache same-origin successful responses.
          if (res.ok && new URL(e.request.url).origin === location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => caches.match('./index.html'));
    }),
  );
});
