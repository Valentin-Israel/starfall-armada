// Application API (everything under /api/ except /api/auth/*, which better-auth owns).
import Stripe from 'stripe';
import { createAuth } from './auth.js';
import { PRODUCT_BY_KEY, priceIdFor, publicCatalog } from './products.js';
import * as db from './db.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const err = (msg, status = 400) => json({ error: msg }, status);

const PASS_PERIOD_MS = 31 * 24 * 60 * 60 * 1000;
const REVIVE_COST = 200;

function getStripe(env) {
  // No httpClient needed — stripe-node auto-detects fetch on Workers.
  return new Stripe(env.STRIPE_SECRET_KEY, { appInfo: { name: 'starfall-armada' } });
}

async function requireUser(request, env, ctx) {
  const auth = createAuth(env, ctx);
  const res = await auth.api.getSession({ headers: request.headers });
  return res?.user || null;
}

export async function handleApi(request, env, ctx, url) {
  const { pathname } = url;
  const method = request.method;

  if (pathname === '/api/health' && method === 'GET') {
    return json({ ok: true, app: 'starfall-armada', version: '1.0.0' });
  }

  // Public store catalog (only products whose Stripe price id is configured).
  if (pathname === '/api/store' && method === 'GET') {
    return json({ products: publicCatalog(env) });
  }

  // Current user + profile (credits, owned skins, pass status). 200 with user:null if signed out.
  if (pathname === '/api/me' && method === 'GET') {
    const user = await requireUser(request, env, ctx);
    if (!user) return json({ user: null });
    const profile = await db.getProfile(env.DB, user.id);
    return json({ user: { id: user.id, name: user.name, email: user.email }, ...profile });
  }

  // Global leaderboard.
  if (pathname === '/api/leaderboard' && method === 'GET') {
    const scores = await db.topScores(env.DB, 20);
    return json({ scores });
  }
  if (pathname === '/api/leaderboard' && method === 'POST') {
    const user = await requireUser(request, env, ctx);
    if (!user) return err('Sign in to submit scores', 401);
    const body = await request.json().catch(() => ({}));
    const score = Math.max(0, Math.floor(Number(body.score) || 0));
    const wave = Math.max(1, Math.floor(Number(body.wave) || 1));
    const combo = Math.max(1, Math.floor(Number(body.combo) || 1));
    const callsign = String(body.callsign || user.name || 'PILOT').slice(0, 12).toUpperCase();
    await db.submitScore(env.DB, user.id, callsign, score, wave, combo);
    return json({ ok: true });
  }

  // Spend credits server-side (authoritative) — used by the in-game "Revive".
  if (pathname === '/api/credits/spend' && method === 'POST') {
    const user = await requireUser(request, env, ctx);
    if (!user) return err('Sign in required', 401);
    const body = await request.json().catch(() => ({}));
    const reason = body.reason === 'revive' ? 'revive' : null;
    if (!reason) return err('Unknown spend reason');
    const cost = REVIVE_COST;
    const balance = await db.spendCredits(env.DB, user.id, cost, reason);
    if (balance == null) return err('Insufficient credits', 402);
    return json({ ok: true, balance });
  }

  // Create a Stripe Checkout Session for a product.
  if (pathname === '/api/stripe/checkout' && method === 'POST') {
    const user = await requireUser(request, env, ctx);
    if (!user) return err('Sign in required', 401);
    const body = await request.json().catch(() => ({}));
    const product = PRODUCT_BY_KEY[body.product];
    if (!product) return err('Unknown product');
    const price = priceIdFor(product, env);
    if (!price) return err('Product not available', 409);

    const stripe = getStripe(env);
    const base = env.BETTER_AUTH_URL;
    const session = await stripe.checkout.sessions.create({
      mode: product.mode,
      line_items: [{ price, quantity: 1 }],
      client_reference_id: user.id,
      customer_email: user.email,
      metadata: { userId: user.id, productKey: product.key },
      ...(product.mode === 'subscription'
        ? { subscription_data: { metadata: { userId: user.id, productKey: product.key } } }
        : {}),
      success_url: `${base}/?purchase=success`,
      cancel_url: `${base}/?purchase=cancel`,
    });
    return json({ url: session.url });
  }

  // Stripe webhook — fulfillment. Raw body + async signature verification.
  if (pathname === '/api/stripe/webhook' && method === 'POST') {
    return handleWebhook(request, env);
  }

  return err('Not found', 404);
}

async function handleWebhook(request, env) {
  const sig = request.headers.get('stripe-signature');
  if (!sig) return err('Missing signature', 400);
  const stripe = getStripe(env);
  const raw = await request.text(); // read once, before parsing

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return err(`Webhook signature verification failed: ${e.message}`, 400);
  }

  // Idempotency: never fulfill the same event twice.
  if (await db.eventAlreadyProcessed(env.DB, event.id)) return json({ received: true, duplicate: true });

  try {
    await fulfill(event, env, stripe);
  } catch (e) {
    // Don't mark processed on failure so Stripe retries.
    return err(`Fulfillment error: ${e.message}`, 500);
  }
  await db.markEventProcessed(env.DB, event.id, event.type);
  return json({ received: true });
}

async function fulfill(event, env, stripe) {
  const D = env.DB;
  switch (event.type) {
    case 'checkout.session.completed': {
      const s = event.data.object;
      const userId = s.metadata?.userId || s.client_reference_id;
      const product = PRODUCT_BY_KEY[s.metadata?.productKey];
      if (!userId || !product) return;
      if (product.kind === 'credits') {
        await db.addCredits(D, userId, product.credits, `purchase:${product.key}`, event.id);
      } else if (product.kind === 'skin') {
        await db.grantSkin(D, userId, product.skin);
      } else if (product.kind === 'subscription') {
        await db.activatePass(D, userId, Date.now() + PASS_PERIOD_MS);
        if (product.monthlyCredits) {
          await db.addCredits(D, userId, product.monthlyCredits, 'battlepass:initial', event.id);
        }
      }
      return;
    }
    case 'invoice.paid': {
      const inv = event.data.object;
      if (inv.billing_reason !== 'subscription_cycle') return; // first cycle handled at checkout
      const subId = inv.subscription;
      if (!subId) return;
      const sub = await stripe.subscriptions.retrieve(subId);
      const userId = sub.metadata?.userId;
      const product = PRODUCT_BY_KEY[sub.metadata?.productKey];
      if (!userId) return;
      await db.activatePass(D, userId, (sub.current_period_end || 0) * 1000 || Date.now() + PASS_PERIOD_MS);
      if (product?.monthlyCredits) {
        await db.addCredits(D, userId, product.monthlyCredits, 'battlepass:renewal', event.id);
      }
      return;
    }
    case 'customer.subscription.updated': {
      const sub = event.data.object;
      const userId = sub.metadata?.userId;
      if (!userId) return;
      const active = sub.status === 'active' || sub.status === 'trialing';
      await db.activatePass(D, userId, active ? (sub.current_period_end || 0) * 1000 : Date.now());
      return;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      const userId = sub.metadata?.userId;
      if (userId) await db.activatePass(D, userId, Date.now()); // expire now
      return;
    }
    default:
      return;
  }
}
