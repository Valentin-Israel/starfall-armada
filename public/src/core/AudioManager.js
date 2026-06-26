// Procedural audio engine: all SFX and music synthesised at runtime via the
// Web Audio API — zero external files, instant load, tiny footprint.

export class AudioManager {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.master = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.unlocked = false;
    this._noiseBuffer = null;
    this._musicTimer = null;
    this._step = 0;
  }

  // Must be called from a user gesture (tap/click/keydown) to satisfy autoplay rules.
  unlock() {
    if (this.unlocked) {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.55;
    this.sfxGain.connect(this.master);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.0;
    this.musicGain.connect(this.master);

    // Pre-build a reusable white-noise buffer for explosions / thrust.
    const len = this.ctx.sampleRate * 1.0;
    this._noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this._noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.unlocked = true;
  }

  get t() { return this.ctx ? this.ctx.currentTime : 0; }

  _canSfx() { return this.unlocked && this.settings.sound; }

  _tone(freq, dur, type = 'sine', gain = 0.5, slideTo = null, dest = null) {
    if (!this._canSfx()) return;
    const t = this.t;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env).connect(dest || this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  _noise(dur, gain = 0.5, filterFreq = 1200, sweep = true) {
    if (!this._canSfx()) return;
    const t = this.t;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreq, t);
    if (sweep) filter.frequency.exponentialRampToValueAtTime(Math.max(80, filterFreq * 0.15), t + dur);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(env).connect(this.sfxGain);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  // ---- Game SFX ----
  shoot()      { this._tone(880, 0.12, 'square', 0.18, 280); }
  shootHeavy() { this._tone(420, 0.16, 'sawtooth', 0.22, 120); }
  enemyShoot() { this._tone(300, 0.14, 'sawtooth', 0.10, 140); }
  hit()        { this._tone(180, 0.06, 'square', 0.14, 90); }
  explosion()  { this._noise(0.45, 0.5, 1600); this._tone(120, 0.4, 'sawtooth', 0.18, 40); }
  bigExplosion() { this._noise(0.9, 0.7, 2200); this._tone(80, 0.8, 'sawtooth', 0.3, 30); }
  powerup()    { this._tone(523, 0.1, 'sine', 0.3, 784); setTimeout(() => this._tone(1046, 0.16, 'sine', 0.3), 90); }
  shield()     { this._tone(440, 0.3, 'sine', 0.25, 880); }
  bomb()       { this._noise(1.1, 0.85, 3000); this._tone(60, 1.0, 'sawtooth', 0.4, 24); }
  playerHit()  { this._noise(0.5, 0.6, 900); this._tone(160, 0.4, 'square', 0.3, 60); }
  uiClick()    { this._tone(660, 0.05, 'square', 0.12, 880); }
  waveStart()  { this._tone(330, 0.18, 'triangle', 0.25, 660); setTimeout(() => this._tone(660, 0.2, 'triangle', 0.25, 990), 120); }
  bossWarn()   { this._tone(110, 0.6, 'sawtooth', 0.35, 220); }

  // ---- Music: a looping minor-key arpeggio bassline ----
  startMusic() {
    if (!this.unlocked || !this.settings.music || this._musicTimer) return;
    this.musicGain.gain.cancelScheduledValues(this.t);
    this.musicGain.gain.linearRampToValueAtTime(0.22, this.t + 1.2);
    // A minor-ish space drone progression (semitone offsets from A2 = 110Hz).
    const bass = [0, 0, 7, 5, 3, 3, 10, 8];
    const arp = [0, 12, 15, 19, 24, 19, 15, 12];
    const bpm = 96;
    const stepDur = (60 / bpm) / 2; // eighth notes
    const f = (semi) => 110 * Math.pow(2, semi / 12);
    const tick = () => {
      if (!this.settings.music || !this.unlocked) return;
      const i = this._step % 8;
      const t = this.t;
      // Bass
      this._scheduleNote(f(bass[i] - 12), t, stepDur * 1.4, 'triangle', 0.16, this.musicGain);
      // Arp lead (skip some for groove)
      if (i % 2 === 0 || i === 3) this._scheduleNote(f(arp[i]), t, stepDur * 0.8, 'square', 0.05, this.musicGain);
      // Soft kick on the 1 and 5
      if (i === 0 || i === 4) this._kick(t);
      this._step++;
    };
    tick();
    this._musicTimer = setInterval(tick, stepDur * 1000);
  }

  _scheduleNote(freq, t, dur, type, gain, dest) {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env).connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  _kick(t) {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    env.gain.setValueAtTime(0.5, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(env).connect(this.musicGain);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  stopMusic() {
    if (this._musicTimer) { clearInterval(this._musicTimer); this._musicTimer = null; }
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.cancelScheduledValues(this.t);
      this.musicGain.gain.linearRampToValueAtTime(0.0, this.t + 0.4);
    }
  }

  applySettings() {
    if (!this.unlocked) return;
    if (!this.settings.music) this.stopMusic();
  }
}
