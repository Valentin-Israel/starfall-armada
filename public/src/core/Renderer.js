// Canvas setup with devicePixelRatio scaling plus screen-shake and flash effects.

import { clamp } from './utils.js';

export class Renderer {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.settings = settings;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.shake = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.flashAlpha = 0;
    this.flashColor = '#ffffff';
    this.resize();
    addEventListener('resize', () => this.resize());
    // Some mobile browsers fire visualViewport changes instead.
    if (window.visualViewport) visualViewport.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.settings.quality ? 2.5 : 1.25);
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.dpr = dpr;
    this.width = w;
    this.height = h;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
  }

  addShake(amount) {
    if (!this.settings.shake) return;
    this.shake = Math.min(this.shake + amount, 36);
  }

  flash(color = '#ffffff', alpha = 0.6) {
    this.flashColor = color;
    this.flashAlpha = Math.max(this.flashAlpha, alpha);
  }

  beginFrame(dt) {
    const { ctx } = this;
    // Decay shake / flash.
    this.shake *= Math.pow(0.0001, dt);
    if (this.shake < 0.1) this.shake = 0;
    const ang = Math.random() * Math.PI * 2;
    this.shakeX = Math.cos(ang) * this.shake;
    this.shakeY = Math.sin(ang) * this.shake;
    this.flashAlpha = Math.max(0, this.flashAlpha - dt * 2.4);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, this.shakeX * this.dpr, this.shakeY * this.dpr);
    ctx.clearRect(-40, -40, this.width + 80, this.height + 80);
  }

  endFrame() {
    const { ctx } = this;
    if (this.flashAlpha > 0.001) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.globalAlpha = clamp(this.flashAlpha, 0, 1);
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.globalAlpha = 1;
    }
  }
}
