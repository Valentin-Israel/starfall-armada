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
    const flash = this.hitFlash > 0;
    const c = flash ? '#ffffff' : this.color;
    const r = this.radius;

    if (this.type === 'tank') {
      // ---- TANK: rotating armoured space fortress ----
      ctx.save();
      ctx.rotate(this.t * 0.4);

      // Outer hex hull with glow
      if (quality) { ctx.shadowBlur = 18; ctx.shadowColor = this.color; }
      ctx.fillStyle = c;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        i === 0 ? ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r)
                : ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();

      // Armour panel lines (radial struts to hex vertices)
      ctx.shadowBlur = 0;
      ctx.strokeStyle = flash ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        ctx.moveTo(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42);
        ctx.lineTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95);
      }
      ctx.stroke();

      // Inner ring track
      ctx.strokeStyle = flash ? 'rgba(255,200,100,0.5)' : this.color + '66';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, TAU); ctx.stroke();

      // Dark core cavity
      ctx.fillStyle = flash ? '#331100' : '#02030a';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.43, 0, TAU); ctx.fill();

      // Weapon barrel (points toward player, i.e. +y — pointing down)
      ctx.fillStyle = flash ? '#ffffff' : '#cc5500';
      ctx.fillRect(-r * 0.1, r * 0.2, r * 0.2, r * 0.28);
      ctx.fillStyle = flash ? '#ffffff' : '#884400';
      ctx.fillRect(-r * 0.07, r * 0.42, r * 0.14, r * 0.1);

      // Glowing energy core
      if (quality) { ctx.shadowBlur = 16; ctx.shadowColor = this.color; }
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff8ee';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.1, 0, TAU); ctx.fill();

      ctx.restore(); // undo rotation — HP bar drawn in axis-aligned space below

    } else if (this.type === 'kamikaze') {
      // ---- KAMIKAZE: suicide lance, nose pointing down toward player ----
      if (quality) { ctx.shadowBlur = 14; ctx.shadowColor = '#ff3b5c'; }

      // Body gradient (center-bright)
      if (!flash) {
        const g = ctx.createLinearGradient(-r * 0.5, 0, r * 0.5, 0);
        g.addColorStop(0, '#550011'); g.addColorStop(0.5, c); g.addColorStop(1, '#550011');
        ctx.fillStyle = g;
      } else { ctx.fillStyle = '#ffffff'; }
      ctx.beginPath();
      ctx.moveTo(0, r);              // nose → player
      ctx.lineTo(r * 0.5, r * 0.05);
      ctx.lineTo(r * 0.28, -r * 0.72);
      ctx.lineTo(0, -r * 0.38);
      ctx.lineTo(-r * 0.28, -r * 0.72);
      ctx.lineTo(-r * 0.5, r * 0.05);
      ctx.closePath();
      ctx.fill();

      // Swept rear fins
      ctx.shadowBlur = 0;
      ctx.fillStyle = flash ? '#ffffff' : '#cc2244';
      ctx.beginPath(); // left fin
      ctx.moveTo(-r * 0.14, -r * 0.48);
      ctx.lineTo(-r * 0.82, -r * 1.02);
      ctx.lineTo(-r * 0.58, -r * 0.58);
      ctx.closePath(); ctx.fill();
      ctx.beginPath(); // right fin
      ctx.moveTo(r * 0.14, -r * 0.48);
      ctx.lineTo(r * 0.82, -r * 1.02);
      ctx.lineTo(r * 0.58, -r * 0.58);
      ctx.closePath(); ctx.fill();

      // Glowing core (warhead)
      if (quality) { ctx.shadowBlur = 14; ctx.shadowColor = '#ff6666'; }
      ctx.fillStyle = flash ? '#ffffff' : '#ff8888';
      ctx.beginPath(); ctx.arc(0, r * 0.14, r * 0.22, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffdddd';
      ctx.beginPath(); ctx.arc(0, r * 0.14, r * 0.1, 0, TAU); ctx.fill();

    } else if (this.type === 'fighter') {
      // ---- FIGHTER: stealth delta interceptor, nose pointing down ----
      if (quality) { ctx.shadowBlur = 12; ctx.shadowColor = this.color; }

      // Hull gradient (brighter at nose)
      if (!flash) {
        const g = ctx.createLinearGradient(0, r, 0, -r * 0.8);
        g.addColorStop(0, '#062830'); g.addColorStop(0.4, c); g.addColorStop(1, '#0c5060');
        ctx.fillStyle = g;
      } else { ctx.fillStyle = '#ffffff'; }
      ctx.beginPath();
      ctx.moveTo(0, r);               // nose → player
      ctx.lineTo(r * 0.98, -r * 0.38);
      ctx.lineTo(r * 0.5, -r * 0.25);
      ctx.lineTo(r * 0.26, -r * 0.82);
      ctx.lineTo(0, -r * 0.62);
      ctx.lineTo(-r * 0.26, -r * 0.82);
      ctx.lineTo(-r * 0.5, -r * 0.25);
      ctx.lineTo(-r * 0.98, -r * 0.38);
      ctx.closePath();
      ctx.fill();

      // Centre spine panel
      ctx.shadowBlur = 0;
      ctx.strokeStyle = flash ? 'rgba(255,255,255,0.4)' : 'rgba(31,217,255,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, r * 0.75); ctx.lineTo(0, -r * 0.55); ctx.stroke();

      // Cockpit sensor (elongated glow)
      if (quality) { ctx.shadowBlur = 10; ctx.shadowColor = '#1fd9ff'; }
      ctx.fillStyle = flash ? '#ffffff' : 'rgba(31,217,255,0.9)';
      ctx.beginPath();
      ctx.ellipse(0, r * 0.18, r * 0.12, r * 0.28, 0, 0, TAU);
      ctx.fill();

      // Twin engine pods (at rear / top)
      ctx.shadowBlur = 0;
      ctx.fillStyle = flash ? '#ffffff' : '#0a4a5a';
      ctx.beginPath(); ctx.ellipse(-r * 0.3, -r * 0.64, r * 0.15, r * 0.24, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(r * 0.3, -r * 0.64, r * 0.15, r * 0.24, 0, 0, TAU); ctx.fill();

      // Engine nozzle glow
      if (quality) { ctx.shadowBlur = 9; ctx.shadowColor = '#1fd9ff'; }
      ctx.fillStyle = flash ? '#ffffff' : '#1fd9ff';
      ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.78, r * 0.08, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(r * 0.3, -r * 0.78, r * 0.08, 0, TAU); ctx.fill();

    } else {
      // ---- DRONE: alien saucer scout ----
      if (quality) { ctx.shadowBlur = 12; ctx.shadowColor = this.color; }

      // Main disc hull (ellipse — wide and flat)
      if (!flash) {
        const g = ctx.createLinearGradient(0, -r * 0.5, 0, r * 0.5);
        g.addColorStop(0, '#1a1060'); g.addColorStop(0.5, c); g.addColorStop(1, '#1a1060');
        ctx.fillStyle = g;
      } else { ctx.fillStyle = '#ffffff'; }
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.46, 0, 0, TAU);
      ctx.fill();

      // Swept delta wings (extend beyond disc)
      ctx.shadowBlur = 0;
      ctx.fillStyle = flash ? '#ffffff' : '#3520aa';
      ctx.beginPath(); // left wing
      ctx.moveTo(-r * 0.42, -r * 0.06);
      ctx.lineTo(-r * 1.08, -r * 0.44);
      ctx.lineTo(-r * 0.9, r * 0.18);
      ctx.lineTo(-r * 0.28, r * 0.18);
      ctx.closePath(); ctx.fill();
      ctx.beginPath(); // right wing
      ctx.moveTo(r * 0.42, -r * 0.06);
      ctx.lineTo(r * 1.08, -r * 0.44);
      ctx.lineTo(r * 0.9, r * 0.18);
      ctx.lineTo(r * 0.28, r * 0.18);
      ctx.closePath(); ctx.fill();

      // Undercarriage rim detail
      ctx.strokeStyle = flash ? 'rgba(255,255,255,0.35)' : this.color + '55';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.78, r * 0.36, 0, 0, TAU); ctx.stroke();

      // Sensor dome (dark housing)
      ctx.fillStyle = flash ? '#aaaaaa' : '#02030a';
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.04, r * 0.34, r * 0.24, 0, 0, TAU);
      ctx.fill();

      // Glowing central eye
      if (quality) { ctx.shadowBlur = 12; ctx.shadowColor = this.color; }
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(0, -r * 0.04, r * 0.15, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(-r * 0.04, -r * 0.07, r * 0.055, 0, TAU); ctx.fill(); // lens glint
    }

    // HP pip for tougher enemies (always in non-rotated space).
    if (quality && this.maxHp > 3 && this.hp < this.maxHp) {
      ctx.shadowBlur = 0;
      const w = r * 1.6;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(-w / 2, -r - 9, w, 4);
      ctx.fillStyle = '#ff3b5c';
      ctx.fillRect(-w / 2, -r - 9, w * (this.hp / this.maxHp), 4);
    }
    ctx.restore();
  }
}
