// Pooled projectiles for both the player and enemies.

import { TAU } from '../core/utils.js';

export class Bullet {
  constructor() { this.active = false; }

  reset(x, y, vx, vy, opts = {}) {
    this.active = true;
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.radius = opts.radius ?? 3.5;
    this.damage = opts.damage ?? 1;
    this.color = opts.color ?? '#1fd9ff';
    this.friendly = opts.friendly ?? true;
    this.life = opts.life ?? 3;
    this.kind = opts.kind ?? 'bolt';   // bolt | ball
    this.trail = opts.trail ?? true;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) this.active = false;
  }

  offscreen(w, h) {
    return this.x < -40 || this.x > w + 40 || this.y < -40 || this.y > h + 40;
  }

  render(ctx, quality) {
    ctx.save();
    if (quality) { ctx.shadowBlur = 12; ctx.shadowColor = this.color; }
    ctx.fillStyle = this.color;
    if (this.kind === 'ball') {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, TAU);
      ctx.fill();
    } else {
      // Capsule-ish bolt oriented along velocity.
      const ang = Math.atan2(this.vy, this.vx);
      ctx.translate(this.x, this.y);
      ctx.rotate(ang);
      const len = this.radius * 3.2;
      ctx.beginPath();
      ctx.ellipse(0, 0, len, this.radius, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.ellipse(0, 0, len * 0.5, this.radius * 0.45, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}

export class BulletPool {
  constructor(max = 600) {
    this.pool = Array.from({ length: max }, () => new Bullet());
  }
  spawn(x, y, vx, vy, opts) {
    for (const b of this.pool) {
      if (!b.active) { b.reset(x, y, vx, vy, opts); return b; }
    }
    // Saturated: stomp the first slot (extremely rare).
    this.pool[0].reset(x, y, vx, vy, opts);
    return this.pool[0];
  }
  forEachActive(fn) {
    for (const b of this.pool) if (b.active) fn(b);
  }
  clear() { for (const b of this.pool) b.active = false; }
}
