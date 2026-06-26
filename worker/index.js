// Starfall: Armada — Cloudflare Worker entry.
//
//   • Non-/api/* requests are served from the static assets in ./public by
//     Cloudflare's asset router (run_worker_first: ["/api/*"] in wrangler.jsonc).
//   • /api/auth/* is owned by better-auth (sign-in, Google callback, session).
//   • Other /api/* routes (leaderboard, store, Stripe, credits) live in api.js.
import { createAuth } from './auth.js';
import { handleApi } from './api.js';

export default {
  /**
   * @param {Request} request
   * @param {Record<string, any>} env
   * @param {ExecutionContext} ctx
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      try {
        // better-auth owns the whole /api/auth/* subtree (incl. /callback/google).
        if (url.pathname.startsWith('/api/auth/')) {
          return await createAuth(env, ctx).handler(request);
        }
        return await handleApi(request, env, ctx, url);
      } catch (e) {
        // Log server-side; return an opaque error (don't leak internals to clients).
        // A misconfigured secret/binding must not take down the static game.
        console.error('API error:', e);
        return new Response(
          JSON.stringify({ error: 'Server error' }),
          { status: 500, headers: { 'content-type': 'application/json' } },
        );
      }
    }

    return env.ASSETS.fetch(request);
  },
};
