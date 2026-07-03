// better-auth instance factory. On Workers, bindings/secrets live on `env`
// (not module scope), so we build per request. Uses the kysely-d1 dialect
// against D1 (the documented D1 path) + Google sign-in + Resend email.
import { betterAuth } from 'better-auth';
import { oneTimeToken } from 'better-auth/plugins/one-time-token';
import { D1Dialect } from 'kysely-d1';
import { Resend } from 'resend';

const FROM = 'Starfall <no-reply@mail.valentin.is>';

/**
 * @param {Record<string, any>} env  Worker env (DB binding + secrets)
 * @param {{ waitUntil?: (p: Promise<unknown>) => void }} [ctx]
 */
export function createAuth(env, ctx) {
  const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

  // Don't block the response on the email send (and it keeps sending after return).
  const send = (promise) => {
    if (!promise) return;
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(promise);
  };
  const sendEmail = (to, subject, html) => {
    if (!resend) return; // email not configured yet — auth still works for Google
    send(resend.emails.send({ from: FROM, to, subject, html }).catch(() => {}));
  };

  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL, // https://starfall.valentin.is
    database: {
      dialect: new D1Dialect({ database: env.DB }),
      type: 'sqlite',
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: async ({ user, url }) => {
        sendEmail(user.email, 'Reset your Starfall password',
          `<p>Reset your password:</p><p><a href="${url}">${url}</a></p>`);
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        sendEmail(user.email, 'Verify your Starfall account',
          `<p>Welcome, pilot. Verify your email to save your progress:</p>` +
          `<p><a href="${url}">${url}</a></p>`);
      },
    },
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
    // Brute-force protection. MUST use database storage on Workers: a fresh
    // per-request instance means the default in-memory counter never persists.
    // better-auth applies stricter built-in limits to sign-in/sign-up/reset.
    rateLimit: { enabled: true, storage: 'database' },
    // Native-app OAuth handoff: Google forbids OAuth in embedded WebViews
    // (403 disallowed_useragent), so the app signs in via the SYSTEM browser
    // and hands the session back through a short-lived one-time token
    // (generate in browser -> deep link starfall://auth -> verify in app).
    plugins: [oneTimeToken()],
  });
}
