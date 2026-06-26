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

// Register the service worker for offline / installable PWA support.
if ('serviceWorker' in navigator) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {/* offline support is best-effort */});
  });
}

// Expose for debugging in the console.
window.__starfall = game;
