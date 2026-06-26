// Thin fetch wrapper around the Worker API + better-auth REST endpoints.
// Same-origin, cookie-based sessions (credentials: 'include'). No SDK / bundler.

async function req(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
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
  async signInGoogle() {
    // better-auth returns a URL to redirect the browser to Google.
    const r = await req('/api/auth/sign-in/social', {
      method: 'POST',
      body: { provider: 'google', callbackURL: '/' },
    });
    if (r && r.url) location.href = r.url;
  },
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
