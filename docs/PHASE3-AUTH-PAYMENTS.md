# Phase 3 — Accounts, Cloud Leaderboard & Payments

> Status: **planned** (to build after hosting is live). This is the verified
> blueprint — current API shapes confirmed against official docs (June 2026).
> Everything runs in the **same Worker** under `/api/*` (`worker/index.js`),
> Cloudflare-only.

## Goals (from product decisions)

- **Sign-in (better-auth + Google):** cloud-synced **high-score leaderboard** and
  **saved progress / unlocks** across devices.
- **Payments (Stripe):**
  - **One-time purchases** — credits / ship skins (pay-to-win is intended): the
    game is designed so credits buy power. Each is a Stripe **Price** in `payment` mode.
  - **Battle-pass subscription** — recurring access to premium features, skins,
    ships, monthly credits. A recurring Stripe **Price** in `subscription` mode.

## Cloudflare resources to create

```bash
npx wrangler d1 create starfall-db          # accounts, scores, entitlements, ledger
npx wrangler kv namespace create SESSIONS   # (optional) secondary session store
```
Add the returned IDs to `wrangler.jsonc` as `d1_databases` / `kv_namespaces`.

## Data model (D1 / SQLite)

- better-auth tables (generated): `user`, `session`, `account`, `verification`.
- `leaderboard(user_id, best_score, best_wave, updated_at)` — one row per user; the
  client posts a run, server keeps the max. Public top-N is a read query.
- `entitlements(user_id, key, kind, expires_at)` — `kind = 'skin' | 'pass' | 'credits'`.
- `credit_ledger(user_id, delta, reason, stripe_event_id)` — append-only; balance = SUM.
  Idempotent on `stripe_event_id` so webhook retries never double-credit.

## Auth — better-auth on Workers (verified)

Key constraints confirmed against docs:

- **Per-request factory is mandatory** — D1/secrets live on `env`, not module scope.
  Build `createAuth(env, ctx)` inside the request; mount the catch-all at
  `/api/auth/*` (better-auth owns the whole subtree incl. `/api/auth/callback/google`).
- **D1 adapter:** use the **Drizzle adapter** (`better-auth/adapters/drizzle` +
  `drizzle-orm/d1`, `provider: "sqlite"`). The "pass `env.DB` directly" pattern is
  **not** core better-auth — it belongs to the third-party `better-auth-cloudflare`.
- **Schema/migrations:** `@better-auth/cli generate` → `drizzle-kit generate` →
  `wrangler d1 migrations apply`. `better-auth migrate` does **not** support Drizzle/D1.
- **Resend email:** call `resend.emails.send(...)` inside `sendVerificationEmail` /
  `sendResetPassword`, wrapped in `ctx.waitUntil(...)` so the response isn't blocked.
- **Google:** register `https://starfall.valentin.is/api/auth/callback/google` (and a
  localhost callback for dev) in Google Cloud Console, or you'll get `redirect_uri_mismatch`.
- **Compat:** `nodejs_compat` (already set) — better-auth uses AsyncLocalStorage.

Secrets: `BETTER_AUTH_SECRET` (≥32 chars), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`RESEND_API_KEY`. Var: `BETTER_AUTH_URL = https://starfall.valentin.is`.

```bash
npm i better-auth resend drizzle-orm
npm i -D drizzle-kit
```

## Payments — Stripe on Workers (verified)

- **Init:** `new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: <pinned> })`. On recent
  `stripe-node` (latest = 22.x) you do **not** need `Stripe.createFetchHttpClient()`
  — the fetch client is auto-detected on the Workers runtime.
  > Pin `apiVersion` to the value the installed SDK reports — do not hardcode an
  > unverified version string.
- **Checkout:** create a session server-side and `Response.redirect(session.url, 303)`.
  - One-time: `mode: 'payment'`, `line_items: [{ price: <skin/credit price id>, quantity }]`.
  - Battle pass: `mode: 'subscription'`, `line_items: [{ price: <recurring price id> }]`.
  - Pass `client_reference_id = user.id` (or a Stripe Customer) so the webhook knows who to credit.
- **Webhook (`POST /api/stripe/webhook`):** MUST use the async verifier on Workers —
  `await stripe.webhooks.constructEventAsync(rawBody, sig, secret)`. Read the body
  **once** with `await request.text()` *before* parsing (double-read throws
  "Body has already been used"). The SubtleCrypto provider is auto-selected.
  - `checkout.session.completed` → grant skin / add credits / start pass (idempotent on `event.id`).
  - `customer.subscription.deleted` / `invoice.paid` → revoke / renew the pass.

Secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (per endpoint; the local
`stripe listen` prints its own `whsec_`).

```bash
npm i stripe
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
stripe listen --forward-to http://localhost:8787/api/stripe/webhook   # local testing
```

## Client wiring (in the game)

- Add a **"Sign in with Google"** button on the menu → `authClient.signIn.social({ provider: 'google' })`.
- After a run, if signed in, `POST /api/leaderboard { score, wave }`; render the
  global top-N alongside the existing local board (which stays as offline fallback).
- A **Store** screen lists skins / credit packs / the battle pass → each button hits
  `POST /api/checkout/*` and redirects to Stripe Checkout. On return, read entitlements
  from `/api/me` and unlock in-game.

## Open decisions before building Phase 3

- Exact products & prices (credit pack amounts, skin list, battle-pass price/interval) —
  created in the Stripe Dashboard; their Price IDs go into the Worker.
- `from:` email domain for Resend (verify a domain, e.g. `no-reply@cashxchain.com`).
- Whether the store is purely cosmetic vs. credits affecting gameplay (confirmed: **pay-to-win allowed**).
