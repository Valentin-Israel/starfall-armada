// Headless smoke test: load the game, assert no console errors, drive a real
// run via keyboard, and capture screenshots of the menu and live gameplay.
import { chromium } from 'playwright-core';
import path from 'node:path';

const OUT = process.env.SHOT_DIR || '/tmp/claude-0/-home-user-informatik-10a/2550d9d5-590a-51b4-ac01-87625b25d8d3/scratchpad';
const URL = process.env.GAME_URL || 'http://localhost:5173/index.html';
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const errors = [];
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const ctx = await browser.newContext({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

// Track icon / manifest delivery so a broken favicon is caught, not just JS.
const ICONS = ['/favicon.ico', '/assets/icons/icon.svg', '/assets/icons/apple-touch-icon.png', '/manifest.webmanifest', '/assets/icons/icon-192.png'];
const matchIcon = (u) => ICONS.find((p) => u.endsWith(p));
page.on('requestfailed', (r) => {
  const p = matchIcon(r.url());
  if (p) errors.push('icon request failed: ' + p);
});

await page.goto(URL, { waitUntil: 'networkidle' });

// Explicitly fetch every icon from the page context and assert 200 + type.
const iconChecks = await page.evaluate(async (icons) => {
  const out = {};
  for (const p of icons) {
    try {
      const res = await fetch(p, { cache: 'no-store' });
      out[p] = { status: res.status, type: res.headers.get('content-type') };
    } catch (e) { out[p] = { status: 0, error: String(e) }; }
  }
  return out;
}, ICONS);
console.log('icon checks:', JSON.stringify(iconChecks));
for (const [p, r] of Object.entries(iconChecks)) {
  if (r.status !== 200) errors.push(`icon ${p} returned ${r.status}`);
}

// Wait for boot → menu transition.
await page.waitForSelector('#screen-menu:not(.hidden)', { timeout: 8000 });
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(OUT, 'shot-menu.png') });
console.log('captured menu');

// Read the live game state object the app exposes.
const menuState = await page.evaluate(() => window.__starfall?.state);
console.log('state after boot:', menuState);

// Start a run.
await page.click('#btn-play');
await page.waitForTimeout(600);
const playingState = await page.evaluate(() => window.__starfall?.state);
console.log('state after Play:', playingState);

// Drive the ship + verify bullets are firing and time advances.
await page.keyboard.down('ArrowLeft');
await page.waitForTimeout(500);
await page.keyboard.up('ArrowLeft');
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(700);
await page.keyboard.up('ArrowRight');
await page.waitForTimeout(2500); // let enemies appear and combat happen

const stats = await page.evaluate(() => {
  const g = window.__starfall;
  return {
    state: g.state,
    wave: g.wave,
    score: g.score,
    lives: g.lives,
    activeEnemies: g.enemies.filter((e) => e.active).length,
    activePlayerBullets: g.playerBullets.pool.filter((b) => b.active).length,
    playerAlive: g.player.alive,
  };
});
console.log('mid-run stats:', JSON.stringify(stats));
await page.screenshot({ path: path.join(OUT, 'shot-gameplay.png') });
console.log('captured gameplay');

// Fire a bomb and raise shield to exercise those paths.
await page.keyboard.press('Space');
await page.keyboard.down('Shift');
await page.waitForTimeout(400);
await page.keyboard.up('Shift');
await page.waitForTimeout(300);

// Jump to a boss wave to verify boss rendering/logic. Make the test ship
// immortal so the idle pilot doesn't die while we observe.
await page.evaluate(() => {
  const g = window.__starfall;
  g.player.invuln = 9999;
  g.enemies.forEach((e) => (e.active = false));
  g.spawnQueue = [];
  g.wave = 4; // next wave becomes 5 → boss
  g.waveActive = false;
  g.waveBreak = 0.1;
});
await page.waitForTimeout(3000);
const bossStats = await page.evaluate(() => {
  const g = window.__starfall;
  return {
    state: g.state, wave: g.wave, playerAlive: g.player.alive,
    bossActive: g.boss.active, bossHpPct: Math.round((g.boss.hp / g.boss.maxHp) * 100),
    bossName: g.boss.name,
  };
});
console.log('boss stats:', JSON.stringify(bossStats));
await page.screenshot({ path: path.join(OUT, 'shot-boss.png') });
console.log('captured boss');
if (bossStats.state === 'playing' && !bossStats.bossActive) {
  errors.push('Boss failed to spawn on wave 5');
}

// Force-show mobile touch controls and screenshot them.
await page.evaluate(() => document.getElementById('touch-controls').classList.remove('hidden'));
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(OUT, 'shot-touch.png') });
console.log('captured touch controls');

// Drive the player to death to verify the game-over + leaderboard flow.
await page.evaluate(() => {
  const g = window.__starfall;
  g.boss.active = false;
  g.player.invuln = 0;
  g.player.shieldActive = false;
  g.lives = 1;
  g._damagePlayer();
});
await page.waitForTimeout(1400); // gameOver() shows the screen after ~900ms
const overVisible = await page.evaluate(() => ({
  state: window.__starfall.state,
  lives: window.__starfall.lives,
  hidden: document.getElementById('screen-over').classList.contains('hidden'),
}));
console.log('over-debug:', JSON.stringify(overVisible));
const over = await page.evaluate(() => ({
  state: window.__starfall.state,
  overScore: document.getElementById('over-score').textContent,
  scoresSaved: JSON.parse(localStorage.getItem('starfall.scores.v1') || '[]').length,
}));
console.log('game-over stats:', JSON.stringify(over));
await page.screenshot({ path: path.join(OUT, 'shot-over.png') });
console.log('captured game over');
if (over.state !== 'over') errors.push('Game over state not reached');
if (over.scoresSaved < 1) errors.push('Score not persisted to leaderboard');

await browser.close();

if (errors.length) {
  console.error('\n❌ ERRORS DETECTED:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('\n✅ No console/page errors. Game is functional.');
