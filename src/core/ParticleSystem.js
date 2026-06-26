// Pooled particle system for explosions, sparks, thruster trails and debris.

import { rand, TAU } from './utils.js';

class Particle {
  constructor() { this.active = false; }
  reset(x, y, opts) {
    this.active = true;
    this.x = x; this.y = y;
    const a = opts.angle ?? rand(0, TAU);
    const spd = opts.speed ?? rand(40, 200);
    this.vx = Math.cos(a) * spd;
    this.vy = Math.sin(a) * spd;
    this.life = opts.life ?? rand(0.3, 0.8);
    this.maxLife = this.life;
    this.size = opts.size ?? rand(1.5, 4);
    this.color = opts.color ?? '#1fd9ff';
    this.drag = opts.drag ?? 1.8;
    this.gravity = opts.gravity ?? 0;
    this.shrink = opts.shrink ?? true;
    this.glow = opts.glow ?? true;
  }
  update(dt) {
    this.life -= dt;
    if (this.life <= 0) { this.active = false; return; }
    const d = Math.pow(0.5, dt * this.drag);
    this.vx *= d;
    this.vy *= d;
    this.vy += this.gravity * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }
}

export class ParticleSystem {
  constructor(max = 1200) {
    this.pool = Array.from({ length: max }, () => new Particle());
    this.cursor = 0;
  }

  _spawn(x, y, opts) {
    // Ring-buffer allocation: reuse the oldest slot if we're saturated.
    let p = null;
    for (let i = 0; i < this.pool.length; i++) {
      const idx = (this.cursor + i) % this.pool.length;
      if (!this.pool[idx].active) { p = this.pool[idx]; this.cursor = (idx + 1) % this.pool.length; break; }
    }
    if (!p) { p = this.pool[this.cursor]; this.cursor = (this.cursor + 1) % this.pool.length; }
    p.reset(x, y, opts);
    return p;
  }

  burst(x, y, count, opts = {}) {
    for (let i = 0; i < count; i++) this._spawn(x, y, opts);
  }

  explosion(x, y, color = '#ffae3b', scale = 1) {
    const n = Math.round(18 * scale);
    for (let i = 0; i < n; i++) {
      this._spawn(x, y, {
        speed: rand(60, 320) * scale,
        life: rand(0.35, 0.9),
        size: rand(2, 5) * scale,
        color: i % 3 === 0 ? '#ffffff' : color,
        drag: 2.2,
      });
    }
    // A few slow embers.
    for (let i = 0; i < 6; i++) {
      this._spawn(x, y, { speed: rand(10, 60), life: rand(0.6, 1.3), size: rand(1, 3), color, drag: 1 });
    }
  }

  thruster(x, y, dirY = 1) {
    this._spawn(x, y, {
      angle: (dirY > 0 ? Math.PI / 2 : -Math.PI / 2) + rand(-0.4, 0.4),
      speed: rand(60, 160),
      life: rand(0.15, 0.35),
      size: rand(2, 4),
      color: Math.random() < 0.5 ? '#1fd9ff' : '#6c5cff',
      drag: 3,
    });
  }

  spark(x, y, color = '#ffffff') {
    for (let i = 0; i < 4; i++) {
      this._spawn(x, y, { speed: rand(80, 220), life: rand(0.12, 0.3), size: rand(1, 2.5), color, drag: 3 });
    }
  }

  update(dt) {
    for (const p of this.pool) if (p.active) p.update(dt);
  }

  render(ctx, quality) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.pool) {
      if (!p.active) continue;
      const t = p.life / p.maxLife;
      const size = p.shrink ? p.size * t : p.size;
      if (size <= 0.2) continue;
      ctx.globalAlpha = Math.min(1, t * 1.4);
      if (quality && p.glow) {
        ctx.shadowBlur = 12;
        ctx.shadowColor = p.color;
      } else {
        ctx.shadowBlur = 0;
      }
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
