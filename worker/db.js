// D1 data-access for the application tables (raw prepared statements).
// better-auth owns user/session/account/verification; these are ours.

export async function creditBalance(db, userId) {
  const row = await db.prepare(
    'SELECT COALESCE(SUM(delta),0) AS bal FROM credit_ledger WHERE user_id = ?',
  ).bind(userId).first();
  return row ? Number(row.bal) : 0;
}

export async function getEntitlements(db, userId, now = epoch()) {
  const { results } = await db.prepare(
    'SELECT kind, item, expires_at FROM entitlements WHERE user_id = ?',
  ).bind(userId).all();
  const skins = [];
  let pass = null;
  for (const r of results || []) {
    if (r.kind === 'skin') skins.push(r.item);
    else if (r.kind === 'pass') pass = { item: r.item, expiresAt: r.expires_at };
  }
  const passActive = !!pass && (pass.expiresAt == null || Number(pass.expiresAt) > now);
  return { skins, passActive, passExpiresAt: pass?.expiresAt ?? null };
}

export async function getProfile(db, userId) {
  const [credits, ent] = await Promise.all([
    creditBalance(db, userId),
    getEntitlements(db, userId),
  ]);
  return { credits, ...ent };
}

// Upsert the user's best run (keep the maximum score).
export async function submitScore(db, userId, callsign, score, wave, combo) {
  const now = epoch();
  await db.prepare(
    `INSERT INTO leaderboard (user_id, callsign, best_score, best_wave, best_combo, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(user_id) DO UPDATE SET
       callsign   = excluded.callsign,
       best_wave  = MAX(best_wave,  excluded.best_wave),
       best_combo = MAX(best_combo, excluded.best_combo),
       best_score = MAX(best_score, excluded.best_score),
       updated_at = excluded.updated_at
     WHERE excluded.best_score >= leaderboard.best_score`,
  ).bind(userId, callsign, Math.floor(score), wave, combo, now).run();
}

export async function topScores(db, limit = 20) {
  const { results } = await db.prepare(
    `SELECT callsign, best_score AS score, best_wave AS wave
     FROM leaderboard ORDER BY best_score DESC, updated_at ASC LIMIT ?`,
  ).bind(limit).all();
  return results || [];
}

// Credit ledger. stripeEventId makes purchase grants idempotent.
export async function addCredits(db, userId, delta, reason, stripeEventId = null) {
  await db.prepare(
    'INSERT INTO credit_ledger (user_id, delta, reason, stripe_event_id, created_at) VALUES (?,?,?,?,?)',
  ).bind(userId, Math.floor(delta), reason, stripeEventId, epoch()).run();
}

// Spend credits if the balance covers it. Returns the new balance, or null if insufficient.
// Atomic: the balance is re-checked INSIDE the insert (single statement), so two
// concurrent spends can't both pass the check and double-spend (D1 serializes writes).
export async function spendCredits(db, userId, amount, reason) {
  const amt = Math.abs(Math.floor(amount));
  const res = await db.prepare(
    `INSERT INTO credit_ledger (user_id, delta, reason, stripe_event_id, created_at)
     SELECT ?1, ?2, ?3, NULL, ?4
     WHERE (SELECT COALESCE(SUM(delta),0) FROM credit_ledger WHERE user_id = ?1) >= ?5`,
  ).bind(userId, -amt, reason, epoch(), amt).run();
  const changes = res?.meta?.changes ?? 0;
  if (changes === 0) return null; // insufficient balance, or lost the race
  return await creditBalance(db, userId);
}

export async function grantSkin(db, userId, skin) {
  await db.prepare(
    `INSERT INTO entitlements (user_id, kind, item, expires_at, granted_at)
     VALUES (?, 'skin', ?, NULL, ?)
     ON CONFLICT(user_id, kind, item) DO NOTHING`,
  ).bind(userId, skin, epoch()).run();
}

export async function activatePass(db, userId, expiresAt) {
  await db.prepare(
    `INSERT INTO entitlements (user_id, kind, item, expires_at, granted_at)
     VALUES (?, 'pass', 'battlepass', ?, ?)
     ON CONFLICT(user_id, kind, item) DO UPDATE SET expires_at = excluded.expires_at`,
  ).bind(userId, expiresAt, epoch()).run();
}

// --- Stripe webhook idempotency ---
export async function eventAlreadyProcessed(db, eventId) {
  const row = await db.prepare('SELECT id FROM processed_stripe_events WHERE id = ?')
    .bind(eventId).first();
  return !!row;
}
export async function markEventProcessed(db, eventId, type) {
  await db.prepare(
    'INSERT OR IGNORE INTO processed_stripe_events (id, type, processed_at) VALUES (?,?,?)',
  ).bind(eventId, type, epoch()).run();
}

export function epoch() {
  return Date.now();
}
