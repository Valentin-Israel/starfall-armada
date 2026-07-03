// Entry point: build the subsystems, run the boot sequence, wire input
// peripherals, register the service worker, and hand control to the game loop.

import { Storage } from './core/Storage.js';
import { AudioManager } from './core/AudioManager.js';
import { UI } from './ui/UI.js';
import { Game } from './core/Game.js';
import { Online } from './online/Online.js';

const settings = Storage.loadSettings();
const audio = new AudioManager(settings);
const ui = new UI(settings, audio);

const canvas = document.getElementById('game');
const game = new Game({ canvas, settings, audio, ui });

// Online layer: accounts, cloud leaderboard, store, entitlements.
const online = new Online({ ui, audio });
game.online = online;
online.init();

// Native deep link: after Google sign-in in the system browser, the app is
// reopened via starfall://auth?token=… — exchange the token for a session.
const CapApp = window.Capacitor?.Plugins?.App;
if (CapApp && CapApp.addListener) {
  CapApp.addListener('appUrlOpen', ({ url }) => {
    const m = /^starfall:\/\/auth\?token=([^&]+)/.exec(url || '');
    if (m) online.completeNativeAuth(decodeURIComponent(m[1]));
  });
}

// Unlock the Web Audio context on the first user gesture (autoplay policy).
const unlock = () => {
  audio.unlock();
  if (settings.music && game.state === 'playing') audio.startMusic();
};
['pointerdown', 'keydown', 'touchstart'].forEach((ev) =>
  addEventListener(ev, unlock, { passive: true }));

// Mobile virtual joystick + action buttons.
game.input.bindVirtualStick(
  document.getElementById('touch-stick'),
  document.getElementById('touch-stick-knob'),
);
game.input.bindButton(document.getElementById('touch-bomb'), 'bomb');
game.input.bindButton(document.getElementById('touch-shield'), 'shield');

// Boot sequence → menu.
async function boot() {
  game.start();                 // start the render loop immediately (animated starfield)
  ui.show('screen-boot');
  await ui.runBoot();
  game.toMenu();
}
boot();

// Native (Capacitor) detection: bridge global, or the UA marker from capacitor.config.
const isNativeApp = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())
  || /StarfallApp/.test(navigator.userAgent);
window.__isNativeApp = isNativeApp;

// Service worker: web only. Inside the app WebView the site is loaded live
// anyway (server.url), and a stuck SW cache once bricked the app with a
// persistent black screen — so in native we not only skip registration but
// actively remove any leftover SW + caches (self-healing for affected installs).
if ('serviceWorker' in navigator) {
  if (isNativeApp) {
    navigator.serviceWorker.getRegistrations()
      .then((regs) => regs.forEach((r) => r.unregister()))
      .catch(() => {});
    if (window.caches && caches.keys) {
      caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
    }
  } else {
    // If the page is already controlled by an SW, this is a returning visit:
    // when a NEW service worker activates and claims control, reload once so the
    // user immediately runs the fresh code instead of a stale cached build.
    // (Guarded against loops; skipped on first-ever visit where controller is
    // null, so brand-new visitors never see an extra reload.)
    if (navigator.serviceWorker.controller) {
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        location.reload();
      });
    }
    addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {/* offline support is best-effort */});
    });
  }
}

// Expose for debugging in the console.
window.__starfall = game;
