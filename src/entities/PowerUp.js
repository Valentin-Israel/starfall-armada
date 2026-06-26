// Collectable power-ups that drift downward. Types:
//   weapon  — upgrade gun tier
//   rapid   — temporary rapid fire
//   shield  — restore/charge shield
//   bomb    — +1 screen-clear bomb
//   life    — +1 life (rare)

import { TAU } from '../core/utils.js';

const TYPES = {
  weapon: { color: '#1fd9ff', glyph: '⏶', label: 'W' },
  rapid:  { color: '#6c5cff', glyph: '⚡', label: 'R' },
  shield: { color: '#2bd6a0', glyph: '🛡', label: 'S' },
  bomb:   { color: '#ffcf3b', glyph: '✦', label: 'B' },
  life:   { color: '#ff3b5c', glyph: '♥', label: '+' },
};

export class PowerUp {
  constructor() { this.active = false; }

  spawn(type, x, y) {
    this.type = type;
    this.active = true;
    this.x = x; this.y = y;
    this.vy = 70;
    this.vx = 0;
    this.radius = 14;
    this.t = Math.random() * TAU;
    this.def = TYPES[type];
    return this;
  }

  update(dt, game) {
    this.t += dt;
    this.y += this.vy * dt;
    this.x += Math.sin(this.t * 2) * 18 * dt;
    if (this.y > game.renderer.height + 30) this.active = false;
  }

  render(ctx, quality) {
    const { color, label } = this.def;
    const bob = Math.sin(this.t * 3) * 2;
    ctx.save();
    ctx.translate(this.x, this.y + bob);
    if (quality) { ctx.shadowBlur = 16; ctx.shadowColor = color; }

    // Rotating diamond capsule.
    ctx.rotate(this.t);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.92;
    ctx.beginPath();
    ctx.moveTo(0, -this.radius);
    ctx.lineTo(this.radius, 0);
    ctx.lineTo(0, this.radius);
    ctx.lineTo(-this.radius, 0);
    ctx.closePath();
    ctx.fill();

    ctx.rotate(-this.t);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#02030a';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 1);
    ctx.restore();
  }
}
