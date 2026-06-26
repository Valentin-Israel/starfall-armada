# Deploying Starfall to Cloudflare → starfall.valentin.is

The whole product is **one Cloudflare Worker** with Static Assets:

- `./public` is served by Cloudflare's edge asset router (the game).
- `/api/*` is reserved for the Worker (`worker/index.js`) — empty today except
  `/api/health`, and where Phase 3 (auth + Stripe) will mount. See
  [`PHASE3-AUTH-PAYMENTS.md`](./PHASE3-AUTH-PAYMENTS.md).

Config lives in [`wrangler.jsonc`](../wrangler.jsonc).

---

## Recommended: deploy with OAuth (no token to share)

`wrangler login` authenticates via your browser against your Cloudflare account —
nothing secret is ever pasted into the repo or the environment.

```bash
npm install            # installs wrangler (pinned >= 4.20)
npx wrangler login     # opens a browser, OAuth into your Cloudflare account
npx wrangler deploy
```

On first deploy Cloudflare will:

1. Upload `./public` and publish the Worker `starfall-armada`.
2. Because `valentin.is` is an active zone in your account, attach the custom
   domain `starfall.valentin.is` — it **auto-creates the proxied DNS record and
   provisions the edge certificate**. No manual DNS.
3. Go live at **https://starfall.valentin.is** (allow a few minutes for the
   cert the very first time).

> ⚠️ `starfall.valentin.is` must **not** already have a conflicting CNAME record,
> or the custom-domain creation fails — delete any existing record for that exact
> hostname first.

Verify after deploy:

```bash
curl -sI https://starfall.valentin.is/icon.svg | grep -i content-type           # image/svg+xml
curl -s  https://starfall.valentin.is/api/health                                 # {"ok":true,...}
curl -sI https://starfall.valentin.is/manifest.webmanifest | grep -i content-type # application/manifest+json
```

---

## Alternative: API token (only for CI / non-interactive)

Do **NOT** put the token in the visible "Environment variables" panel — it is
plaintext and shared. Use a real secret store:

- **Locally:** `export CLOUDFLARE_API_TOKEN=…` in your own shell (never committed).
- **GitHub Actions:** add `CLOUDFLARE_API_TOKEN` as a *repository secret*.

Token permissions: the **"Edit Cloudflare Workers"** template **plus**
**Zone → DNS → Edit** on `valentin.is` (needed so the custom domain's DNS record
can be created). Then `npx wrangler deploy` picks the token up from the env.

---

## Local development

```bash
npm start        # zero-dependency static server → http://localhost:5173 (no wrangler needed)
npm run cf:dev   # wrangler dev — emulates the Worker + /api routes locally
npm run verify   # headless smoke test (drives a real run, checks console + icons)
```

## Updating the deployed site

```bash
npm run icons    # only if icons changed (also bump CACHE in public/sw.js!)
npx wrangler deploy
```
