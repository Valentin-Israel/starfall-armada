// DOM-driven UI: screen routing, HUD updates, menus, settings and leaderboard.
// Keeps all DOM concerns out of the game-simulation code.

import { Storage } from '../core/Storage.js';
import { formatScore, clamp } from '../core/utils.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(settings, audio) {
    this.settings = settings;
    this.audio = audio;
    this.handlers = {};   // event name → callback, set by Game
    this.current = null;

    this.el = {
      hud: $('hud'),
      score: $('hud-score-value'),
      wave: $('hud-wave-value'),
      lives: $('hud-lives'),
      combo: $('hud-combo'),
      comboValue: $('hud-combo-value'),
      bossBar: $('boss-bar'),
      bossName: $('boss-bar-name'),
      bossFill: $('boss-bar-fill'),
      shieldCd: $('ability-shield-cd'),
      shieldAbility: $('ability-shield'),
      bombCount: $('ability-bomb-count'),
      bombAbility: $('ability-bomb'),
      touch: $('touch-controls'),
      menuBest: $('menu-best-value'),
    };

    this._bindMenu();
    this._bindModals();
    this._bindSettings();
  }

  on(event, fn) { this.handlers[event] = fn; }
  _emit(event, ...args) { if (this.handlers[event]) this.handlers[event](...args); }

  // ---------- screen routing ----------
  show(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
    if (id) {
      const el = $(id);
      if (el) el.classList.remove('hidden');
    }
    this.current = id;
  }

  showHUD(visible) {
    this.el.hud.classList.toggle('hidden', !visible);
    const showTouch = visible && (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window);
    this.el.touch.classList.toggle('hidden', !showTouch);
  }

  // ---------- boot ----------
  async runBoot() {
    const fill = $('boot-bar-fill');
    return new Promise((resolve) => {
      let p = 0;
      const step = () => {
        p = Math.min(100, p + Math.random() * 26 + 8);
        fill.style.width = p + '%';
        if (p >= 100) { setTimeout(resolve, 220); return; }
        setTimeout(step, 120);
      };
      step();
    });
  }

  // ---------- menu ----------
  _bindMenu() {
    $('btn-play').addEventListener('click', () => { this.audio.uiClick(); this._emit('play'); });
    $('btn-how').addEventListener('click', () => { this.audio.uiClick(); this.show('screen-how'); });
    $('btn-scores').addEventListener('click', () => { this.audio.uiClick(); this.renderScores(); this.show('screen-scores'); });
    $('btn-settings').addEventListener('click', () => { this.audio.uiClick(); this.show('screen-settings'); });
  }

  refreshMenu() {
    this.el.menuBest.textContent = formatScore(Storage.best());
  }

  // ---------- modals ----------
  _bindModals() {
    document.querySelectorAll('[data-close]').forEach((b) =>
      b.addEventListener('click', () => { this.audio.uiClick(); this.show(this._returnTo || 'screen-menu'); }));

    $('btn-pause').addEventListener('click', () => this._emit('pauseToggle'));
    $('btn-resume').addEventListener('click', () => { this.audio.uiClick(); this._emit('resume'); });
    $('btn-restart').addEventListener('click', () => { this.audio.uiClick(); this._emit('restart'); });
    $('btn-quit').addEventListener('click', () => { this.audio.uiClick(); this._emit('quit'); });
    $('btn-again').addEventListener('click', () => { this.audio.uiClick(); this._emit('restart'); });
    $('btn-over-menu').addEventListener('click', () => { this.audio.uiClick(); this._emit('quit'); });
  }

  // ---------- settings ----------
  _bindSettings() {
    const toggles = {
      'set-sound': 'sound',
      'set-music': 'music',
      'set-shake': 'shake',
      'set-quality': 'quality',
    };
    for (const [id, key] of Object.entries(toggles)) {
      const el = $(id);
      el.setAttribute('aria-checked', String(this.settings[key]));
      el.addEventListener('click', () => {
        this.settings[key] = !this.settings[key];
        el.setAttribute('aria-checked', String(this.settings[key]));
        Storage.saveSettings(this.settings);
        this.audio.uiClick();
        this.audio.applySettings();
        this._emit('settingsChanged', key);
      });
    }
    $('set-reset').addEventListener('click', () => {
      Storage.clearScores();
      this.audio.uiClick();
      this.renderScores();
      this.refreshMenu();
    });
  }

  // ---------- leaderboard ----------
  renderScores(highlightRank = -1) {
    const list = Storage.loadScores();
    const ol = $('score-list');
    ol.innerHTML = '';
    if (!list.length) {
      ol.innerHTML = '<div class="score-empty">No scores yet — be the first to fly.</div>';
      return;
    }
    list.forEach((s, i) => {
      const li = document.createElement('li');
      if (i === highlightRank) li.classList.add('me');
      li.innerHTML =
        `<span class="rank">${i + 1}</span>` +
        `<span class="name">${this._escape(s.name)}</span>` +
        `<span class="pts">${formatScore(s.score)}</span>`;
      ol.appendChild(li);
    });
  }

  _escape(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ---------- HUD updates ----------
  setScore(v) { this.el.score.textContent = formatScore(v); }
  setWave(v) { this.el.wave.textContent = v; }

  setLives(n) {
    const el = this.el.lives;
    el.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const d = document.createElement('div');
      d.className = 'life';
      el.appendChild(d);
    }
  }

  setCombo(mult) {
    const active = mult > 1;
    this.el.combo.classList.toggle('active', active);
    this.el.comboValue.textContent = 'x' + mult;
  }

  setBomb(n) {
    this.el.bombCount.textContent = n;
    this.el.bombAbility.classList.toggle('disabled', n <= 0);
  }

  setShield(cooldown, max, active) {
    const ratio = active ? 1 : clamp(cooldown / max, 0, 1);
    this.el.shieldCd.style.transform = `scaleY(${ratio})`;
    this.el.shieldAbility.classList.toggle('disabled', cooldown > 0 && !active);
  }

  showBoss(name) {
    this.el.bossName.textContent = name;
    this.el.bossFill.style.width = '100%';
    this.el.bossBar.classList.remove('hidden');
  }
  setBossHealth(ratio) { this.el.bossFill.style.width = clamp(ratio, 0, 1) * 100 + '%'; }
  hideBoss() { this.el.bossBar.classList.add('hidden'); }

  // ---------- game over ----------
  showGameOver(stats) {
    $('over-score').textContent = formatScore(stats.score);
    $('over-wave').textContent = stats.wave;
    $('over-kills').textContent = stats.kills;
    $('over-combo').textContent = 'x' + stats.bestCombo;

    const result = Storage.addScore(this._pendingName || 'PILOT', stats.score, stats.wave);
    const isRecord = result.rank === 0 && stats.score > 0;
    $('over-newbest').classList.toggle('hidden', !isRecord);

    // Offer name entry when the run makes the board.
    const entry = $('over-nameentry');
    const onBoard = result.rank >= 0 && stats.score > 0;
    entry.classList.toggle('hidden', !onBoard);
    if (onBoard) {
      const input = $('over-name');
      input.value = '';
      this._lastScoreEntry = { score: stats.score, wave: stats.wave, rank: result.rank };
      input.oninput = () => {
        // Re-save under the typed callsign (replace the placeholder entry).
        if (this._lastScoreEntry) {
          Storage.renameEntry(this._lastScoreEntry.rank, input.value.trim() || 'PILOT');
        }
      };
    }
    this.show('screen-over');
    this.refreshMenu();
  }
}
