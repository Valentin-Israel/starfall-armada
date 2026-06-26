// Starfall: Armada — Cloudflare Worker entry.
//
// A single Worker hosts the whole product:
//   • All non-/api/* requests are served straight from the static assets in
//     ./public by Cloudflare's asset router (edge-cached, this code is not even
//     invoked for them — see `run_worker_first: ["/api/*"]` in wrangler.jsonc).
//   • /api/* requests reach this fetch handler first. Today only /api/health is
//     live; Phase 3 mounts better-auth (/api/auth/*) and Stripe (/api/stripe/*)
//     here. See docs/PHASE3-AUTH-PAYMENTS.md.

export default {
  /**
   * @param {Request} request
   * @param {{ ASSETS: Fetcher }} env
   * @param {ExecutionContext} ctx
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      // Lightweight health/version probe — useful for uptime checks & CI.
      if (url.pathname === '/api/health' && request.method === 'GET') {
        return Response.json({
          ok: true,
          app: 'starfall-armada',
          version: '1.0.0',
        });
      }

      // Phase 3 (after hosting) will route here:
      //   if (url.pathname.startsWith('/api/auth/'))   return createAuth(env, ctx).handler(request);
      //   if (url.pathname === '/api/stripe/webhook')  return handleStripeWebhook(request, env);
      //   if (url.pathname === '/api/leaderboard')     return handleLeaderboard(request, env);

      return new Response('Not Found', { status: 404 });
    }

    // Fallthrough safety net: hand anything else to the static asset router.
    return env.ASSETS.fetch(request);
  },
};
