// Thin fetch wrapper around the Worker API + better-auth REST endpoints.
// Same-origin, cookie-based sessions (credentials: 'include'). No SDK / bundler.

async function req(path, { method = 'GET', body } = {}) {
  const opts = { method, credentials: 'include' };
  if (method !== 'GET') {
    // better-auth requires Content-Type: application/json even on body-less
    // POSTs (sign-out returns 415 otherwise) — always send a JSON body.
    opts.headers = { 'content-type': 'application/json' };
    opts.body = JSON.stringify(body ?? {});
  }
  const res = await fetch(path, opts);
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `HTTP ${res.status}`;
    const e = new Error(msg);
    e.status = res.status;
    throw e;
  }
  return data;
}

export const api = {
  // ---- better-auth ----
  signUpEmail: (name, email, password) =>
    req('/api/auth/sign-up/email', { method: 'POST', body: { name, email, password } }),
  signInEmail: (email, password) =>
    req('/api/auth/sign-in/email', { method: 'POST', body: { email, password } }),
  async signInGoogle(callbackURL = '/') {
    // Native: run the OAuth in an in-app ASWebAuthenticationSession (shows the
    // Apple "Starfall möchte sich bei google.com anmelden" consent popup + shares
    // Safari SSO). CRUCIAL: the whole flow — including INITIATION — must run inside
    // that browser's cookie jar, so we open /auth-start (which POSTs sign-in there)
    // rather than posting here in the app WebView. Otherwise better-auth sets the
    // OAuth `state` cookie in the WebView jar but reads it back in the Safari jar →
    // state_mismatch. The session captures the starfall://auth?token=… redirect and
    // hands the callback URL straight back; we return the one-time token to verify.
    const WebAuth = window.Capacitor?.Plugins?.EphemeralWebAuth;
    if (window.__isNativeApp && WebAuth) {
      const startUrl = `${location.origin}/auth-start?cb=${encodeURIComponent('/auth-return')}`;
      const { url } = await WebAuth.signIn({ authUrl: startUrl, callbackScheme: 'starfall' });
      const m = /[?&]token=([^&]+)/.exec(url || '');
      return m ? decodeURIComponent(m[1]) : null;
    }
    // Web (and native fallback if the plugin isn't registered): initiate here and
    // redirect the page to Google. On web the whole flow is one jar, so this is
    // correct; the native fallback returns via /auth-return → starfall://auth.
    const r = await req('/api/auth/sign-in/social', {
      method: 'POST',
      body: { provider: 'google', callbackURL },
    });
    if (r && r.url) location.href = r.url;
    return null;
  },
  // Native OAuth handoff: exchange the one-time token minted in the system
  // browser for a session in the app WebView (verify sets the cookie).
  verifyOneTimeToken: (token) =>
    req('/api/auth/one-time-token/verify', { method: 'POST', body: { token } }),
  signOut: () => req('/api/auth/sign-out', { method: 'POST' }),

  // ---- app ----
  me: () => req('/api/me'),
  globalLeaderboard: () => req('/api/leaderboard'),
  submitScore: (score, wave, combo, callsign) =>
    req('/api/leaderboard', { method: 'POST', body: { score, wave, combo, callsign } }),
  store: () => req('/api/store'),
  checkout: (product) => req('/api/stripe/checkout', { method: 'POST', body: { product } }),
  spendCredits: (reason) => req('/api/credits/spend', { method: 'POST', body: { reason } }),
};
