// Unified input: keyboard, mouse/pointer drag, and a mobile virtual joystick.
// Exposes a normalised movement vector (-1..1) plus action flags.

import { clamp } from './utils.js';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.move = { x: 0, y: 0 };     // analog movement intent
    this.pointer = { active: false, x: 0, y: 0, targetX: 0, targetY: 0 };
    this.usePointerAim = false;     // true while dragging on screen / mouse held
    this.actions = { shield: false, bomb: false, pause: false };
    this._bombEdge = false;
    this._pauseEdge = false;
    this._shieldEdge = false;
    this.stick = { active: false, x: 0, y: 0 };
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

    this._bindKeyboard();
    this._bindPointer();
  }

  _bindKeyboard() {
    addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      this.keys.add(k);
      if (k === ' ') this._bombEdge = true;
      if (k === 'p' || k === 'escape') this._pauseEdge = true;
      if (k === 'shift') this._shieldEdge = true;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    // Drop keys when the tab loses focus so the ship doesn't drift.
    addEventListener('blur', () => this.keys.clear());
  }

  _bindPointer() {
    const toLocal = (e) => {
      const r = this.canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    // Pointer drag aims the ship directly (great for mouse + touch on the play field).
    this.canvas.addEventListener('pointerdown', (e) => {
      const p = toLocal(e);
      this.pointer.active = true;
      this.usePointerAim = true;
      this.pointer.targetX = p.x;
      this.pointer.targetY = p.y;
    });
    addEventListener('pointermove', (e) => {
      if (!this.pointer.active) return;
      const p = toLocal(e);
      this.pointer.targetX = p.x;
      this.pointer.targetY = p.y;
    });
    addEventListener('pointerup', () => { this.pointer.active = false; });
    addEventListener('pointercancel', () => { this.pointer.active = false; });
  }

  // Wire up the on-screen virtual joystick (mobile).
  bindVirtualStick(stickEl, knobEl) {
    const radius = 48;
    let id = null;
    const center = { x: 0, y: 0 };
    const set = (dx, dy) => {
      const len = Math.hypot(dx, dy) || 1;
      const cl = Math.min(len, radius);
      const nx = (dx / len) * cl;
      const ny = (dy / len) * cl;
      knobEl.style.transform = `translate(${nx}px, ${ny}px)`;
      this.stick.x = nx / radius;
      this.stick.y = ny / radius;
      this.stick.active = true;
    };
    const reset = () => {
      knobEl.style.transform = 'translate(0,0)';
      this.stick.x = 0; this.stick.y = 0; this.stick.active = false;
      id = null;
    };
    stickEl.addEventListener('pointerdown', (e) => {
      id = e.pointerId;
      const r = stickEl.getBoundingClientRect();
      center.x = r.left + r.width / 2;
      center.y = r.top + r.height / 2;
      set(e.clientX - center.x, e.clientY - center.y);
      // The stick owns aim while in use — disable drag-to-aim.
      this.usePointerAim = false;
      stickEl.setPointerCapture(e.pointerId);
    });
    stickEl.addEventListener('pointermove', (e) => {
      if (id !== e.pointerId) return;
      set(e.clientX - center.x, e.clientY - center.y);
    });
    const end = (e) => { if (id === e.pointerId) reset(); };
    stickEl.addEventListener('pointerup', end);
    stickEl.addEventListener('pointercancel', end);
  }

  bindButton(el, action) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (action === 'bomb') this._bombEdge = true;
      if (action === 'shield') this._shieldEdge = true;
    });
  }

  // Compute the analog movement intent for this frame.
  update() {
    let x = 0, y = 0;
    if (this.keys.has('arrowleft') || this.keys.has('a')) x -= 1;
    if (this.keys.has('arrowright') || this.keys.has('d')) x += 1;
    if (this.keys.has('arrowup') || this.keys.has('w')) y -= 1;
    if (this.keys.has('arrowdown') || this.keys.has('s')) y += 1;
    if (x !== 0 || y !== 0) this.usePointerAim = false;

    if (this.stick.active) {
      x = this.stick.x;
      y = this.stick.y;
      this.usePointerAim = false;
    }
    this.move.x = clamp(x, -1, 1);
    this.move.y = clamp(y, -1, 1);
  }

  // Edge-triggered actions (consumed once per press).
  consumeBomb() { const v = this._bombEdge; this._bombEdge = false; return v; }
  consumePause() { const v = this._pauseEdge; this._pauseEdge = false; return v; }
  consumeShield() { const v = this._shieldEdge; this._shieldEdge = false; return v; }
}
