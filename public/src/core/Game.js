// Central game controller: state machine, fixed-step loop, wave director,
// collision resolution, scoring/combos, and lifecycle (menu ↔ play ↔ over).

import { Renderer } from './Renderer.js';
import { Input } from './Input.js';
import { ParticleSystem } from './ParticleSystem.js';
import { Starfield } from './Starfield.js';
import { Player } from '../entities/Player.js';
import { Enemy } from '../entities/Enemy.js';
import { Boss } from '../entities/Boss.js';
import { Asteroid } from '../entities/Asteroid.js';
import { PowerUp } from '../entities/PowerUp.js';
import { BulletPool } from '../entities/Bullet.js';
import { circleHit, rand, chance, pick, clamp } from './utils.js';
import { getShip } from '../data/Ships.js';
import { Storage } from './Storage.js';

const STATE = { BOOT: 'boot', MENU: 'menu', PLAYING: 'playing', PAUSED: 'paused', OVER: 'over' };

export class Game {
  constructor({ canvas, settings, audio, ui }) {
    this.settings = settings;
    this.audio = audio;
    this.ui = ui;
    this.renderer = new Renderer(canvas, settings);
    this.input = new Input(canvas);
    this.particles = new ParticleSystem(settings.quality ? 1400 : 700);
    this.starfield = new Starfield(this.renderer.width, this.renderer.height);

    this.playerBullets = new BulletPool(400);
    this.enemyBullets = new BulletPool(600);
    this.enemies = Array.from({ length: 64 }, () => new Enemy());
    this.asteroids = Array.from({ length: 30 }, () => new Asteroid());
    this.powerups = Array.from({ length: 24 }, () => new PowerUp());
    this.boss = new Boss();
    this.player = new Player(this);

    this.state = STATE.BOOT;
    this.last = 0;
    this.accumulator = 0;
    this.STEP = 1 / 120;          // fixed simulation step
    this._raf = null;

    this._wireUI();
    addEventListener('resize', () => this.starfield.resize(this.renderer.width, this.renderer.height));
    addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === STATE.PLAYING) this.pause();
    });
  }

  _wireUI() {
    this.ui.on('play', () => this.startRun());
    this.ui.on('restart', () => this.startRun());
    this.ui.on('resume', () => this.resume());
    this.ui.on('quit', () => this.toMenu());
    this.ui.on('pauseToggle', () => (this.state === STATE.PAUSED ? this.resume() : this.pause()));
    this.ui.on('settingsChanged', () => this.renderer.resize());
    this.ui.on('shopOpen', () => { this.ui.showShop(); });
  }

  // ---------------- lifecycle ----------------
  toMenu() {
    this.state = STATE.MENU;
    this.audio.stopMusic();
    this.ui.showHUD(false);
    this.ui.refreshMenu();
    this.ui.hideBoss();
    this.ui.show('screen-menu');
  }

  startRun() {
    // Load selected ship and apply its stats.
    const ship = getShip(Storage.getSelectedShipId());
    this.currentShip = ship;

    // Reset run state.
    this.score = 0;
    this.displayScore = 0;
    this.lives = ship.startLives;
    this.bombs = ship.startBombs;
    this.wave = 0;
    this.kills = 0;
    this.combo = 1;
    this.bestCombo = 1;
    this.comboTimer = 0;
    this.comboKills = 0;

    this.player.reset(ship);
    this.playerBullets.clear();
    this.enemyBullets.clear();
    this.enemies.forEach((e) => (e.active = false));
    this.asteroids.forEach((a) => (a.active = false));
    this.powerups.forEach((p) => (p.active = false));
    this.asteroidTimer = 3;
    this.boss.active = false;
    this.ui.hideBoss();

    this.spawnQueue = [];
    this.waveActive = false;
    this.waveBreak = 0.6;
    this.bossWave = false;

    this.state = STATE.PLAYING;
    this.ui.show(null);
    this.ui.showHUD(true);
    this.ui.setShipAbility(ship);
    this._syncHUD();
    this.audio.startMusic();
    this._nextWave();
  }

  pause() {
    if (this.state !== STATE.PLAYING) return;
    this.state = STATE.PAUSED;
    this.ui.show('screen-pause');
  }
  resume() {
    if (this.state !== STATE.PAUSED) return;
    this.state = STATE.PLAYING;
    this.ui.show(null);
    this.last = performance.now(); // avoid a giant dt jump
  }

  gameOver() {
    Storage.addCredits(Math.floor(this.score));
    this.state = STATE.OVER;
    this.audio.stopMusic();
    this.audio.bigExplosion();
    this.renderer.addShake(28);
    this.renderer.flash('#ff3b5c', 0.5);
    this.particles.explosion(this.player.x, this.player.y, '#1fd9ff', 2.4);
    this.ui.hideBoss();
    setTimeout(() => {
      this.ui.showGameOver({
        score: this.score, wave: this.wave, kills: this.kills, bestCombo: this.bestCombo,
      });
    }, 900);
  }

  // ---------------- wave director ----------------
  _nextWave() {
    this.wave++;
    this.ui.setWave(this.wave);
    this.audio.waveStart();
    this.bossWave = this.wave % 5 === 0;

    if (this.bossWave) {
      this.audio.bossWarn();
      this.renderer.flash('#ff3b5c', 0.3);
      this.boss.spawn(this.wave, this.renderer);
      this.ui.showBoss(this.boss.name);
      this.waveActive = true;
      return;
    }

    // Build a spawn queue for this wave.
    const count = 5 + this.wave * 2;
    const queue = [];
    let delay = 0.3;
    for (let i = 0; i < count; i++) {
      const type = this._pickEnemyType();
      const x = rand(40, this.renderer.width - 40);
      queue.push({ type, x, y: -30 - rand(0, 120), at: delay });
      delay += rand(0.25, 0.7);
    }
    this.spawnQueue = queue;
    this.waveTime = 0;
    this.waveActive = true;
  }

  _pickEnemyType() {
    const w = this.wave;
    const roll = Math.random();
    if (w >= 4 && roll < 0.18) return 'tank';
    if (w >= 2 && roll < 0.45) return 'kamikaze';
    if (w >= 1 && roll < 0.72) return 'fighter';
    return 'drone';
  }

  _spawnEnemy(type, x, y) {
    const e = this.enemies.find((en) => !en.active);
    if (e) e.spawn(type, x, y, this.wave);
  }

  _spawnAsteroid() {
    const W = this.renderer.width;
    const roll = Math.random();
    let size;
    if (this.wave >= 7 && roll < 0.2) size = 'large';
    else if (this.wave >= 4 && roll < 0.5) size = 'medium';
    else size = 'small';
    const a = this.asteroids.find((ast) => !ast.active);
    if (a) a.spawn(size, rand(30, W - 30), -60, rand(-30, 30));
  }

  _onAsteroidKilled(a) {
    this.kills++;
    const scale = a.size === 'large' ? 1.8 : a.size === 'medium' ? 1.1 : 0.6;
    this.particles.explosion(a.x, a.y, '#c8a96a', scale);
    this.audio.explosion();
    this.renderer.addShake(a.size === 'large' ? 6 : a.size === 'medium' ? 3 : 1);
    this._bumpCombo();
    this.score += Math.round(a.score * this.combo);
    if (a.splitInto) {
      for (let i = 0; i < 2; i++) {
        const child = this.asteroids.find((c) => !c.active);
        if (child) child.spawn(a.splitInto, a.x + rand(-20, 20), a.y + rand(-10, 10), a.vx + rand(-50, 50));
      }
    }
    if (a.size === 'large' && chance(0.4)) this._dropPowerUp(a.x, a.y);
    this._syncHUD();
  }

  _dropPowerUp(x, y, forced = null) {
    const type = forced || pick(['weapon', 'rapid', 'shield', 'bomb', 'weapon', 'rapid']);
    const p = this.powerups.find((pu) => !pu.active);
    if (p) p.spawn(type, x, y);
  }

  // ---------------- bomb ----------------
  useBomb() {
    if (this.bombs <= 0) return;
    this.bombs--;
    this.audio.bomb();
    this.renderer.addShake(24);
    this.renderer.flash('#ffffff', 0.7);
    this.enemyBullets.clear();
    // Damage everything on screen.
    for (const e of this.enemies) {
      if (e.active) {
        this.particles.explosion(e.x, e.y, e.color, 1.1);
        if (e.damage(6, this)) this._onEnemyKilled(e);
      }
    }
    for (const a of this.asteroids) {
      if (a.active) {
        this.particles.explosion(a.x, a.y, a.color, 0.8);
        if (a.damage(99, this)) this._onAsteroidKilled(a);
      }
    }
    if (this.boss.active) {
      this.boss.damage(40, this);
      this.particles.explosion(this.boss.x, this.boss.y, '#ffcf3b', 2);
    }
    this.particles.burst(this.player.x, this.player.y, 60, { speed: 600, life: 0.6, color: '#1fd9ff', size: 4 });
    this._syncHUD();
  }

  // ---------------- super bomb (Warbringer) ----------------
  useSuperBomb() {
    if (this.bombs < 2) return;
    this.bombs -= 2;
    this.audio.bomb();
    this.renderer.addShake(36);
    this.renderer.flash('#ffcf3b', 0.9);
    this.enemyBullets.clear();
    for (const e of this.enemies) {
      if (e.active) {
        this.particles.explosion(e.x, e.y, e.color, 1.6);
        if (e.damage(12, this)) this._onEnemyKilled(e);
      }
    }
    for (const a of this.asteroids) {
      if (a.active) {
        this.particles.explosion(a.x, a.y, a.color, 1.0);
        if (a.damage(99, this)) this._onAsteroidKilled(a);
      }
    }
    if (this.boss.active) {
      this.boss.damage(80, this);
      this.particles.explosion(this.boss.x, this.boss.y, '#ffcf3b', 3.0);
    }
    this.particles.burst(this.player.x, this.player.y, 90, { speed: 750, life: 0.75, color: '#ffcf3b', size: 6 });
    this._syncHUD();
  }

  // ---------------- core update ----------------
  update(dt) {
    // Background always animates for ambience.
    const bgSpeed = this.state === STATE.PLAYING ? 1 + this.wave * 0.04 : 0.6;
    this.starfield.update(dt, bgSpeed);

    if (this.state !== STATE.PLAYING) return;

    this.input.update();

    // Actions.
    if (this.input.consumePause()) { this.pause(); return; }
    if (this.input.consumeBomb()) this.useBomb();
    if (this.input.consumeShield()) {
      if (this.player.shipId === 'warbringer') this.useSuperBomb();
      else this.player.activateShield();
    }

    this.player.update(dt, this.input);

    // Wave spawning.
    if (!this.bossWave && this.spawnQueue.length) {
      this.waveTime += dt;
      while (this.spawnQueue.length && this.spawnQueue[0].at <= this.waveTime) {
        const s = this.spawnQueue.shift();
        this._spawnEnemy(s.type, s.x, s.y);
      }
    }

    // Asteroid spawning.
    this.asteroidTimer -= dt;
    if (this.asteroidTimer <= 0) {
      const interval = Math.max(1.5, 4.5 - this.wave * 0.2);
      this.asteroidTimer = interval * (0.8 + Math.random() * 0.4);
      this._spawnAsteroid();
    }

    // Entities.
    for (const a of this.asteroids) if (a.active) a.update(dt, this);
    for (const e of this.enemies) if (e.active) e.update(dt, this);
    if (this.boss.active) {
      this.boss.update(dt, this);
      this.ui.setBossHealth(this.boss.hp / this.boss.maxHp);
    }
    for (const p of this.powerups) if (p.active) p.update(dt, this);
    this.playerBullets.forEachActive((b) => { b.update(dt); if (b.offscreen(this.renderer.width, this.renderer.height)) b.active = false; });
    this.enemyBullets.forEachActive((b) => { b.update(dt); if (b.offscreen(this.renderer.width, this.renderer.height)) b.active = false; });
    this.particles.update(dt);

    this._collide();
    this._updateCombo(dt);
    this._checkWaveEnd(dt);

    // Smooth score counter.
    this.displayScore += (this.score - this.displayScore) * clamp(dt * 12, 0, 1);
    this.ui.setScore(this.displayScore);
    if (this.player.shipId === 'warbringer') {
      this.ui.setShield(this.bombs < 2 ? 1 : 0, 1, false);
    } else {
      this.ui.setShield(this.player.shieldCooldown, this.player.shieldCdMax, this.player.hasShield);
    }
  }

  _collide() {
    const W = this.renderer.width, H = this.renderer.height;

    // Player bullets → enemies / boss.
    this.playerBullets.forEachActive((b) => {
      for (const e of this.enemies) {
        if (!e.active) continue;
        if (circleHit(b.x, b.y, b.radius, e.x, e.y, e.radius)) {
          b.active = false;
          if (e.damage(b.damage, this)) this._onEnemyKilled(e);
          return;
        }
      }
      if (this.boss.active && circleHit(b.x, b.y, b.radius, this.boss.x, this.boss.y, this.boss.radius)) {
        b.active = false;
        this.particles.spark(b.x, b.y, '#ffcf3b');
        if (this.boss.damage(b.damage, this)) this._onBossKilled();
        return;
      }
      for (const a of this.asteroids) {
        if (!a.active) continue;
        if (circleHit(b.x, b.y, b.radius, a.x, a.y, a.radius)) {
          b.active = false;
          if (a.damage(b.damage, this)) this._onAsteroidKilled(a);
          return;
        }
      }
    });

    // Enemy bullets → player.
    this.enemyBullets.forEachActive((b) => {
      if (circleHit(b.x, b.y, b.radius, this.player.x, this.player.y, this.player.radius)) {
        if (this.player.hit()) { b.active = false; return; }
        b.active = false;
        this._damagePlayer();
      }
    });

    // Enemy bodies → player.
    for (const e of this.enemies) {
      if (!e.active) continue;
      if (circleHit(e.x, e.y, e.radius, this.player.x, this.player.y, this.player.radius)) {
        if (!this.player.hit()) this._damagePlayer();
        // Kamikaze detonates; others take damage.
        this.particles.explosion(e.x, e.y, e.color, 1);
        if (e.damage(3, this)) this._onEnemyKilled(e);
      }
    }
    // Boss body → player.
    if (this.boss.active && !this.boss.entering &&
        circleHit(this.boss.x, this.boss.y, this.boss.radius * 0.8, this.player.x, this.player.y, this.player.radius)) {
      if (!this.player.hit()) this._damagePlayer();
    }

    // Asteroid bodies → player.
    for (const a of this.asteroids) {
      if (!a.active) continue;
      if (circleHit(a.x, a.y, a.radius * 0.85, this.player.x, this.player.y, this.player.radius)) {
        if (!this.player.hit()) this._damagePlayer();
        this.particles.explosion(a.x, a.y, a.color, 0.8);
        if (a.damage(a.size === 'small' ? 99 : 3, this)) this._onAsteroidKilled(a);
      }
    }

    // Power-ups → player.
    for (const p of this.powerups) {
      if (!p.active) continue;
      if (circleHit(p.x, p.y, p.radius + 6, this.player.x, this.player.y, this.player.radius)) {
        p.active = false;
        this._applyPowerUp(p.type);
      }
    }
  }

  _applyPowerUp(type) {
    this.audio.powerup();
    this.particles.burst(this.player.x, this.player.y, 16, { speed: 200, life: 0.5, color: '#1fd9ff', size: 3 });
    switch (type) {
      case 'weapon': this.player.upgradeWeapon(); break;
      case 'rapid': this.player.grantRapid(6); break;
      case 'shield': this.player.grantShieldCharge(); break;
      case 'bomb': this.bombs = Math.min(this.bombs + 1, 9); break;
      case 'life': this.lives = Math.min(this.lives + 1, 5); break;
    }
    this._syncHUD();
  }

  _damagePlayer() {
    this.lives--;
    this.player.invuln = 1.6;
    this.player.weaponLevel = Math.max(1, this.player.weaponLevel - 1); // lose a tier on hit
    this.audio.playerHit();
    this.renderer.addShake(18);
    this.renderer.flash('#ff3b5c', 0.45);
    this.particles.explosion(this.player.x, this.player.y, '#1fd9ff', 1.3);
    this._resetCombo();
    this._syncHUD();
    if (this.lives <= 0) {
      this.player.alive = false;
      this.gameOver();
    }
  }

  _onEnemyKilled(e) {
    this.kills++;
    this.particles.explosion(e.x, e.y, e.color, e.type === 'tank' ? 1.8 : 1);
    this.audio.explosion();
    this.renderer.addShake(e.type === 'tank' ? 8 : 3);
    this._bumpCombo();
    this.score += Math.round(e.score * this.combo);
    // Drop chance scales down for weak enemies.
    const dropChance = e.type === 'tank' ? 0.85 : e.type === 'fighter' ? 0.16 : 0.1;
    if (chance(dropChance)) this._dropPowerUp(e.x, e.y);
    this._syncHUD();
  }

  _onBossKilled() {
    this.kills++;
    this.score += Math.round(this.boss.score * this.combo);
    this.audio.bigExplosion();
    this.renderer.addShake(30);
    this.renderer.flash('#ffffff', 0.6);
    // Multi-stage explosion.
    for (let i = 0; i < 10; i++) {
      setTimeout(() => {
        if (this.state !== STATE.PLAYING && this.state !== STATE.PAUSED) return;
        this.particles.explosion(
          this.boss.x + rand(-50, 50), this.boss.y + rand(-40, 40),
          pick(['#ffcf3b', '#ff3b5c', '#ffffff']), 1.6);
      }, i * 80);
    }
    this.ui.hideBoss();
    this._dropPowerUp(this.boss.x - 30, this.boss.y, 'weapon');
    this._dropPowerUp(this.boss.x + 30, this.boss.y, 'bomb');
    this._dropPowerUp(this.boss.x, this.boss.y + 30, 'life');
    this._syncHUD();
  }

  // ---------------- combo ----------------
  _bumpCombo() {
    this.comboKills++;
    this.comboTimer = 2.4;
    const newCombo = Math.min(1 + Math.floor(this.comboKills / 3), 8);
    if (newCombo !== this.combo) { this.combo = newCombo; this.ui.setCombo(this.combo); }
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
  }
  _resetCombo() { this.combo = 1; this.comboKills = 0; this.comboTimer = 0; this.ui.setCombo(1); }
  _updateCombo(dt) {
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this._resetCombo();
    }
  }

  _checkWaveEnd(dt) {
    if (!this.waveActive) {
      this.waveBreak -= dt;
      if (this.waveBreak <= 0) { this.waveBreak = 1.4; this._nextWave(); }
      return;
    }
    const enemiesLeft = this.enemies.some((e) => e.active) || this.spawnQueue.length > 0;
    const bossLeft = this.boss.active;
    if (!enemiesLeft && !bossLeft) {
      this.waveActive = false;
      this.waveBreak = 1.4;
    }
  }

  _syncHUD() {
    this.ui.setLives(this.lives);
    this.ui.setHP(this.lives, 5);
    this.ui.setBomb(this.bombs);
    this.ui.setScore(this.score);
  }

  // ---------------- render ----------------
  render() {
    const { ctx } = this.renderer;
    const q = this.settings.quality;
    this.starfield.render(ctx, q);

    if (this.state === STATE.PLAYING || this.state === STATE.PAUSED || this.state === STATE.OVER) {
      for (const a of this.asteroids) if (a.active) a.render(ctx, q);
      this.enemyBullets.forEachActive((b) => b.render(ctx, q));
      for (const p of this.powerups) if (p.active) p.render(ctx, q);
      for (const e of this.enemies) if (e.active) e.render(ctx, q);
      if (this.boss.active) this.boss.render(ctx, q);
      if (this.player.alive) this.player.render(ctx, q);
      this.playerBullets.forEachActive((b) => b.render(ctx, q));
    }
    this.particles.render(ctx, q);
  }

  // ---------------- main loop ----------------
  start() {
    this.last = performance.now();
    const loop = (now) => {
      this._raf = requestAnimationFrame(loop);
      let dt = (now - this.last) / 1000;
      this.last = now;
      if (dt > 0.1) dt = 0.1;           // clamp to avoid spiral after tab-out

      // Fixed-step simulation for stable physics; render once per frame.
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= this.STEP && steps < 8) {
        this.update(this.STEP);
        this.accumulator -= this.STEP;
        steps++;
      }
      this.renderer.beginFrame(dt);
      this.render();
      this.renderer.endFrame();
    };
    this._raf = requestAnimationFrame(loop);
  }
}

export { STATE };
