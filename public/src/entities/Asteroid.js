// Asteroid hazards — drift down, slowly rotate, split into smaller pieces on death.
// Sizes: large → 2× medium → 2× small → gone.

import { TAU, rand } from '../core/utils.js';

const SIZES = {
  large:  { radius: 44, hp: 6, score: 200, speed: 55,  color: '#8d7b6a', splitInto: 'medium' },
  medium: { radius: 26, hp: 3, score: 80,  speed: 90,  color: '#7a6c5c', splitInto: 'small'  },
  small:  { radius: 14, hp: 1, score: 30,  speed: 140, color: '#6b5f52', splitInto: null      },
};

export class Asteroid {
  constructor() {
    this.active = false;
    this._poly = [];
  }

  spawn(size, x, y, vx = 0) {
    const d = SIZES[size];
    this.size = size;
    this.active = true;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = d.speed * (0.8 + Math.random() * 0.4);
    this.radius = d.radius;
    this.hp = d.hp;
    this.maxHp = d.hp;
    this.score = d.score;
    this.color = d.color;
    this.splitInto = d.splitInto;
    this.rot = Math.random() * TAU;
    this.rotSpeed = (Math.random() - 0.5) * 1.6;
    this.hitFlash = 0;
    this._buildPoly();
    return this;
  }

  _buildPoly() {
    const pts = 9 + Math.floor(Math.random() * 4);
    this._poly = [];
    for (let i = 0; i < pts; i++) {
      const a = (i / pts) * TAU;
      const r = this.radius * (0.68 + Math.random() * 0.36);
      this._poly.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  }

  update(dt, game) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rot += this.rotSpeed * dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    const W = game.renderer.width, H = game.renderer.height;
    if (this.y > H + this.radius + 30 || this.x < -this.radius - 80 || this.x > W + this.radius + 80) {
      this.active = false;
    }
  }

  damage(amount, game) {
    this.hp -= amount;
    this.hitFlash = 0.1;
    game.particles.spark(this.x, this.y, '#c8b89a');
    if (this.hp <= 0) {
      this.active = false;
      return true;
    }
    game.audio.hit();
    return false;
  }

  render(ctx, quality) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    if (quality) { ctx.shadowBlur = 8; ctx.shadowColor = 'rgba(160,130,100,0.5)'; }
    ctx.fillStyle = this.hitFlash > 0 ? '#ffffff' : this.color;
    ctx.beginPath();
    for (let i = 0; i < this._poly.length; i++) {
      const [px, py] = this._poly[i];
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    if (quality) {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // HP bar for medium and large.
    if (quality && this.maxHp > 1 && this.hp < this.maxHp) {
      ctx.rotate(-this.rot);
      const w = this.radius * 1.8;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(-w / 2, -this.radius - 9, w, 4);
      ctx.fillStyle = '#c8a96a';
      ctx.fillRect(-w / 2, -this.radius - 9, w * (this.hp / this.maxHp), 4);
    }
    ctx.restore();
  }
}
