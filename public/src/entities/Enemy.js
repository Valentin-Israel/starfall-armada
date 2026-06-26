// Enemy fleet. Several archetypes share one class, differentiated by `type`:
//   drone    — drifts down in sine waves, no fire
//   fighter  — zig-zags and fires aimed shots
//   tank      — slow, heavy HP, fires spreads
//   kamikaze  — dives straight at the player

import { TAU, rand, angleTo, clamp } from '../core/utils.js';

const DEFS = {
  drone:    { hp: 2,  radius: 13, color: '#6c5cff', score: 50,  speed: 90,  fire: 0 },
  fighter:  { hp: 3,  radius: 15, color: '#1fd9ff', score: 100, speed: 120, fire: 1.7 },
  tank:     { hp: 10, radius: 24, color: '#ff7b3b', score: 250, speed: 55,  fire: 2.2 },
  kamikaze: { hp: 2,  radius: 14, color: '#ff3b5c', score: 150, speed: 230, fire: 0 },
};

export class Enemy {
  constructor() { this.active = false; }

  spawn(type, x, y, wave) {
    const d = DEFS[type];
    this.type = type;
    this.active = true;
    this.x = x; this.y = y;
    this.baseX = x;
    this.radius = d.radius;
    this.color = d.color;
    this.score = d.score;
    this.maxHp = d.hp + Math.floor(wave / 3);
    this.hp = this.maxHp;
    this.speed = d.speed * (1 + wave * 0.02);
    this.fireInterval = d.fire;
    this.fireTimer = rand(0.6, d.fire || 2);
    this.t = rand(0, TAU);
    this.amp = rand(40, 110);
    this.freq = rand(1.2, 2.4);
    this.hitFlash = 0;
    this.dead = false;
    this.diveAngle = null;
    return this;
  }

  update(dt, game) {
    this.t += dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    const player = game.player;

    switch (this.type) {
      case 'drone':
        this.y += this.speed * dt;
        this.x = this.baseX + Math.sin(this.t * this.freq) * this.amp;
        break;
      case 'fighter':
        this.y += this.speed * 0.6 * dt;
        this.x = this.baseX + Math.sin(this.t * this.freq) * this.amp;
        break;
      case 'tank':
        this.y += this.speed * dt;
        this.x = this.baseX + Math.sin(this.t * 0.8) * 30;
        break;
      case 'kamikaze':
        if (this.diveAngle === null) {
          // Lock onto the player once we're on screen.
          if (this.y > 40) this.diveAngle = angleTo(this.x, this.y, player.x, player.y);
          else this.y += this.speed * 0.5 * dt;
        } else {
          this.x += Math.cos(this.diveAngle) * this.speed * dt;
          this.y += Math.sin(this.diveAngle) * this.speed * dt;
        }
        break;
    }

    // Firing.
    if (this.fireInterval > 0 && this.y > 0) {
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) {
        this.fireTimer = this.fireInterval;
        this._fire(game);
      }
    }

    // Despawn well below the screen.
    if (this.y > game.renderer.height + 60 || this.x < -80 || this.x > game.renderer.width + 80) {
      this.active = false;
    }
  }

  _fire(game) {
    const player = game.player;
    const sp = 280;
    if (this.type === 'tank') {
      for (const off of [-0.3, 0, 0.3]) {
        const a = angleTo(this.x, this.y, player.x, player.y) + off;
        game.enemyBullets.spawn(this.x, this.y, Math.cos(a) * sp, Math.sin(a) * sp, {
          radius: 5, color: '#ff7b3b', friendly: false, kind: 'ball', life: 4,
        });
      }
    } else {
      const a = angleTo(this.x, this.y, player.x, player.y);
      game.enemyBullets.spawn(this.x, this.y, Math.cos(a) * sp, Math.sin(a) * sp, {
        radius: 4, color: '#ff5c7a', friendly: false, kind: 'ball', life: 4,
      });
    }
    game.audio.enemyShoot();
  }

  damage(amount, game) {
    this.hp -= amount;
    this.hitFlash = 0.08;
    game.particles.spark(this.x, this.y, '#ffffff');
    if (this.hp <= 0) {
      this.active = false;
      this.dead = true;
      return true;
    }
    game.audio.hit();
    return false;
  }

  render(ctx, quality) {
    ctx.save();
    ctx.translate(this.x, this.y);
    if (quality) { ctx.shadowBlur = 14; ctx.shadowColor = this.color; }
    const c = this.hitFlash > 0 ? '#ffffff' : this.color;

    if (this.type === 'tank') {
      // Hexagonal heavy.
      ctx.rotate(this.t * 0.4);
      ctx.fillStyle = c;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        const r = this.radius;
        i === 0 ? ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#02030a';
      ctx.beginPath(); ctx.arc(0, 0, this.radius * 0.45, 0, TAU); ctx.fill();
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(0, 0, this.radius * 0.22, 0, TAU); ctx.fill();
    } else if (this.type === 'kamikaze') {
      // Downward dart.
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(0, this.radius);
      ctx.lineTo(this.radius * 0.8, -this.radius * 0.8);
      ctx.lineTo(0, -this.radius * 0.3);
      ctx.lineTo(-this.radius * 0.8, -this.radius * 0.8);
      ctx.closePath();
      ctx.fill();
    } else {
      // Drone / fighter: inverted wing.
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(0, this.radius);
      ctx.lineTo(this.radius, -this.radius * 0.6);
      ctx.lineTo(this.radius * 0.4, -this.radius * 0.2);
      ctx.lineTo(0, -this.radius * 0.5);
      ctx.lineTo(-this.radius * 0.4, -this.radius * 0.2);
      ctx.lineTo(-this.radius, -this.radius * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#02030a';
      ctx.beginPath(); ctx.arc(0, -this.radius * 0.1, this.radius * 0.3, 0, TAU); ctx.fill();
    }

    // HP pip for tougher enemies.
    if (quality && this.maxHp > 3 && this.hp < this.maxHp) {
      ctx.shadowBlur = 0;
      ctx.rotate(-this.t * 0.4);
      const w = this.radius * 1.6;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(-w / 2, -this.radius - 9, w, 4);
      ctx.fillStyle = '#ff3b5c';
      ctx.fillRect(-w / 2, -this.radius - 9, w * (this.hp / this.maxHp), 4);
    }
    ctx.restore();
  }
}
