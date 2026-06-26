// Multi-layer parallax starfield with drifting nebula clouds for depth.

import { rand, TAU, rgba } from './utils.js';

export class Starfield {
  constructor(width, height) {
    this.resize(width, height);
  }

  resize(width, height) {
    this.w = width;
    this.h = height;
    const density = Math.round((width * height) / 4800);
    this.layers = [
      this._make(Math.round(density * 0.55), 18, 0.5, 1.1, '#4a5e7a'),
      this._make(Math.round(density * 0.30), 44, 0.9, 1.8, '#8aaad0'),
      this._make(Math.round(density * 0.15), 82, 1.2, 2.6, '#d8e8ff'),
    ];
    const nebColors = ['#1f3d8a', '#3a1f7a', '#0f3a6a', '#2a1058', '#0a3838', '#3a0f50'];
    this.nebulae = Array.from({ length: 7 }, (_, i) => ({
      x: rand(0, width),
      y: rand(-height * 0.3, height * 1.2),
      r: rand(110, 400),
      speed: rand(5, 20),
      color: nebColors[i % nebColors.length],
      alpha: rand(0.07, 0.18),
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
        bright: Math.random() < 0.06,  // ~6 % are prominent white stars
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
    // Deep-space backdrop gradient (dark blue fade from top).
    const bg = ctx.createLinearGradient(0, 0, 0, this.h);
    bg.addColorStop(0,   'rgba(8,14,42,0.96)');
    bg.addColorStop(0.45,'rgba(3,5,14,0.96)');
    bg.addColorStop(1,   'rgba(2,3,10,0.96)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.w, this.h);

    // Nebulae — circular radial glows with soft falloff.
    if (quality) {
      for (const neb of this.nebulae) {
        const g = ctx.createRadialGradient(neb.x, neb.y, 0, neb.x, neb.y, neb.r);
        g.addColorStop(0,   rgba(neb.color, neb.alpha));
        g.addColorStop(0.45,rgba(neb.color, neb.alpha * 0.35));
        g.addColorStop(1,   rgba(neb.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(neb.x, neb.y, neb.r, 0, TAU);
        ctx.fill();
      }
    }

    // Stars — rendered as small circles with per-star twinkle.
    for (const layer of this.layers) {
      for (const s of layer.stars) {
        const alpha = 0.48 + Math.sin(s.twinkle) * 0.38;
        ctx.globalAlpha = alpha;
        const rad = s.size * 0.5;
        if (s.bright) {
          // Prominent white star with a soft halo.
          if (quality) { ctx.shadowBlur = 5; ctx.shadowColor = '#ffffff'; }
          ctx.fillStyle = '#e8f4ff';
          ctx.beginPath(); ctx.arc(s.x, s.y, rad * 1.5, 0, TAU); ctx.fill();
          ctx.shadowBlur = 0;
        } else {
          ctx.fillStyle = layer.color;
          ctx.beginPath(); ctx.arc(s.x, s.y, rad, 0, TAU); ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }
}
