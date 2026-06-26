// Generation-only better-auth config. Mirrors the RUNTIME options in
// worker/auth.js so `@better-auth/cli generate` emits the correct schema.
// Uses an in-memory better-sqlite3 DB purely so the CLI can introspect; the
// Worker itself uses the kysely-d1 dialect against D1 (same SQLite DDL).
import { betterAuth } from 'better-auth';
import { SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';

export const auth = betterAuth({
  database: {
    dialect: new SqliteDialect({ database: new Database(':memory:') }),
    type: 'sqlite',
  },
  emailAndPassword: { enabled: true, requireEmailVerification: true },
  emailVerification: { sendOnSignUp: true },
  socialProviders: {
    google: { clientId: 'gen', clientSecret: 'gen' },
  },
  // Persist rate-limit counters in the DB — required on Workers, where the
  // in-memory store would reset on every per-request instance.
  rateLimit: { enabled: true, storage: 'database' },
});
