// Multi-layer parallax starfield with drifting nebula clouds for depth.

import { rand, TAU, rgba } from './utils.js';

export class Starfield {
  constructor(width, height) {
    this.resize(width, height);
  }

  resize(width, height) {
    this.w = width;
    this.h = height;
    const density = Math.round((width * height) / 5200);
    this.layers = [
      this._make(Math.round(density * 0.5), 18, 0.6, 1.4, '#5a6b8a'),
      this._make(Math.round(density * 0.35), 42, 1.0, 2.0, '#9fb4d8'),
      this._make(Math.round(density * 0.15), 80, 1.4, 2.8, '#ffffff'),
    ];
    this.nebulae = Array.from({ length: 4 }, () => ({
      x: rand(0, width),
      y: rand(0, height),
      r: rand(140, 320),
      speed: rand(6, 16),
      color: Math.random() < 0.5 ? '#1f3d8a' : '#3a1f7a',
      alpha: rand(0.04, 0.1),
    }));
  }

  _make(count, speed, sizeMin, sizeMax, color) {
    const stars = [];
    for (let i = 0; i < count; i++) {
      stars.push({
        x: rand(0, this.w),
        y: rand(0, this.h),
        size: rand(sizeMin, sizeMax),
        twinkle: rand(0, TAU),
      });
    }
    return { stars, speed, color };
  }

  update(dt, speedMul = 1) {
    for (const neb of this.nebulae) {
      neb.y += neb.speed * speedMul * dt;
      if (neb.y - neb.r > this.h) {
        neb.y = -neb.r;
        neb.x = rand(0, this.w);
      }
    }
    for (const layer of this.layers) {
      for (const s of layer.stars) {
        s.y += layer.speed * speedMul * dt;
        s.twinkle += dt * 4;
        if (s.y > this.h) { s.y = 0; s.x = rand(0, this.w); }
      }
    }
  }

  render(ctx, quality) {
    // Nebulae (soft radial glows).
    if (quality) {
      for (const neb of this.nebulae) {
        const g = ctx.createRadialGradient(neb.x, neb.y, 0, neb.x, neb.y, neb.r);
        g.addColorStop(0, rgba(neb.color, neb.alpha));
        g.addColorStop(1, rgba(neb.color, 0));
        ctx.fillStyle = g;
        ctx.fillRect(neb.x - neb.r, neb.y - neb.r, neb.r * 2, neb.r * 2);
      }
    }
    // Stars.
    for (const layer of this.layers) {
      ctx.fillStyle = layer.color;
      for (const s of layer.stars) {
        const a = 0.55 + Math.sin(s.twinkle) * 0.35;
        ctx.globalAlpha = a;
        ctx.fillRect(s.x, s.y, s.size, s.size);
      }
    }
    ctx.globalAlpha = 1;
  }
}
