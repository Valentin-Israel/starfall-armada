// Online controller: account/sign-in, store, global leaderboard, and the
// player's entitlements (credits, skins, battle pass). Talks to the Worker API.
// Degrades gracefully when the backend isn't configured yet (treated as signed out).

import { api } from './api.js';

const SKIN_KEY = 'starfall.skin';
const $ = (id) => document.getElementById(id);
const esc = (s) => { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; };

export class Online {
  constructor({ ui, audio }) {
    this.ui = ui;
    this.audio = audio;
    this.state = { user: null, credits: 0, skins: [], passActive: false };
    this.equipped = localStorage.getItem(SKIN_KEY) || 'default';
    this.ready = false;
  }

  async init() {
    this._wire();
    this._handlePurchaseReturn();
    await this.refresh();
  }

  _wire() {
    $('btn-account').addEventListener('click', () => { this.audio.uiClick(); this.openAccount(); });
    $('btn-store').addEventListener('click', () => { this.audio.uiClick(); this.openStore(); });
    $('account-chip').addEventListener('click', () => { this.audio.uiClick(); this.openAccount(); });

    // Leaderboard Local/Global tabs.
    const local = $('tab-local'), global = $('tab-global');
    local.addEventListener('click', () => this._switchTab('local'));
    global.addEventListener('click', () => this._switchTab('global'));
  }

  async refresh() {
    try {
      const me = await api.me();
      this.state = {
        user: me.user || null,
        credits: me.credits || 0,
        skins: me.skins || [],
        passActive: !!me.passActive,
      };
      // Drop an equipped skin we no longer own.
      if (this.equipped !== 'default' && !this.state.skins.includes(this.equipped)) {
        this.setSkin('default');
      }
    } catch {
      this.state = { user: null, credits: 0, skins: [], passActive: false };
    }
    this.ready = true;
    this._updateChip();
  }

  _updateChip() {
    const chip = $('account-chip');
    if (this.state.user) {
      $('chip-name').textContent = (this.state.user.name || 'PILOT').toUpperCase().slice(0, 12);
      $('chip-credits').textContent = this.state.credits.toLocaleString('en-US');
      chip.classList.remove('hidden');
    } else {
      chip.classList.add('hidden');
    }
  }

  // ---------------- entitlements (used by the game) ----------------
  get signedIn() { return !!this.state.user; }
  equippedSkin() { return this.equipped; }
  setSkin(skin) {
    this.equipped = skin;
    localStorage.setItem(SKIN_KEY, skin);
  }
  hasPass() { return this.state.passActive; }
  canRevive() { return this.signedIn && this.state.credits >= 200; }
  async spendRevive() {
    const r = await api.spendCredits('revive');
    this.state.credits = r.balance;
    this._updateChip();
    return true;
  }
  async submitScore(score, wave, combo) {
    if (!this.signedIn) return;
    try {
      await api.submitScore(score, wave, combo, this.state.user.name);
    } catch { /* non-fatal */ }
  }

  // ---------------- leaderboard tabs ----------------
  _switchTab(which) {
    this.audio.uiClick();
    const localBtn = $('tab-local'), globalBtn = $('tab-global');
    const localList = $('score-list'), globalList = $('score-list-global');
    const isLocal = which === 'local';
    localBtn.classList.toggle('is-active', isLocal);
    globalBtn.classList.toggle('is-active', !isLocal);
    localList.classList.toggle('hidden', !isLocal);
    globalList.classList.toggle('hidden', isLocal);
    if (!isLocal) this._loadGlobal();
  }

  async _loadGlobal() {
    const list = $('score-list-global');
    list.innerHTML = '<div class="score-empty">Loading…</div>';
    try {
      const { scores } = await api.globalLeaderboard();
      if (!scores.length) { list.innerHTML = '<div class="score-empty">No online scores yet — sign in and play!</div>'; return; }
      list.innerHTML = scores.map((s, i) =>
        `<li><span class="rank">${i + 1}</span><span class="name">${esc(s.callsign)}</span>` +
        `<span class="pts">${Number(s.score).toLocaleString('en-US')}</span></li>`).join('');
    } catch {
      list.innerHTML = '<div class="score-empty">Online leaderboard unavailable.</div>';
    }
  }

  // ---------------- account screen ----------------
  openAccount() {
    this._renderAccount();
    this.ui.show('screen-account');
  }

  _renderAccount() {
    const body = $('account-body');
    if (this.state.user) {
      const skinBtns = ['default', ...this.state.skins].map((s) =>
        `<button class="chiplet ${this.equipped === s ? 'is-on' : ''}" data-skin="${esc(s)}">${esc(s)}</button>`).join('');
      body.innerHTML = `
        <div class="acct-row"><span>Signed in</span><strong>${esc(this.state.user.email)}</strong></div>
        <div class="acct-row"><span>Credits</span><strong>${this.state.credits.toLocaleString('en-US')}</strong></div>
        <div class="acct-row"><span>Battle Pass</span><strong>${this.state.passActive ? 'ACTIVE ✦' : '—'}</strong></div>
        <div class="acct-skins"><span>Ship skin</span><div class="chiplets">${skinBtns}</div></div>
        <button class="btn" id="acct-signout">SIGN OUT</button>`;
      $('acct-signout').addEventListener('click', async () => {
        this.audio.uiClick();
        try { await api.signOut(); } catch { /* ignore */ }
        await this.refresh();
        this._renderAccount();
      });
      body.querySelectorAll('[data-skin]').forEach((b) =>
        b.addEventListener('click', () => { this.audio.uiClick(); this.setSkin(b.dataset.skin); this._renderAccount(); }));
    } else {
      body.innerHTML = `
        <p class="acct-intro">Sign in to save progress, climb the global leaderboard and keep your purchases across devices.</p>
        <button class="btn btn-primary" id="acct-google">Sign in with Google</button>
        <div class="acct-or">— or —</div>
        <input id="acct-name" placeholder="Callsign (sign-up only)" maxlength="12" autocomplete="off" />
        <input id="acct-email" type="email" placeholder="Email" autocomplete="email" />
        <input id="acct-pass" type="password" placeholder="Password (8+ chars)" autocomplete="current-password" />
        <div class="acct-actions">
          <button class="btn" id="acct-signin">SIGN IN</button>
          <button class="btn" id="acct-signup">CREATE ACCOUNT</button>
        </div>
        <div class="acct-msg" id="acct-msg"></div>`;
      $('acct-google').addEventListener('click', (e) => {
        // Guard against double-clicks: each social sign-in overwrites the state
        // cookie, so a second click invalidates the first flow → state_mismatch.
        if (this._googleBusy) return;
        this._googleBusy = true;
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = 'Redirecting to Google…';
        this.audio.uiClick();
        api.signInGoogle().catch((err) => {
          this._googleBusy = false;
          btn.disabled = false;
          btn.textContent = 'Sign in with Google';
          this._msg(err.message);
        });
      });
      $('acct-signin').addEventListener('click', () => this._emailAuth(false));
      $('acct-signup').addEventListener('click', () => this._emailAuth(true));
    }
  }

  _msg(text, ok = false) {
    const el = $('acct-msg');
    if (el) { el.textContent = text; el.className = 'acct-msg' + (ok ? ' ok' : ''); }
  }

  async _emailAuth(isSignup) {
    this.audio.uiClick();
    const email = $('acct-email').value.trim();
    const pass = $('acct-pass').value;
    const name = ($('acct-name').value.trim() || email.split('@')[0] || 'Pilot').slice(0, 12);
    if (!email || pass.length < 8) { this._msg('Enter an email and an 8+ character password.'); return; }
    try {
      if (isSignup) {
        await api.signUpEmail(name, email, pass);
        this._msg('Account created — check your email to verify, then sign in.', true);
      } else {
        await api.signInEmail(email, pass);
        await this.refresh();
        this._renderAccount();
      }
    } catch (e) {
      this._msg(e.status === 403 ? 'Please verify your email first (check your inbox).' : (e.message || 'Sign-in failed.'));
    }
  }

  // ---------------- store screen ----------------
  async openStore() {
    this.ui.show('screen-store');
    const balance = $('store-balance');
    const body = $('store-body');
    balance.innerHTML = this.signedIn
      ? `<span>${this.state.credits.toLocaleString('en-US')} credits</span>${this.state.passActive ? '<span class="pass-on">Battle Pass ✦</span>' : ''}`
      : '<span>Sign in to buy and keep purchases</span>';
    body.innerHTML = '<div class="score-empty">Loading store…</div>';
    let products = [];
    try { ({ products } = await api.store()); } catch { /* below */ }
    if (!products.length) {
      body.innerHTML = '<div class="score-empty">Store not configured yet.</div>';
      return;
    }
    const labelExtra = (p) =>
      p.kind === 'credits' ? `+${p.credits.toLocaleString('en-US')} credits`
      : p.kind === 'skin' ? 'Ship skin'
      : p.monthlyCredits ? `Subscription · +${p.monthlyCredits}/mo` : 'Subscription';
    body.innerHTML = products.map((p) => {
      const owned = p.kind === 'skin' && this.state.skins.includes(p.skin);
      const passOwned = p.kind === 'subscription' && this.state.passActive;
      const disabled = owned || passOwned;
      return `<div class="store-item ${p.kind === 'subscription' ? 'is-pass' : ''}">
        <div class="store-item-title">${esc(p.label)}</div>
        <div class="store-item-sub">${labelExtra(p)}</div>
        <button class="btn ${disabled ? '' : 'btn-primary'}" data-buy="${esc(p.key)}" ${disabled ? 'disabled' : ''}>
          ${owned ? 'OWNED' : passOwned ? 'ACTIVE' : 'BUY'}</button>
      </div>`;
    }).join('');
    body.querySelectorAll('[data-buy]').forEach((b) =>
      b.addEventListener('click', () => this._buy(b.dataset.buy)));
  }

  async _buy(product) {
    this.audio.uiClick();
    if (!this.signedIn) { this.openAccount(); return; }
    try {
      const { url } = await api.checkout(product);
      if (url) location.href = url; // Stripe-hosted Checkout
    } catch (e) {
      alert(e.message || 'Checkout unavailable.');
    }
  }

  // After returning from Stripe Checkout (success_url has ?purchase=success).
  _handlePurchaseReturn() {
    const params = new URLSearchParams(location.search);
    const p = params.get('purchase');
    if (!p) return;
    history.replaceState(null, '', location.pathname); // clean the URL
    if (p === 'success') {
      // Webhook fulfillment may lag a second; refresh shortly after.
      setTimeout(() => this.refresh(), 1500);
    }
  }
}
