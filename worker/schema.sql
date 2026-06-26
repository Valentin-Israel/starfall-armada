-- Starfall: Armada — D1 schema.
-- Paste this into the D1 "Console" tab (see docs/CONFIGURE.md §3c).
--
-- Section 1: better-auth core tables — generated verbatim by
--   `@better-auth/cli generate` against better-auth 1.6.x (do not hand-edit).
-- Section 2: application tables (leaderboard, credits, entitlements, fulfillment).

-- ============================================================
-- 1) better-auth core
-- ============================================================
create table "user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" integer not null, "image" text, "createdAt" date not null, "updatedAt" date not null);

create table "session" ("id" text not null primary key, "expiresAt" date not null, "token" text not null unique, "createdAt" date not null, "updatedAt" date not null, "ipAddress" text, "userAgent" text, "userId" text not null references "user" ("id") on delete cascade);

create table "account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" date, "refreshTokenExpiresAt" date, "scope" text, "password" text, "createdAt" date not null, "updatedAt" date not null);

create table "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" date not null, "createdAt" date not null, "updatedAt" date not null);

create index "session_userId_idx" on "session" ("userId");
create index "account_userId_idx" on "account" ("userId");
create index "verification_identifier_idx" on "verification" ("identifier");

-- ============================================================
-- 2) application tables
-- ============================================================

-- One best-run row per user; we keep the maximum score.
create table if not exists "leaderboard" (
  "user_id"    text primary key references "user" ("id") on delete cascade,
  "callsign"   text not null,
  "best_score" integer not null default 0,
  "best_wave"  integer not null default 1,
  "best_combo" integer not null default 1,
  "updated_at" integer not null            -- epoch millis
);
create index if not exists "leaderboard_score_idx" on "leaderboard" ("best_score" desc);

-- Owned cosmetic/premium entitlements: kind = 'skin' | 'pass'.
create table if not exists "entitlements" (
  "user_id"    text not null references "user" ("id") on delete cascade,
  "kind"       text not null,              -- 'skin' | 'pass'
  "item"       text not null,              -- skin id, or 'battlepass'
  "expires_at" integer,                    -- null = permanent; epoch millis for the pass
  "granted_at" integer not null,
  primary key ("user_id", "kind", "item")
);

-- Append-only credit ledger; balance = SUM(delta). Idempotent on stripe_event_id.
create table if not exists "credit_ledger" (
  "id"              integer primary key autoincrement,
  "user_id"         text not null references "user" ("id") on delete cascade,
  "delta"           integer not null,      -- + purchase, - spend
  "reason"          text not null,
  "stripe_event_id" text,                  -- set for purchases; unique to dedupe
  "created_at"      integer not null
);
create unique index if not exists "credit_ledger_event_idx"
  on "credit_ledger" ("stripe_event_id") where "stripe_event_id" is not null;
create index if not exists "credit_ledger_user_idx" on "credit_ledger" ("user_id");

-- Webhook idempotency: every processed Stripe event id is recorded once.
create table if not exists "processed_stripe_events" (
  "id"           text primary key,         -- Stripe event.id
  "type"         text not null,
  "processed_at" integer not null
);
