// Store catalog. Each product maps to a Stripe Price you create in the Stripe
// Dashboard (docs/CONFIGURE.md §5); paste its price_… id into the matching
// Worker secret/var (priceEnv). A product with no configured price id is simply
// hidden from the store, so you can launch with a subset.
//
// Pay-to-win is intentional: credits buy in-game power (continues, etc.);
// the battle pass grants a permanent starting perk + monthly credits.

export const PRODUCTS = [
  // --- One-time credit packs ---
  { key: 'credits_small',  label: 'Starter Credits',  kind: 'credits', mode: 'payment',
    credits: 1000,  priceEnv: 'STRIPE_PRICE_CREDITS_SMALL' },
  { key: 'credits_medium', label: 'Pilot Credits',    kind: 'credits', mode: 'payment',
    credits: 5500,  priceEnv: 'STRIPE_PRICE_CREDITS_MEDIUM' },
  { key: 'credits_large',  label: 'Armada Credits',   kind: 'credits', mode: 'payment',
    credits: 13000, priceEnv: 'STRIPE_PRICE_CREDITS_LARGE' },

  // --- One-time ship skins ---
  { key: 'skin_nebula',  label: 'Nebula Skin',  kind: 'skin', mode: 'payment',
    skin: 'nebula',  priceEnv: 'STRIPE_PRICE_SKIN_NEBULA' },
  { key: 'skin_inferno', label: 'Inferno Skin', kind: 'skin', mode: 'payment',
    skin: 'inferno', priceEnv: 'STRIPE_PRICE_SKIN_INFERNO' },
  { key: 'skin_void',    label: 'Void Skin',    kind: 'skin', mode: 'payment',
    skin: 'void',    priceEnv: 'STRIPE_PRICE_SKIN_VOID' },

  // --- Recurring battle pass ---
  { key: 'battlepass', label: 'Battle Pass', kind: 'subscription', mode: 'subscription',
    grantsPass: true, monthlyCredits: 3000, priceEnv: 'STRIPE_PRICE_BATTLEPASS',
    aliases: ['Starfall Battle Pass'] },
];

export const PRODUCT_BY_KEY = Object.fromEntries(PRODUCTS.map((p) => [p.key, p]));

// Resolve the live price id for a product from env (returns null if unset).
export const priceIdFor = (product, env) => (product?.priceEnv ? env[product.priceEnv] || null : null);

// Public catalog for the client, given a resolved { productKey: priceId } map.
export function publicCatalog(priceMap) {
  return PRODUCTS
    .filter((p) => priceMap[p.key])
    .map(({ key, label, kind, credits, skin, monthlyCredits }) => ({
      key, label, kind, credits, skin, monthlyCredits,
    }));
}

// Match active Stripe prices to products by PRODUCT NAME. Tolerant matching:
// case/whitespace insensitive, an optional "Starfall"-prefix on the Stripe
// name is ignored ("Starfall Battle Pass" → "Battle Pass"), and per-product
// `aliases` are accepted. Subscriptions must be recurring prices; one-time
// products must not be. Pure function — unit-testable without Stripe.
const normName = (s) => (s || '').trim().toLowerCase().replace(/^starfall[:\s-]+/, '');

export function matchPricesByName(products, stripePrices) {
  const map = {};
  for (const p of products) {
    const wanted = new Set([p.label, ...(p.aliases || [])].map(normName));
    const hit = stripePrices.find((pr) => {
      const prod = pr.product && typeof pr.product === 'object' ? pr.product : null;
      if (!prod || prod.active === false) return false;
      if (!wanted.has(normName(prod.name))) return false;
      return p.mode === 'subscription' ? !!pr.recurring : !pr.recurring;
    });
    if (hit) map[p.key] = hit.id;
  }
  return map;
}
