// Online controller: account/sign-in, store, global leaderboard, and the
// player's entitlements (credits, skins, battle pass). Talks to the Worker API.
// Degrades gracefully when the backend isn't configured yet (treated as signed out).

import { api } from './api.js';
import { SKINS } from '../entities/Player.js';

const SKIN_KEY = 'starfall.skin';
const $ = (id) => document.getElementById(id);
const esc = (s) => { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; };

// Inline Google "G" mark (self-contained SVG — no external requests).
const GOOGLE_G =
  '<svg class="g-logo" viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">' +
  '<path fill="#EA4335" d="M24 9.5c3.54 0 6.7 1.22 9.19 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>' +
  '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>' +
  '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>' +
  '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>' +
  '</svg>';

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

  // Native OAuth handoff: called from main.js when the app is opened via the
  // starfall://auth?token=… deep link (after Google sign-in in the browser).
  async completeNativeAuth(token) {
    try {
      await api.verifyOneTimeToken(token);
      await this.refresh();
      this._googleBusy = false;
      this.openAccount(); // show the signed-in profile as confirmation
    } catch {
      this.openAccount();
      this._msg('Sign-in could not be completed — please try again.');
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
      const name = this.state.user.name || 'Pilot';
      const initial = esc(name.trim().charAt(0).toUpperCase() || 'P');
      const skinBtns = ['default', ...this.state.skins].map((s) => {
        const glow = (SKINS[s] || SKINS.default).glow;
        return `<button class="chiplet ${this.equipped === s ? 'is-on' : ''}" data-skin="${esc(s)}">` +
          `<span class="swatch" style="background:${glow};box-shadow:0 0 8px ${glow}"></span>${esc(s)}</button>`;
      }).join('');
      body.innerHTML = `
        <div class="acct-profile">
          <div class="acct-avatar">${initial}</div>
          <div class="acct-id">
            <strong>${esc(name)}</strong>
            <span>${esc(this.state.user.email)}</span>
          </div>
        </div>
        <div class="acct-stats">
          <div class="acct-stat">
            <span>CREDITS</span>
            <strong class="credits">${this.state.credits.toLocaleString('en-US')}</strong>
          </div>
          <div class="acct-stat">
            <span>BATTLE PASS</span>
            <strong class="${this.state.passActive ? 'pass-active' : 'pass-off'}">${this.state.passActive ? 'ACTIVE ✦' : 'INACTIVE'}</strong>
          </div>
        </div>
        <div class="acct-skins">
          <span class="acct-label">SHIP SKIN</span>
          <div class="chiplets">${skinBtns}</div>
        </div>
        <button class="btn" id="acct-store">⬡ OPEN STORE</button>
        <button class="btn btn-signout" id="acct-signout">SIGN OUT</button>
        <div class="acct-msg" id="acct-msg"></div>`;
      $('acct-store').addEventListener('click', () => { this.audio.uiClick(); this.openStore(); });
      $('acct-signout').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        if (btn.disabled) return;
        btn.disabled = true;
        btn.textContent = 'SIGNING OUT…';
        this.audio.uiClick();
        try {
          await api.signOut();
        } catch { /* refresh() below reflects the true session state */ }
        await this.refresh();
        this._renderAccount();
        if (this.signedIn) this._msg('Sign out failed — please try again.');
      });
      body.querySelectorAll('[data-skin]').forEach((b) =>
        b.addEventListener('click', () => { this.audio.uiClick(); this.setSkin(b.dataset.skin); this._renderAccount(); }));
    } else {
      // Google works on web AND in the app: capacitor.config allows navigation
      // to the Google domains, so the OAuth flow stays inside the app WebView
      // (same session/cookies) instead of bouncing out to Safari.
      body.innerHTML = `
        <p class="acct-intro">Sign in to save your progress, climb the global leaderboard and keep purchases across devices.</p>
        <button class="btn btn-google" id="acct-google">${GOOGLE_G}<span>Continue with Google</span></button>
        <div class="acct-or"><span>or use email</span></div>
        <input id="acct-name" placeholder="Callsign (sign-up only)" maxlength="12" autocomplete="nickname" />
        <input id="acct-email" type="email" placeholder="Email" autocomplete="email" />
        <input id="acct-pass" type="password" placeholder="Password (8+ characters)" autocomplete="current-password" />
        <div class="acct-actions">
          <button class="btn btn-primary" id="acct-signin">SIGN IN</button>
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
        btn.querySelector('span').textContent = 'Redirecting to Google…';
        this.audio.uiClick();
        const native = !!window.__isNativeApp;
        const reset = () => {
          this._googleBusy = false;
          if (btn.isConnected) {
            btn.disabled = false;
            btn.querySelector('span').textContent = 'Continue with Google';
          }
        };
        // Native: Google forbids OAuth in embedded WebViews, so the flow runs
        // in the SYSTEM browser and returns via /auth-return → starfall://auth
        // deep link (handled in main.js). The WebView stays on this screen —
        // re-enable the button so a retry is possible.
        api.signInGoogle(native ? '/auth-return' : '/').catch((err) => {
          reset();
          this._msg(err.message);
        });
        if (native) setTimeout(reset, 6000);
      });
      $('acct-signin').addEventListener('click', () => this._emailAuth(false));
      $('acct-signup').addEventListener('click', () => this._emailAuth(true));
      // Enter in the password field submits a sign-in.
      $('acct-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') this._emailAuth(false); });
    }
  }

  _msg(text, ok = false) {
    const el = $('acct-msg');
    if (el) { el.textContent = text; el.className = 'acct-msg' + (ok ? ' ok' : ''); }
  }

  async _emailAuth(isSignup) {
    if (this._authBusy) return;
    this.audio.uiClick();
    const email = $('acct-email').value.trim();
    const pass = $('acct-pass').value;
    const name = ($('acct-name').value.trim() || email.split('@')[0] || 'Pilot').slice(0, 12);
    if (!email || pass.length < 8) { this._msg('Enter an email and an 8+ character password.'); return; }
    const btn = $(isSignup ? 'acct-signup' : 'acct-signin');
    const label = btn.textContent;
    this._authBusy = true;
    btn.disabled = true;
    btn.textContent = isSignup ? 'CREATING…' : 'SIGNING IN…';
    try {
      if (isSignup) {
        await api.signUpEmail(name, email, pass);
        this._msg('Account created — check your email to verify, then sign in.', true);
      } else {
        await api.signInEmail(email, pass);
        await this.refresh();
        this._renderAccount();
        return; // re-rendered — btn no longer exists
      }
    } catch (e) {
      this._msg(e.status === 403 ? 'Please verify your email first (check your inbox).' : (e.message || 'Sign-in failed.'));
    } finally {
      this._authBusy = false;
      if (btn.isConnected) { btn.disabled = false; btn.textContent = label; }
    }
  }

  // ---------------- store screen ----------------
  async openStore() {
    this.ui.show('screen-store');
    const balance = $('store-balance');
    const body = $('store-body');
    balance.innerHTML = this.signedIn
      ? `<span>${this.state.credits.toLocaleString('en-US')} credits</span>${this.state.passActive ? '<span class="pass-on">Battle Pass ✦</span>' : ''}`
      : '';
    body.innerHTML = '<div class="score-empty">Loading store…</div>';
    let products = [];
    try { ({ products } = await api.store()); } catch { /* endpoint unavailable */ }

    // Signed-out: a real call-to-action instead of a passive hint.
    const signinCta = this.signedIn ? '' : `
      <div class="store-signin">
        <p>Sign in to buy — purchases stay on your account across devices.</p>
        <button class="btn btn-primary" id="store-signin">SIGN IN / CREATE ACCOUNT</button>
      </div>`;

    if (!products.length) {
      body.innerHTML = signinCta +
        '<div class="score-empty">The store is being restocked — check back soon.</div>';
    } else {
      const labelExtra = (p) =>
        p.kind === 'credits' ? `+${p.credits.toLocaleString('en-US')} credits`
        : p.kind === 'skin' ? 'Ship skin'
        : p.monthlyCredits ? `Subscription · +${p.monthlyCredits}/mo` : 'Subscription';
      body.innerHTML = signinCta + products.map((p) => {
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
    const cta = $('store-signin');
    if (cta) cta.addEventListener('click', () => { this.audio.uiClick(); this.openAccount(); });
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
