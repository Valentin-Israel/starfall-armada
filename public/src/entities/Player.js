// The player's ship: smooth movement with banking, tiered weapons, an energy
// shield ability, invulnerability frames and a vector-drawn hull.

import { clamp, lerp, TAU, approach, rgba } from '../core/utils.js';

// Cosmetic ship skins (purchasable). hull = [top, mid, bottom] gradient stops.
export const SKINS = {
  default: { hull: ['#eafcff', '#7fd6ee', '#1b6f8c'], wing: '#000066', cockpit: '#bfeaff', glow: '#1fd9ff' },
  nebula:  { hull: ['#fbe9ff', '#c79bff', '#5b2ea8'], wing: '#2a0a5e', cockpit: '#e9ccff', glow: '#b06cff' },
  inferno: { hull: ['#fff0e0', '#ffb066', '#9c3a12'], wing: '#5e1300', cockpit: '#ffd9b0', glow: '#ff7b3b' },
  void:    { hull: ['#dfe6ff', '#8a93c8', '#22264a'], wing: '#05060f', cockpit: '#aab4ff', glow: '#6c5cff' },
};

export class Player {
  constructor(game) {
    this.game = game;
    this.radius = 13;
    this.skin = 'default';
    this.reset();
  }

  reset(ship = null) {
    const { width, height } = this.game.renderer;
    this.x = width / 2;
    this.y = height - 120;
    this.vx = 0;
    this.vy = 0;
    this.speed        = ship ? ship.speed        : 560;
    this.accel        = ship ? ship.accel        : 9;
    this.bank = 0;
    this.fireCooldown = 0;
    this.fireRate     = ship ? ship.fireRate     : 0.16;
    this.weaponLevel  = ship ? ship.weaponLevel  : 1;
    this.rapidTimer = 0;
    this.invuln = 1.2;
    this.shieldActive = false;
    this.shieldTimer = 0;
    this.shieldCooldown = 0;
    this.shieldMax    = ship ? ship.shieldMax    : 2.2;
    this.shieldCdMax  = ship ? ship.shieldCdMax  : 7;
    this.thrustPhase = 0;
    this.alive = true;
    if (ship) this.skin = ship.skin;
  }

  get hasShield() { return this.shieldActive && this.shieldTimer > 0; }

  activateShield() {
    if (this.shieldCooldown > 0 || this.shieldActive) return false;
    this.shieldActive = true;
    this.shieldTimer = this.shieldMax;
    this.game.audio.shield();
    return true;
  }

  // Power-up: bump the weapon tier (capped) and apply temporary rapid fire.
  upgradeWeapon() {
    this.weaponLevel = clamp(this.weaponLevel + 1, 1, 5);
  }
  grantRapid(sec = 6) { this.rapidTimer = Math.max(this.rapidTimer, sec); }
  grantShieldCharge() { this.shieldCooldown = 0; this.shieldTimer = Math.min(this.shieldMax, this.shieldTimer + 0.6); }

  update(dt, input) {
    const { width, height } = this.game.renderer;

    // --- Movement ---
    if (input.usePointerAim && input.pointer.active) {
      // Drag-to-fly: ease toward the pointer target.
      const tx = clamp(input.pointer.targetX, this.radius, width - this.radius);
      const ty = clamp(input.pointer.targetY, this.radius, height - this.radius);
      this.x = lerp(this.x, tx, clamp(dt * 14, 0, 1));
      this.y = lerp(this.y, ty, clamp(dt * 14, 0, 1));
      this.vx = (tx - this.x);
    } else {
      const targetVx = input.move.x * this.speed;
      const targetVy = input.move.y * this.speed;
      this.vx = lerp(this.vx, targetVx, clamp(dt * this.accel, 0, 1));
      this.vy = lerp(this.vy, targetVy, clamp(dt * this.accel, 0, 1));
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    }
    this.x = clamp(this.x, this.radius, width - this.radius);
    this.y = clamp(this.y, this.radius, height - this.radius);

    // Banking from horizontal velocity.
    this.bank = approach(this.bank, clamp(this.vx / this.speed, -1, 1), dt * 6);

    // --- Timers ---
    if (this.invuln > 0) this.invuln -= dt;
    if (this.rapidTimer > 0) this.rapidTimer -= dt;
    if (this.shieldActive) {
      this.shieldTimer -= dt;
      if (this.shieldTimer <= 0) { this.shieldActive = false; this.shieldCooldown = this.shieldCdMax; }
    } else if (this.shieldCooldown > 0) {
      this.shieldCooldown -= dt;
    }

    // --- Firing (auto-fire) ---
    this.fireCooldown -= dt;
    const rate = this.rapidTimer > 0 ? this.fireRate * 0.5 : this.fireRate;
    if (this.fireCooldown <= 0) {
      this.fireCooldown = rate;
      this._fire();
    }

    // --- Thruster trail ---
    this.thrustPhase += dt;
    if (this.game.settings.quality) {
      this.game.particles.thruster(this.x - 5, this.y + this.radius + 2, 1);
      this.game.particles.thruster(this.x + 5, this.y + this.radius + 2, 1);
    }
  }

  _fire() {
    const g = this.game;
    const y = this.y - this.radius - 2;
    const sp = 820;
    const dmg = 1;
    const shots = [];
    switch (this.weaponLevel) {
      case 1:
        shots.push([0, 0]);
        break;
      case 2:
        shots.push([-7, 0], [7, 0]);
        break;
      case 3:
        shots.push([0, 0], [-10, -0.12], [10, 0.12]);
        break;
      case 4:
        shots.push([-7, 0], [7, 0], [-14, -0.2], [14, 0.2]);
        break;
      default:
        shots.push([0, 0], [-9, -0.12], [9, 0.12], [-18, -0.28], [18, 0.28]);
    }
    for (const [ox, spread] of shots) {
      const vx = Math.sin(spread) * sp;
      const vy = -Math.cos(spread) * sp;
      g.playerBullets.spawn(this.x + ox, y, vx, vy, {
        radius: 3.6, damage: dmg, color: '#1fd9ff', friendly: true, life: 1.6,
      });
    }
    g.audio.shoot();
  }

  hit() {
    // Returns true if the hit was absorbed (shield / invuln).
    if (this.hasShield) {
      this.game.particles.spark(this.x, this.y, '#1fd9ff');
      return true;
    }
    if (this.invuln > 0) return true;
    return false; // caller handles death/life loss
  }

  render(ctx, quality) {
    const { x, y, bank } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(bank * 0.35);

    const sk = SKINS[this.skin] || SKINS.default;

    // Blink while invulnerable.
    if (this.invuln > 0 && Math.floor(this.invuln * 12) % 2 === 0) ctx.globalAlpha = 0.4;

    // Engine glow
    if (quality) {
      const flick = 0.7 + Math.sin(this.thrustPhase * 40) * 0.3;
      const g = ctx.createLinearGradient(0, 10, 0, 30 + flick * 14);
      g.addColorStop(0, rgba(sk.glow, 0.9));
      g.addColorStop(1, 'rgba(108,92,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-6, 10); ctx.lineTo(6, 10); ctx.lineTo(0, 30 + flick * 14); ctx.closePath();
      ctx.fill();
    }

    // Hull
    ctx.shadowBlur = quality ? 16 : 0;
    ctx.shadowColor = sk.glow;
    const hull = ctx.createLinearGradient(0, -18, 0, 16);
    hull.addColorStop(0, sk.hull[0]);
    hull.addColorStop(0.5, sk.hull[1]);
    hull.addColorStop(1, sk.hull[2]);
    ctx.fillStyle = hull;
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(11, 8);
    ctx.lineTo(6, 14);
    ctx.lineTo(0, 10);
    ctx.lineTo(-6, 14);
    ctx.lineTo(-11, 8);
    ctx.closePath();
    ctx.fill();

    // Wing accents
    ctx.shadowBlur = 0;
    ctx.fillStyle = sk.wing;
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(7, 8); ctx.lineTo(0, 6); ctx.lineTo(-7, 8); ctx.closePath();
    ctx.fill();

    // Cockpit
    ctx.fillStyle = sk.cockpit;
    ctx.beginPath();
    ctx.ellipse(0, -4, 2.6, 5, 0, 0, TAU);
    ctx.fill();

    ctx.restore();

    // Shield bubble
    if (this.hasShield) {
      const pulse = 0.6 + Math.sin(this.thrustPhase * 10) * 0.15;
      ctx.save();
      ctx.globalAlpha = clamp(this.shieldTimer / this.shieldMax + 0.2, 0.2, 0.8) * pulse;
      ctx.strokeStyle = '#1fd9ff';
      ctx.lineWidth = 2.5;
      if (quality) { ctx.shadowBlur = 18; ctx.shadowColor = '#1fd9ff'; }
      ctx.beginPath();
      ctx.arc(x, y, this.radius + 12, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }
}
