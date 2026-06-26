// DOM-driven UI: screen routing, HUD updates, menus, settings and leaderboard.
// Keeps all DOM concerns out of the game-simulation code.

import { Storage } from '../core/Storage.js';
import { SHIPS } from '../data/Ships.js';
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
      hpBar: $('hud-hp-bar'),
      hpFill: $('hud-hp-fill'),
      bossBar: $('boss-bar'),
      bossName: $('boss-bar-name'),
      bossFill: $('boss-bar-fill'),
      shieldCd: $('ability-shield-cd'),
      shieldAbility: $('ability-shield'),
      bombCount: $('ability-bomb-count'),
      bombAbility: $('ability-bomb'),
      buffs: $('hud-buffs'),
      buffWeapon: $('buff-weapon'),
      buffWeaponLabel: $('buff-weapon-label'),
      buffRapid: $('buff-rapid'),
      buffRapidFill: $('buff-rapid-fill'),
      touch: $('touch-controls'),
      menuBest: $('menu-best-value'),
      menuCredits: $('menu-credits-value'),
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
    $('btn-shop').addEventListener('click', () => { this.audio.uiClick(); this._emit('shopOpen'); });
  }

  refreshMenu() {
    this.el.menuBest.textContent = formatScore(Storage.best());
    this.el.menuCredits.textContent = formatScore(Storage.loadCredits());
  }

  // ---------- shop ----------
  showShop() {
    this.renderShop();
    this.show('screen-shop');
  }

  renderShop() {
    const grid = $('ship-grid');
    const credits = Storage.loadCredits();
    const { unlocked, selected } = Storage.loadShipData();
    $('shop-credits-value').textContent = formatScore(credits);
    grid.innerHTML = '';

    for (const ship of SHIPS) {
      const isUnlocked = unlocked.includes(ship.id);
      const isSelected = ship.id === selected;
      const canAfford = credits >= ship.cost;

      const card = document.createElement('div');
      card.className = 'ship-card' + (isSelected ? ' ship-selected' : '');

      let btnHTML;
      if (isSelected) {
        btnHTML = `<button class="btn ship-btn selected-btn" disabled>✓ SELECTED</button>`;
      } else if (isUnlocked) {
        btnHTML = `<button class="btn ship-btn" data-id="${ship.id}">SELECT</button>`;
      } else {
        btnHTML = `<button class="btn ship-btn buy-btn${canAfford ? '' : ' disabled'}" data-id="${ship.id}" data-cost="${ship.cost}">
          ${canAfford ? `BUY — ${formatScore(ship.cost)}` : `${formatScore(ship.cost)} CREDITS`}
        </button>`;
      }

      card.innerHTML = `
        <div class="ship-icon-wrap">
          <div class="ship-icon" style="background:${ship.color};filter:drop-shadow(0 0 8px ${ship.color})"></div>
        </div>
        <h3 class="ship-name" style="color:${ship.color}">${ship.name}</h3>
        <p class="ship-desc">${ship.description}</p>
        <div class="ship-stats">
          ${this._statBar('SPD', ship.stats.speed, ship.color)}
          ${this._statBar('HP', ship.stats.hp, ship.color)}
          ${this._statBar('BOMBS', ship.stats.bombs, ship.color)}
          ${this._statBar('FIRE', ship.stats.fire, ship.color)}
        </div>
        <div class="ship-ability">${ship.abilityIcon} <strong>${ship.abilityName}</strong> — ${ship.abilityDesc}</div>
        ${btnHTML}
      `;

      card.querySelector('.ship-btn').addEventListener('click', (e) => {
        const btn = e.currentTarget;
        const id = btn.dataset.id;
        const cost = parseInt(btn.dataset.cost || '0', 10);
        this.audio.uiClick();
        if (btn.classList.contains('buy-btn')) {
          const cur = Storage.loadCredits();
          if (cur < cost) return;
          Storage.addCredits(-cost);
          Storage.unlockShip(id);
        }
        if (id) {
          Storage.selectShip(id);
          this.renderShop();
        }
      });

      grid.appendChild(card);
    }
  }

  _statBar(label, ratio, color) {
    return `<div class="ship-stat-row">
      <span class="stat-label">${label}</span>
      <div class="stat-track"><div class="stat-fill" style="width:${Math.round(ratio * 100)}%;background:${color}"></div></div>
    </div>`;
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

  setShipAbility(ship) {
    this.el.shieldAbility.querySelector('.ability-icon').textContent = ship.abilityIcon;
  }

  setHP(current, max) {
    const ratio = clamp(current / max, 0, 1);
    this.el.hpFill.style.width = ratio * 100 + '%';
    this.el.hpFill.style.background = ratio > 0.6 ? '#1fd9ff' : ratio > 0.3 ? '#ffcf3b' : '#ff3b5c';
  }

  setBuffs(weaponLevel, baseWeaponLevel, rapidTimer) {
    const hasWeapon = weaponLevel > baseWeaponLevel;
    this.el.buffWeapon.classList.toggle('hidden', !hasWeapon);
    if (hasWeapon) this.el.buffWeaponLabel.textContent = 'WPN ' + weaponLevel;

    const hasRapid = rapidTimer > 0;
    this.el.buffRapid.classList.toggle('hidden', !hasRapid);
    if (hasRapid) this.el.buffRapidFill.style.width = Math.min(rapidTimer / 6, 1) * 100 + '%';

    this.el.buffs.classList.toggle('hidden', !hasWeapon && !hasRapid);
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
    $('over-credits-earned').textContent = `+${formatScore(stats.score)} CREDITS EARNED`;
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
