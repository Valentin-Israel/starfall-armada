// Boss enemy: enters from the top, sweeps horizontally, and cycles through
// escalating attack patterns. Phases unlock as its health drops.

import { TAU, rand, angleTo, clamp, lerp } from '../core/utils.js';

const NAMES = ['DREADNOUGHT', 'OBLIVION CORE', 'VOID SOVEREIGN', 'STARBREAKER', 'THE LEVIATHAN'];

export class Boss {
  constructor() { this.active = false; }

  spawn(wave, renderer) {
    this.active = true;
    this.wave = wave;
    this.tier = Math.floor(wave / 5);
    this.name = NAMES[Math.min(this.tier - 1, NAMES.length - 1)] || 'DREADNOUGHT';
    this.radius = 58;
    this.x = renderer.width / 2;
    this.y = -90;
    this.targetY = 130;
    this.entering = true;
    this.maxHp = 220 + this.tier * 160;
    this.hp = this.maxHp;
    this.t = 0;
    this.fireTimer = 1.4;
    this.pattern = 0;
    this.patternTimer = 0;
    this.sweepDir = 1;
    this.hitFlash = 0;
    this.dead = false;
    this.score = 2000 + this.tier * 1500;
    return this;
  }

  get phase() {
    const f = this.hp / this.maxHp;
    if (f > 0.66) return 0;
    if (f > 0.33) return 1;
    return 2;
  }

  update(dt, game) {
    this.t += dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    const { width } = game.renderer;

    if (this.entering) {
      this.y = lerp(this.y, this.targetY, clamp(dt * 2, 0, 1));
      if (Math.abs(this.y - this.targetY) < 2) this.entering = false;
      return;
    }

    // Horizontal sweep, faster in later phases.
    const sweepSpeed = (60 + this.phase * 40) * this.sweepDir;
    this.x += sweepSpeed * dt;
    const margin = this.radius + 20;
    if (this.x < margin) { this.x = margin; this.sweepDir = 1; }
    if (this.x > width - margin) { this.x = width - margin; this.sweepDir = -1; }
    this.y = this.targetY + Math.sin(this.t * 1.4) * 18;

    // Cycle attack patterns.
    this.patternTimer -= dt;
    if (this.patternTimer <= 0) {
      this.pattern = (this.pattern + 1) % (3 + this.phase);
      this.patternTimer = 2.6;
    }

    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this._attack(game);
    }
  }

  _attack(game) {
    const p = game.player;
    const phase = this.phase;
    switch (this.pattern % 4) {
      case 0: { // Aimed triple
        this.fireTimer = 0.5 - phase * 0.08;
        const base = angleTo(this.x, this.y, p.x, p.y);
        for (const off of [-0.18, 0, 0.18]) this._shot(game, base + off, 300);
        break;
      }
      case 1: { // Radial burst
        this.fireTimer = 1.4;
        const n = 14 + phase * 6;
        const start = rand(0, TAU);
        for (let i = 0; i < n; i++) this._shot(game, start + (i / n) * TAU, 220);
        break;
      }
      case 2: { // Sweeping fan
        this.fireTimer = 0.12;
        const a = Math.PI / 2 + Math.sin(this.t * 3) * 0.9;
        this._shot(game, a, 260);
        break;
      }
      default: { // Spiral
        this.fireTimer = 0.07;
        const a = (this.t * 4) % TAU;
        this._shot(game, a, 240);
        this._shot(game, a + Math.PI, 240);
        break;
      }
    }
    game.audio.enemyShoot();
  }

  _shot(game, angle, speed) {
    game.enemyBullets.spawn(this.x, this.y + this.radius * 0.4,
      Math.cos(angle) * speed, Math.sin(angle) * speed,
      { radius: 6, color: '#ff3b5c', friendly: false, kind: 'ball', life: 6 });
  }

  damage(amount, game) {
    if (this.entering) return false;
    this.hp -= amount;
    this.hitFlash = 0.06;
    if (this.hp <= 0) {
      this.active = false;
      this.dead = true;
      return true;
    }
    return false;
  }

  render(ctx, quality) {
    ctx.save();
    ctx.translate(this.x, this.y);
    const c = this.hitFlash > 0 ? '#ffffff' : '#ff3b5c';
    if (quality) { ctx.shadowBlur = 26; ctx.shadowColor = c; }

    // Outer hull — angular capital ship.
    const r = this.radius;
    const body = ctx.createLinearGradient(0, -r, 0, r);
    body.addColorStop(0, '#3a0d18');
    body.addColorStop(0.5, this.hitFlash > 0 ? '#ffffff' : '#7a1330');
    body.addColorStop(1, '#1a0610');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(0, r);
    ctx.lineTo(r, r * 0.2);
    ctx.lineTo(r * 0.7, -r * 0.5);
    ctx.lineTo(r * 0.3, -r * 0.9);
    ctx.lineTo(-r * 0.3, -r * 0.9);
    ctx.lineTo(-r * 0.7, -r * 0.5);
    ctx.lineTo(-r, r * 0.2);
    ctx.closePath();
    ctx.fill();

    // Core that pulses brighter in later phases.
    ctx.shadowBlur = quality ? 30 : 0;
    ctx.shadowColor = '#ffcf3b';
    const pulse = 0.5 + Math.sin(this.t * (4 + this.phase * 3)) * 0.4;
    ctx.fillStyle = `rgba(255,${120 + this.phase * 40},60,${0.6 + pulse * 0.4})`;
    ctx.beginPath();
    ctx.arc(0, -r * 0.1, r * 0.32 * (0.8 + pulse * 0.3), 0, TAU);
    ctx.fill();

    // Side cannons.
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#2a0a14';
    ctx.fillRect(-r * 0.95, -r * 0.1, r * 0.3, r * 0.5);
    ctx.fillRect(r * 0.65, -r * 0.1, r * 0.3, r * 0.5);

    ctx.restore();
  }
}
