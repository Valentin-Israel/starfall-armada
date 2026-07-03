# Starfall — Cloudflare Dashboard Configuration Runbook

Click-by-click setup, done entirely in web dashboards (no local CLI). Every step
below was verified against the providers' live documentation (June 2026); each
section lists its sources at the end.

## Status

- **Phase 1 — Deploy + custom domain:** ✅ **DONE & LIVE** at <https://starfall.valentin.is>
  (Git-connected Workers build deploys on every push to the production branch).
  Sections 1–2 are kept below for reference / re-deploys.
- **Phase 3 — Accounts, cloud leaderboard & payments:** follow sections 3–6 to set
  up the D1 database, Worker secrets, Google OAuth, Stripe, and Resend. The matching
  application code is planned in [`PHASE3-AUTH-PAYMENTS.md`](./PHASE3-AUTH-PAYMENTS.md).

> The Worker the dashboard created is named **`informatik-10a`** (after the repo).
> That's cosmetic — the domain and `/api` work. Wherever a section says
> `starfall-armada`, use **your actual Worker name** (`informatik-10a`).

## Secrets & IDs you'll collect (set on the Worker → Settings → Variables and Secrets)

| Name | Type | From |
|---|---|---|
| `BETTER_AUTH_URL` | Text | `https://starfall.valentin.is` |
| `BETTER_AUTH_SECRET` | Secret | generate 32+ random chars |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Secret | Google Cloud (§4) |
| `RESEND_API_KEY` | Secret | Resend (§6) |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Secret | Stripe (§5) |

Key URLs the code uses: Google callback `https://starfall.valentin.is/api/auth/callback/google`,
Stripe webhook `https://starfall.valentin.is/api/stripe/webhook`.

---

## Table of contents

1. Deploy starfall-armada to Cloudflare Workers via Git (Workers Builds) — click-by-click — ✅ done
2. Attach custom domain starfall.valentin.is to Worker "starfall-armada" (Cloudflare dashboard) — ✅ done
3. Cloudflare Dashboard: Set up D1 + Bindings + Variables/Secrets for the starfall-armada Worker
4. Create a Google OAuth 2.0 Web Client for Starfall Armada (better-auth)
5. Stripe Dashboard Setup for Starfall Armada — Click-by-Click (verified June 2026)
6. Resend: Create RESEND_API_KEY and Verify a Sending Domain (Cloudflare DNS) — Click-by-Click

---

> ✅ **Already completed — the game is live. Kept for reference / future re-deploys.**

## Deploy `starfall-armada` from GitHub via Workers Builds (no local CLI)

This connects the repo `Valentin-Israel/informatik-10a` to a Cloudflare **Worker** (not Pages). Cloudflare runs `npx wrangler deploy` in the cloud on every push; `wrangler deploy` reads your `wrangler.jsonc`, uploads `./public` as Static Assets, and attaches the `starfall.valentin.is` custom domain. Everything below is done in web dashboards.

### A. Connect the GitHub repository

1. Go to the Cloudflare dashboard → left sidebar **Compute (Workers)** (older accounts: **Workers & Pages**).
2. Click **Create application** (button may read **Create** → then the **Workers** tab).
3. Find the **Import a repository** card and click **Get started** next to it.
4. Pick your **Git account**. If GitHub is not yet connected, click **GitHub** → **Connect GitHub** / **Add account**. This opens GitHub's install screen for the **Cloudflare Workers and Pages** GitHub App.
   - On GitHub, choose your personal account (`Valentin-Israel`).
   - Under **Repository access**, select **Only select repositories**, choose **`informatik-10a`**, then click **Install & Authorize** (you must be the repo owner / org admin to authorize).
5. Back in Cloudflare, in the repository list select **`Valentin-Israel/informatik-10a`** and click **Begin setup** (or **Import**).

### B. Configure the build & deploy

You land on the **Set up builds** / project configuration screen. Set:

- **Worker name**: leave/enter **`starfall-armada`**. CRITICAL: this must exactly match `"name": "starfall-armada"` in `wrangler.jsonc`, or the build is rejected.
- **Branch** (production branch / "Git branch"): set to **`claude/space-shooter-game-zy1003`**. (It defaults to the repo's default branch, so you must change it.)
- **Root directory**: leave **empty** / `/`. `wrangler.jsonc` is at the repo root, so no monorepo root override is needed.
- **Build command**: leave **blank**. This is a static `./public` + plain JS Worker — there is no framework build step. (A build command is only needed for frameworks like Next.js/Astro.)
- **Deploy command**: leave the default **`npx wrangler deploy`**. Do NOT override it. Wrangler auto-reads `wrangler.jsonc` at the root; no `-c` flag needed.

Click **Save and Deploy** (label may be **Create and deploy**). Cloudflare runs the first build.

> Note on auto-generated PR: With autoconfig GA (Feb 2026), connecting via the dashboard with the default `npx wrangler deploy` can open an automatic configuration pull request. Your repo already has a complete `wrangler.jsonc`, so there's nothing to generate — if a PR appears it will be a no-op/near-empty; you can ignore or close it. Keeping the deploy command as `npx wrangler deploy` (not a custom command) is what you want.

### C. What happens automatically on that first deploy

- `npx wrangler deploy` reads `wrangler.jsonc`, bundles `./worker/index.js`, and **uploads everything in `./public` as Static Assets** in the same step — no separate asset upload. ("During deployment, Wrangler automatically uploads the files from this directory to Cloudflare's infrastructure.")
- Because `routes` has `{ "pattern": "starfall.valentin.is", "custom_domain": true }`, the deploy **creates the proxied DNS record on the `valentin.is` zone and issues the edge certificate automatically** — no manual DNS. (`valentin.is` is already an active zone, which is the requirement.)
  - Gotcha: this fails if a **conflicting CNAME for `starfall.valentin.is` already exists** in the zone, or if the hostname is already a Custom Domain on another Worker. Delete any such record first (Dashboard → `valentin.is` → **DNS** → **Records**).
- The Worker is also reachable at its `*.workers.dev` URL once deployed.

### D. Add bindings, secrets, and the plain var (after first deploy)

The D1 binding `DB` should be declared in `wrangler.jsonc` (`d1_databases` with `binding: "DB"`) and the database created first (Dashboard → **Storage & Databases** → **D1** → **Create**). Secrets are NOT in `wrangler.jsonc` — add them on the Worker:

1. Dashboard → **Compute (Workers)** → select **starfall-armada** → **Settings** → **Variables and Secrets**.
2. Add the plain variable: name `BETTER_AUTH_URL`, value `https://starfall.valentin.is` (type: **Text**).
3. Add as **Secret** (type: **Secret**), one each: `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. Click **Deploy** to apply.

> Important: these are **runtime** secrets (used by the Worker), set on the Worker — NOT the same as **Build variables and secrets** under Settings → **Builds** (which are only available during the build). For this project they go on the Worker as runtime secrets.
>
> Caveat: `wrangler deploy` can overwrite dashboard-set plain vars on the next deploy unless `keep-vars` is used. Secrets are never deleted by a deploy. To be safe, prefer declaring non-secret `vars` (like `BETTER_AUTH_URL`) in `wrangler.jsonc` so the CI deploy is the source of truth, and keep only secrets in the dashboard.

Use these once deployed: Google OAuth callback `https://starfall.valentin.is/api/auth/callback/google`; Stripe webhook `https://starfall.valentin.is/api/stripe/webhook`.

### E. Re-deploys on every push

Once connected, **every push to `claude/space-shooter-game-zy1003`** triggers a new build that runs `npx wrangler deploy` and ships automatically. No further clicks. View runs at Worker → **Settings** → **Builds** (build history/logs).

To enable PR previews from other branches: Worker → **Settings** → **Builds** → **Branch control**, enable **non-production branch builds**. Those run `npx wrangler versions upload` (preview URL, posted as a PR comment) instead of a full deploy. Optional; not required for this single-branch setup.

### Build-environment gotchas

- **Dependencies install automatically.** The build image (default Node 22.16.0 / npm 10.9.2) runs an install step before the deploy command, installing **all dependencies including `devDependencies`** (so `wrangler` from devDependencies is available to `npx wrangler deploy`). Package manager is picked from your lockfile.
- **Heavy devDependencies (e.g. `playwright-core`) will be installed** during every build, slowing it down. They don't break the deploy, but to skip them set the build variable `SKIP_DEPENDENCY_INSTALL=1` and supply your own install command (e.g. `npm ci --omit=optional`) — only do this if build time becomes a problem. Pin Node via `.nvmrc`/`.node-version` if needed.
- Confirm `wrangler` (and any deploy-time deps) are in `package.json` so the cloud build can run `npx wrangler deploy`; if `wrangler` isn't a dependency, `npx` will fetch the latest at build time (works, but non-pinned).
- Keep **Root directory empty** — this is not a monorepo and `wrangler.jsonc` is at the root. Setting a root dir would break detection.

<details><summary>Sources for this section (verified high confidence)</summary>

- <https://developers.cloudflare.com/workers/get-started/dashboard/>
- <https://developers.cloudflare.com/workers/ci-cd/builds/>
- <https://developers.cloudflare.com/workers/ci-cd/builds/configuration/>
- <https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/>
- <https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/>
- <https://developers.cloudflare.com/workers/ci-cd/builds/build-image/>
- <https://developers.cloudflare.com/changelog/post/2026-02-25-wrangler-autoconfig-ga/>
- <https://developers.cloudflare.com/workers/static-assets/>
- <https://developers.cloudflare.com/workers/configuration/routing/custom-domains/>
- <https://developers.cloudflare.com/workers/wrangler/configuration/>
- <https://developers.cloudflare.com/workers/wrangler/commands/workers/>
- <https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/>
</details>

---

> ✅ **Already completed — the game is live. Kept for reference / future re-deploys.**

## Attach the custom domain `starfall.valentin.is` to the Worker `starfall-armada`

### First: does the `wrangler.jsonc` route already do this?

Yes — in principle. Your `wrangler.jsonc` declares:

```jsonc
"routes": [{ "pattern": "starfall.valentin.is", "custom_domain": true }]
```

Per Cloudflare docs, when you deploy a Worker whose config contains a `custom_domain: true` route, Wrangler **creates the Custom Domain automatically** (it auto-creates the proxied DNS record and provisions the certificate). So if `starfall-armada` was deployed *with this config and the deploy succeeded*, the dashboard will already show `starfall.valentin.is` attached under the Worker's domains, and you do **not** need to add it manually.

But you said you do everything in web dashboards (no CLI / no `wrangler deploy`). If the Worker was created/deployed in the dashboard without that deploy step actually running, the route in the file is just *declared intent* — it is not applied until a deploy processes it. In that case, attach it manually below. **Either way, first check whether it's already attached** (step set A), and only add it if it isn't (step set B).

> Note on docs vs. live UI: Cloudflare shipped a dedicated **Domains** tab in the Workers dashboard on **2026-05-14** (after this you can manage all routing from `Workers & Pages → select Worker → Domains`). The canonical custom-domains documentation still describes the older **Settings → Domains & Routes** path. Both reach the same place. Steps below give the documented path first, with the new Domains-tab equivalent noted.

---

### A) Check whether it's already attached

1. Go to the Cloudflare dashboard at **dash.cloudflare.com** and select your account.
2. In the left sidebar, click **Workers & Pages**.
3. On the **Overview** tab, click the Worker named **starfall-armada**.
4. Open the Worker's **Settings** tab, then the **Domains & Routes** section. *(New UI: click the dedicated **Domains** tab instead.)*
5. Look for **starfall.valentin.is** in the list.
   - If it's listed as a **Custom Domain** with status **Active** → done, nothing to do.
   - If it's **not** listed (or shows an error/pending forever) → continue to set B.

---

### B) Add the custom domain manually

**Pre-flight — remove any conflicting DNS record (required):**

Cloudflare cannot create a Custom Domain on a hostname that already has a **CNAME** DNS record. Since `valentin.is` is already an active zone, check for a leftover record on the `starfall` subdomain first:

1. In the dashboard sidebar, open the **valentin.is** zone (from **Account Home**, click the **valentin.is** website).
2. Go to **DNS** → **Records**.
3. If there is any existing record for the name **starfall** (especially a **CNAME**, but also a stray A/AAAA), click **Edit** → **Delete** on it. Leave the rest of the zone untouched.

**Add the Custom Domain:**

1. In the left sidebar, click **Workers & Pages**.
2. On the **Overview** tab, click the Worker **starfall-armada**.
3. Open **Settings** → **Domains & Routes**. *(New UI: the **Domains** tab.)*
4. Click **Add**, then choose **Custom Domain**.
5. In the domain field, enter exactly:
   ```
   starfall.valentin.is
   ```
6. Click **Add Custom Domain**.

**What Cloudflare does automatically (no manual DNS/cert work):**

- Creates the DNS record pointing the hostname at your Worker, **proxied** (orange cloud) — you do not add this record yourself.
- Issues an Advanced Certificate (edge TLS cert) for `starfall.valentin.is` on the `valentin.is` zone.
- The domain will show **Initializing / Pending** while the certificate provisions; allow a few minutes (occasionally longer) before it flips to **Active**. Brief 5xx errors during this window are normal and resolve on their own.

---

### After it's Active

- `https://starfall.valentin.is` will serve the Worker.
- Because your `wrangler.jsonc` has `run_worker_first: ["/api/*"]`, the auth/Stripe routes resolve correctly under this domain:
  - Google OAuth callback: `https://starfall.valentin.is/api/auth/callback/google`
  - Stripe webhook: `https://starfall.valentin.is/api/stripe/webhook`
  - `BETTER_AUTH_URL=https://starfall.valentin.is`

### Quick troubleshooting

- **"You cannot create a Custom Domain on a hostname with an existing CNAME DNS record"** → the pre-flight delete in set B was missed; go to **valentin.is → DNS → Records**, delete the `starfall` record, retry.
- **Stuck Pending/Initializing for a long time** → leave it ~15 min; if still stuck, remove the custom domain and re-add it. The cert is auto-managed, so there is nothing for you to upload.

<details><summary>Sources for this section (verified high confidence)</summary>

- <https://developers.cloudflare.com/workers/configuration/routing/custom-domains/ — 'Set up a Custom Domain in the dashboard': Workers & Pages > Overview > select Worker > Settings > Domains & Routes > Add > Custom Domain > enter domain > Add Custom Domain; 'Cloudflare will create a new DNS record for you'; warning: 'You cannot create a Custom Domain on a hostname with an existing CNAME DNS record or on a zone you do not own.'; certificates section: creating a Custom Domain generates an Advanced Certificate on the target zone.>
- <https://developers.cloudflare.com/workers/configuration/routing/custom-domains/ — 'Set up a Custom Domain in your Wrangler configuration file' and 'Migrate from Routes via Wrangler': add custom_domain=true under routes, then 'Run npx wrangler deploy to create the Custom Domain your Worker will run on.'>
- <https://developers.cloudflare.com/workers/wrangler/configuration/ — Custom Domains route config: pattern (required) + custom_domain boolean (defaults false).>
- <https://developers.cloudflare.com/changelog/post/2026-05-14-domains-tab/ — 'New Domains tab in the Workers dashboard' (May 14, 2026): dedicated Domains tab; 'go to Workers & Pages, select a Worker, and open the Domains tab'; manage all routing, add an existing domain, toggle workers.dev/Preview URLs.>
- <https://developers.cloudflare.com/workers-ai/guides/tutorials/build-a-retrieval-augmented-generation-ai/ — note that first-time pushes can return 523 errors while DNS is propagating, resolving after about a minute.>
</details>

---

## Cloudflare Dashboard Setup for `starfall-armada` (verified June 2026)

All steps are click-by-click in the Cloudflare dashboard at https://dash.cloudflare.com using the current UI labels. No CLI required.

> Important precedence note up front: `wrangler.jsonc` in this repo already declares `routes`, `assets`, etc., and you will add `[[d1_databases]]` to it. On any **deploy from Wrangler / a connected Git build, the Wrangler config file is the source of truth and overrides dashboard-set variables** (`vars`) the next time it deploys, unless `keep_vars` is set to `true`. **Secrets are never deleted by a deploy.** So decide one of two approaches and stick to it (details in section 2).

---

### (a) Create a D1 SQL database

1. In the Cloudflare dashboard, in the left sidebar open **Storage & Databases**, then select **D1 SQL Database**. (Direct link: https://dash.cloudflare.com → Storage & Databases → D1 SQL Database.)
2. Select **Create Database** (also shown as **Create**).
3. Under **Database name**, enter `starfall-db`.
4. (Optional) Set a **Location hint** — for Munich/EU operations pick the Western Europe / Europe option so the primary lands in the EU.
5. Select **Create**.

**Where the database ID is shown:** After creation you land on the database's page. Open the database from D1 SQL Database, and on its overview/**Settings** area Cloudflare displays the **Database ID** (a UUID like `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`) along with the **Database name**. Copy this ID — you need it for the `wrangler.jsonc` `[[d1_databases]]` block. (Note: the dashboard does not surface the ID during the create dialog itself; it appears on the database page after creation.)

---

### (b) Bind the database to the Worker with variable name `DB`

You have two valid methods. Pick ONE.

**Method 1 — declare it in `wrangler.jsonc` (recommended, since this repo already deploys from a Wrangler config):**

Add this block to the existing `wrangler.jsonc` (alongside `name`, `main`, `assets`, `routes`):

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "starfall-db",
    "database_id": "PASTE-THE-DATABASE-ID-HERE"
  }
]
```

- `binding` must be exactly `DB` — this is what the code reads as `env.DB`.
- On the next deploy this binding is applied automatically.

**Method 2 — bind via the dashboard:**

1. In the left sidebar open **Compute (Workers)** / **Workers & Pages**, then select the **`starfall-armada`** Worker.
2. Select **Settings**.
3. Scroll to **Bindings** and select **Add binding** (shown as **Add**).
4. Choose **D1 database**.
5. Under **Variable name**, enter `DB`.
6. Under **D1 database**, select **`starfall-db`** from the dropdown.
7. Select **Deploy** to apply.

**Which wins?** If the SAME binding is defined in both the Wrangler config file and the dashboard, the **Wrangler config file wins on deploy** — a `wrangler deploy` (or connected Git build) reconciles the Worker to its config and will remove/override dashboard-only bindings that aren't in the file. Since this project deploys from `wrangler.jsonc`, prefer **Method 1** so the binding survives every deploy. Do not split: don't bind `DB` in the dashboard while also having it in the file with a different database.

---

### (c) Run SQL in the D1 Console to create tables / run migrations

1. Open **Storage & Databases → D1 SQL Database**, then select the **`starfall-db`** database.
2. Select the **Console** tab.
3. Paste your `CREATE TABLE ...` statements (and any seed `INSERT`s / migration SQL) into the editor. You can paste multiple statements separated by `;`.
4. Select **Execute** to run them against the (remote, production) database.
5. To verify, select the **Tables** tab and pick a table to view its rows.

This Console runs against the live remote database directly — there is no separate "apply to production" step. (CLI equivalent, for reference only, is `wrangler d1 execute starfall-db --remote --file=./schema.sql`.)

---

### (d) Add Variables and Secrets to the Worker

1. In **Compute (Workers)** / **Workers & Pages**, select the **`starfall-armada`** Worker.
2. Select **Settings**.
3. Find the **Variables and Secrets** section and select **Add**.
4. Choose a **Type**:
   - **Text** (plaintext, readable later) — use for non-sensitive config.
   - **Secret** (encrypted, write-only) — use for all credentials/keys.
5. Enter the **Variable name** and **Value**.
6. (Optional) Select **Add variable** to add more in the same save.
7. Select **Deploy** to apply your changes.

**Set these for `starfall-armada`:**

| Variable name | Type |
|---|---|
| `BETTER_AUTH_URL` = `https://starfall.valentin.is` | **Text** |
| `BETTER_AUTH_SECRET` | **Secret** |
| `GOOGLE_CLIENT_ID` | **Secret** |
| `GOOGLE_CLIENT_SECRET` | **Secret** |
| `RESEND_API_KEY` | **Secret** |
| `STRIPE_SECRET_KEY` | **Secret** |
| `STRIPE_WEBHOOK_SECRET` | **Secret** |

**Behavior to know:**
- **A deploy is required.** Adding or editing a variable/secret only takes effect after you select **Deploy**.
- **Secrets are write-only.** After saving, the value is hidden in both the dashboard and Wrangler — you cannot read it back, only overwrite (re-add with the same name) or delete it.
- **Deploy precedence:** A later `wrangler deploy` from the repo will **override dashboard-set plaintext `vars`** unless `keep_vars: true` is set in the Wrangler config. **Secrets are never deleted by a deploy**, so it is safe to manage the six secrets in the dashboard. For `BETTER_AUTH_URL` (a plaintext var), to avoid it being wiped on the next deploy, either set it via the dashboard **and** add `"keep_vars": true` to `wrangler.jsonc`, or instead declare it in `wrangler.jsonc` under `"vars": { "BETTER_AUTH_URL": "https://starfall.valentin.is" }` (preferred for this project).

---

### Related URLs to configure after the above
- Google OAuth redirect/callback URL (in Google Cloud Console → OAuth client): `https://starfall.valentin.is/api/auth/callback/google`
- Stripe webhook endpoint (in Stripe Dashboard → Developers → Webhooks): `https://starfall.valentin.is/api/stripe/webhook` — the resulting signing secret goes into `STRIPE_WEBHOOK_SECRET`.

<details><summary>Sources for this section (verified high confidence)</summary>

- <https://developers.cloudflare.com/d1/get-started/>
- <https://developers.cloudflare.com/workers/configuration/environment-variables/>
- <https://developers.cloudflare.com/workers/configuration/secrets/>
- <https://developers.cloudflare.com/workers/wrangler/configuration/>
- <https://developers.cloudflare.com/workers/wrangler/commands/workers/>
- <https://developers.cloudflare.com/pages/functions/bindings/>
- <https://developers.cloudflare.com/d1/tutorials/build-an-api-to-access-d1/>
- <https://developers.cloudflare.com/workers/local-development/local-explorer/>
</details>

---

## Google OAuth 2.0 Web Client — Setup for `starfall.valentin.is`

This produces the `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` that the Worker expects. All steps are click-by-click in the web console, using the current (2025/2026) **Google Auth Platform** UI (Google renamed the old "OAuth consent screen" area to "Google Auth Platform").

> What better-auth needs: the callback path is **fixed** at `/api/auth/callback/google` (relative to `BETTER_AUTH_URL`). So the production redirect URI is exactly `https://starfall.valentin.is/api/auth/callback/google`. Get this character-for-character right or you get `redirect_uri_mismatch`.

### 1. Create or select a project
1. Go to **https://console.cloud.google.com**, sign in with the Google account that should own this app.
2. Click the **project picker** (the dropdown next to the "Google Cloud" logo in the top bar).
3. Click **NEW PROJECT** (top-right of the dialog).
4. **Project name**: `Starfall Armada` (or any name). Leave **Organization**/**Location** as default unless you have a Workspace org. Click **CREATE**.
5. Wait for the creation notification, then make sure the **project picker** shows `Starfall Armada` (click it and select the project if not).

### 2. Configure the Google Auth Platform (consent screen) — first time only
1. In the left hamburger menu (☰), go to **APIs & Services** → **OAuth consent screen**. (This now opens the **Google Auth Platform**. Direct link: `https://console.cloud.google.com/auth/overview`.)
2. If the project has never been configured, you'll see a **Google Auth Platform** intro page. Click **Get started**.
3. The **Get started** wizard is a single page with stepper sections. Fill them in:
   - **App Information** → **App name**: `Starfall Armada`. **User support email**: pick your own email (e.g. `support@valentin.is`) from the dropdown. Click **Next**.
   - **Audience** → select **External**. Click **Next**. (External = any Google account can sign in once published. "Internal" only exists if you're inside a Google Workspace org and would limit sign-in to org members.)
   - **Contact Information** → enter a developer contact **Email address** (e.g. `support@valentin.is`). Click **Next**.
   - **Finish** → tick **I agree to the Google API Services: User Data Policy**, click **Continue**, then **Create**.

### 3. Add scopes (Data Access)
1. In the **Google Auth Platform** left nav, click the **Data Access** tab.
2. Click **Add or remove scopes**.
3. In the panel, tick these three (they're in the default Google list — you can filter by typing in the search box):
   - `openid`
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
4. Click **Update**, then **Save**.

> These three are non-sensitive scopes, so they do **not** trigger Google's app-verification review. better-auth only needs email + profile + openid for sign-in.

### 4. Add test users OR publish
While in **Testing** mode, only listed test users can sign in; everyone else gets `access_blocked`.
- **For dev/early use (recommended to start):** In the **Audience** tab, under **Test users**, click **Add users**, enter the Google emails that will sign in, click **Save**.
- **To go live publicly:** In the **Audience** tab, find **Publishing status: Testing** and click **Publish app** → confirm. With only the three non-sensitive scopes above, no verification submission is required to publish.

### 5. Create the OAuth client (Web application)
1. Left menu (☰) → **APIs & Services** → **Credentials**. (Or in Google Auth Platform, click the **Clients** tab.)
2. Click **+ Create credentials** (top) → **OAuth client ID**. (In the Clients tab the button is **Create client**.)
3. **Application type**: select **Web application**.
4. **Name**: `Starfall Armada Web` (internal label only).
5. **Authorized JavaScript origins** → click **+ Add URI** and add:
   - `https://starfall.valentin.is`
   - `http://localhost:8787` (Wrangler dev default; add `http://localhost:3000` too if you run the dev server there)
6. **Authorized redirect URIs** → click **+ Add URI** and add the exact callback paths:
   - `https://starfall.valentin.is/api/auth/callback/google`
   - `http://localhost:8787/api/auth/callback/google` (match whatever port/host your local `BETTER_AUTH_URL` uses)
7. Click **CREATE**.

### 6. Copy the credentials → Worker secrets
1. A dialog **OAuth client created** appears showing **Your Client ID** and **Your Client secret**.
2. Copy **Client ID** → this is your `GOOGLE_CLIENT_ID`.
3. Copy **Client secret** → this is your `GOOGLE_CLIENT_SECRET`. **Copy it now.** As of 2025 Google hashes client secrets server-side; after you close this dialog the console only shows the last 4 characters and you can never view the full secret again (you'd have to rotate it).
   - You can also click **Download JSON** to keep a copy.
4. Add both to the Worker in the Cloudflare dashboard: **Workers & Pages** → `starfall-armada` → **Settings** → **Variables and Secrets** → **Add** → type **Secret**, name `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, paste the values, **Deploy**. (These pair with the already-set `BETTER_AUTH_URL=https://starfall.valentin.is`.)

> To edit a client's URIs later (e.g. add localhost): **APIs & Services** → **Credentials** → under **OAuth 2.0 Client IDs** click the client name (pencil icon) → edit origins/redirect URIs → **SAVE**.

### Common pitfall: `redirect_uri_mismatch`
This error means the redirect URI sent by better-auth does **not** byte-for-byte match any **Authorized redirect URI** on the client. Checklist:
- The URI must be **exactly** `https://starfall.valentin.is/api/auth/callback/google` — no trailing slash, correct scheme (`https`, not `http`), correct host, exact path. Google does exact-string matching (it ignores nothing).
- It belongs in **Authorized redirect URIs**, not Authorized JavaScript origins (origins are scheme+host only, no path).
- `BETTER_AUTH_URL` must equal `https://starfall.valentin.is` (no trailing slash). better-auth builds the callback as `BETTER_AUTH_URL + /api/auth/callback/google`; a mismatch here is the #1 cause in production (it can otherwise default to localhost).
- For local dev, the localhost redirect URI must match your dev port exactly (e.g. `http://localhost:8787/...`).
- After editing URIs in the console, changes are usually instant but can take a few minutes to propagate — retry sign-in after ~5 min if it still mismatches.

<details><summary>Sources for this section (verified high confidence)</summary>

- <https://support.google.com/cloud/answer/6158849 — Google Cloud Console Help: Setting up OAuth 2.0 (Credentials → Create Credentials → OAuth client ID → Web application; Authorized JavaScript origins and redirect URI rules; Client secret shown once / hashed as of 2025)>
- <https://support.google.com/cloud/answer/10311615 — Google Cloud Help: Google Auth Platform branding/audience (Branding, Audience, Clients, Data Access tabs; User type External; Testing vs In production; test users)>
- <https://support.google.com/cloud/answer/15549049 — Google Cloud Help: Manage OAuth App Branding (Google Auth Platform rename, verification flow)>
- <https://developers.google.com/workspace/guides/configure-oauth-consent — Google for Developers: Configure the OAuth consent screen and choose scopes (Audience user type, Data Access → Add or remove scopes)>
- <https://developers.google.com/identity/protocols/oauth2/scopes — OAuth 2.0 Scopes for Google APIs (openid, userinfo.email, userinfo.profile)>
- <https://www.better-auth.com/docs/authentication/google — Better Auth Google provider docs (callback path /api/auth/callback/google, GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET env vars, baseURL to avoid redirect_uri_mismatch)>
- <https://var.gg/en/blog/gcp-oauth-consent-client-id — GCP OAuth Consent Screen + Client ID 2026 New UI walkthrough (Get started wizard with 4 stepper sections; /auth/clients/create flow; Web Application selection)>
</details>

---

## Stripe setup for `starfall-armada` (all in the Stripe Dashboard)

Product model: one-time purchases (credit packs / ship skins) **and** a recurring "Battle Pass" subscription. You'll create one one-time Price and one recurring Price, plus the webhook.

> **Test mode vs. Live mode — read this first.** Everything below exists twice: once in **test mode** and once in **live mode**. They have completely separate keys, products, prices, and webhooks. The toggle is in the **top-right of the Dashboard** (the **Test mode** switch / sandbox selector). Build and test in test mode first, then redo Products + Webhook in live mode and swap the live keys into the Worker before going live. Test keys start with `sk_test_` / `pk_test_`; live keys with `sk_live_` / `pk_live_`. Price IDs (`price_...`) created in test mode do **not** work in live mode — you must recreate the products there and use the new IDs.

---

### 1. Get the API keys → `STRIPE_SECRET_KEY`

1. Sign in at **dashboard.stripe.com**.
2. Make sure the **Test mode** toggle (top-right) is **ON** while developing.
3. Click **Developers** (top-right of the Dashboard), then the **API keys** tab. (Direct: `https://dashboard.stripe.com/test/apikeys` for test, `https://dashboard.stripe.com/apikeys` for live.)
4. Under **Standard keys** you'll see two keys:
   - **Publishable key** — `pk_test_...` (safe to expose; goes in front-end / client code, not a secret).
   - **Secret key** — `sk_test_...` → **this is your `STRIPE_SECRET_KEY`.**
5. In **test mode** the secret key is shown directly — click it to copy. In **live mode**, click the overflow menu **(⋯)** next to the key → **Reveal live key**, click the value to copy, then **Hide live key**. (Live secret keys can only be revealed/copied right after creation — if you lose it you must roll/regenerate.)
6. Put the value into the Worker secret named **`STRIPE_SECRET_KEY`**. (Do NOT use the publishable key here; only the `sk_...` secret key.)

> Ignore "Restricted keys" (`rk_...`) — not needed for this setup.

---

### 2. Create Products + Prices

The product catalog is under **More** → **Product catalog** (direct: `https://dashboard.stripe.com/test/products`).

**A. One-time Price (credit pack / ship skin)**
1. **More** → **Product catalog** → click **+ Add product**.
2. **Name**: e.g. `Credit Pack — 1000` (or `Nova Ship Skin`). Optionally add a **Description** / **Image**.
3. Under **Pricing**, keep pricing model **Flat rate**.
4. Set the **Amount** and currency (**USD**).
5. Set the billing toggle to **One time**.
6. Click **Add product** (saves the product + price).
7. You land on the product detail page. Under the **Pricing** section, each price row has its **Price ID** (`price_...`). Click the **copy** icon next to it. **This `price_...` goes into the Worker code** (the one-time/credit-pack price constant).

**B. Recurring Price (Battle Pass, monthly)**
1. **More** → **Product catalog** → **+ Add product**.
2. **Name**: `Battle Pass`.
3. Pricing model **Flat rate**, **Amount** + **USD**.
4. Set the billing toggle to **Recurring**, then **Billing period** = **Monthly**.
5. Click **Add product**.
6. On the product detail page, under **Pricing**, copy this price's **Price ID** (`price_...`). **This goes into the Worker code** as the Battle Pass / subscription price constant.

> You can confirm/copy IDs anytime: **Product catalog** → click the product → **Pricing** section shows each `price_...` (and the page shows the product's `prod_...`). The Worker uses the **`price_...`** IDs, not `prod_...`.

---

### 3. Create the webhook endpoint → `STRIPE_WEBHOOK_SECRET`

Go to **Developers** → **Webhooks** (direct: `https://dashboard.stripe.com/test/webhooks`). Stripe has rolled out a newer "Workbench / Event destinations" flow; the older "Add endpoint" flow may still appear. Both are covered.

**Current flow (Event destinations / Workbench):**
1. Click **Create an event destination** (a.k.a. **Add destination**).
2. Choose scope **Your account**.
3. **Select event types** — check these boxes:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
4. Click **Continue**.
5. Destination type: **Webhook endpoint** → **Continue**.
6. **Endpoint URL**: `https://starfall.valentin.is/api/stripe/webhook`
7. (Optional) Add a **Description** (e.g. `Starfall worker`). Save / **Create**.

**Legacy flow (if you see it instead):**
1. On the **Webhooks** page click **Add endpoint**.
2. **Endpoint URL**: `https://starfall.valentin.is/api/stripe/webhook`
3. Under **Select events**, add the five events listed above.
4. Click **Add endpoint**.

**Get the signing secret:**
1. After creating it, open the endpoint from the **Webhooks** list.
2. Find **Signing secret** → click **Click to reveal** (or **Reveal**). It looks like `whsec_...`.
3. Copy it into the Worker secret named **`STRIPE_WEBHOOK_SECRET`**.

> The signing secret is **per-endpoint and per-mode**. The test-mode endpoint and the live-mode endpoint each have their own different `whsec_...`. When you go live, create the endpoint again in live mode (same URL) and copy that live `whsec_...` into the live `STRIPE_WEBHOOK_SECRET`.

---

### 4. (Optional) Local testing with the Stripe CLI

If you ever test the webhook against a local server instead of the deployed Worker, the **Stripe CLI prints its own separate `whsec_...`** — distinct from any Dashboard endpoint secret:

```bash
stripe listen --forward-to localhost:8787/api/stripe/webhook
```

On start it prints a line like:

```
Ready! Your webhook signing secret is whsec_xxxxxxxx (^C to quit)
```

Use **that** `whsec_...` as `STRIPE_WEBHOOK_SECRET` **only** for local runs. It is not the same as, and does not replace, the Dashboard endpoint's signing secret used by the deployed Worker at `starfall.valentin.is`.

---

### Worker secrets/vars this produces (for reference)
- **`STRIPE_SECRET_KEY`** = the `sk_test_...` (later `sk_live_...`) Secret key from step 1.
- **`STRIPE_WEBHOOK_SECRET`** = the `whsec_...` from step 3 (Dashboard endpoint), per mode.
- The two **`price_...`** IDs from step 2 go into the **Worker code** (not secrets).

<details><summary>Sources for this section (verified high confidence)</summary>

- <https://docs.stripe.com/keys>
- <https://docs.stripe.com/products-prices/manage-prices>
- <https://docs.stripe.com/webhooks>
- <https://docs.stripe.com/development/dashboard/webhooks>
- <https://docs.stripe.com/webhooks/quickstart>
</details>

---

## Resend setup for Starfall Armada (`starfall-armada`)

This produces the `RESEND_API_KEY` secret your Worker expects, and a verified sending domain so your `from:` address is accepted. Verification of the API key matters too: the `from` address you set in code **must** be on a domain you have verified here, otherwise sends fail.

Recommendation: verify a **subdomain** like `mail.valentin.is` (not the apex `valentin.is`). A subdomain isolates sending reputation and avoids MX conflicts with your existing mailbox provider on the root domain. The `from` address can still be anything `@valentin.is` once the subdomain is verified — Resend authenticates the whole domain via the records below.

---

### Part A — Add and verify the sending domain (do this FIRST)

You should create the domain before the API key so you can scope the key to it.

1. Go to **https://resend.com** and sign in. (First time: **Sign Up**, confirm your email, finish onboarding.)
2. In the left sidebar, click **Domains**.
3. Click **Add Domain** (top-right).
4. In **Name**, enter `mail.valentin.is` (the subdomain). Leave it as the apex only if you deliberately want to send from the root domain.
5. Under **Region**, pick the region closest to your users / Worker. Options are: **us-east-1** (N. Virginia), **eu-west-1** (Ireland), **sa-east-1** (São Paulo), **ap-northeast-1** (Tokyo). For an EU-based operation (Munich UG), choose **eu-west-1**. Note: **region is permanent** — the MX value below must match the region you pick, so don't change it later.
6. Click **Add** (or **Add Domain**).
7. Resend opens the domain detail page and shows a **DNS Records** table. **Keep this tab open** — the DKIM value and exact MX hostname are generated uniquely for your domain and only appear here. You'll copy them into Cloudflare in Part B.

The table will list records of these types (host names assume the `mail.valentin.is` subdomain):

| Purpose | Type | Name / Host (Resend shows) | Value (Resend shows) | Priority |
|---|---|---|---|---|
| MX — bounce/complaint feedback | **MX** | `send` | `feedback-smtp.eu-west-1.amazonses.com` (region-specific; `us-east-1` etc. if you chose another region) | `10` |
| SPF | **TXT** | `send` | `v=spf1 include:amazonses.com ~all` | — |
| DKIM | **TXT** (some accounts show **CNAME**) | `resend._domainkey.send` | long DKIM public key string — **copy the exact value from your dashboard**, it's unique per domain | — |
| DMARC (recommended) | **TXT** | `_dmarc.send` | `v=DMARC1; p=none;` | — |

Notes on the values:
- The **DKIM value is unique to your domain** — there is no generic value; copy the one Resend displays. Modern Resend accounts issue DKIM as a **TXT** record (`resend._domainkey...` with a `p=...` public key); some show a **CNAME** to `resend._domainkey.resend.com`. **Use whichever type Resend shows you.**
- The **MX value's region segment must match the region you selected** in step 5.
- DMARC is optional for verification but recommended for deliverability; `p=none` is a safe starting policy.

---

### Part B — Add the DNS records in Cloudflare (DNS-only / grey cloud)

Your DNS is on Cloudflare (the `valentin.is` zone). Add each record from the Resend table.

1. Go to **https://dash.cloudflare.com** and sign in.
2. On the account home, click the **valentin.is** zone (the website/zone card).
3. In the left sidebar, click **DNS**, then **Records**.
4. For **each** record in the Resend table, click **+ Add record** and fill it in. **Critical: set Proxy status to "DNS only" (grey cloud), not "Proxied" (orange cloud)** — Cloudflare's proxy only handles HTTP, and proxying mail/auth records breaks MX/SPF/DKIM/DMARC lookups. (Proxy only applies to A/AAAA/CNAME records; MX and TXT have no proxy toggle.)

   **a. MX record**
   - **Type:** `MX`
   - **Name:** `send` (Cloudflare auto-expands to `mail.valentin.is`)
   - **Mail server:** `feedback-smtp.eu-west-1.amazonses.com` (paste exactly what Resend shows)
   - **Priority:** `10`
   - Click **Save**.

   **b. SPF (TXT) record**
   - **Type:** `TXT`
   - **Name:** `send`
   - **Content:** `v=spf1 include:amazonses.com ~all`
   - Click **Save**.

   **c. DKIM record** — match the type Resend showed you:
   - If **TXT**: **Type** `TXT`, **Name** `resend._domainkey.send`, **Content** = the exact DKIM string from Resend (begins with `p=...` or `k=rsa; p=...`). Paste the full value, no line breaks.
   - If **CNAME**: **Type** `CNAME`, **Name** `resend._domainkey.send`, **Target** = the value Resend shows (e.g. `resend._domainkey.resend.com`), **Proxy status: DNS only (grey cloud)**.
   - Click **Save**.

   **d. DMARC (TXT) record** (recommended)
   - **Type:** `TXT`
   - **Name:** `_dmarc.send`
   - **Content:** `v=DMARC1; p=none;`
   - Click **Save**.

Cloudflare tip: when entering a long TXT value, do **not** wrap it in extra quotes — Cloudflare adds quoting itself. Paste the raw string Resend gave you.

---

### Part C — Verify the domain in Resend

1. Return to the Resend **Domains** tab (the domain detail page).
2. Click **Verify DNS Records** (button on the domain page). Resend re-queries each record and updates the per-record status indicators.
3. Wait for status to change to **Verified**. Cloudflare DNS usually propagates in **a few minutes**; Resend keeps re-checking for up to **72 hours**. If a record stays **Pending/Failure**, re-check the host name and value in Cloudflare (most common cause: proxy left ON, or the subdomain prefix doubled).
4. Once the domain shows **Verified**, you can send from any address on it (e.g. `Starfall Armada <noreply@mail.valentin.is>`). The `from` in your Worker code must use this verified domain.

---

### Part D — Create the API key (this becomes `RESEND_API_KEY`)

1. In the Resend left sidebar, click **API Keys**.
2. Click **Create API Key** (top-right).
3. **Name:** enter something identifiable, e.g. `starfall-armada-prod`.
4. **Permission:** choose **Sending access** (least privilege — the key can only send emails, which is all the Worker needs). Choose **Full access** only if you need the key to manage domains/keys via API.
5. **Domain:** with **Sending access** selected, the **Domain** dropdown is enabled — restrict the key to **mail.valentin.is**. (With **Full access**, the Domain field is disabled.)
6. Click **Add** (or **Create**).
7. Resend shows the key value **once** (starts with `re_...`). **Copy it now** — it is not shown again. This string is your `RESEND_API_KEY`.

---

### Where to put the key (your deployment)

Since the Worker is `starfall-armada` deployed on Cloudflare, set the value as a Worker **secret** named exactly `RESEND_API_KEY`:

- Cloudflare dashboard: **Workers & Pages** → **starfall-armada** → **Settings** → **Variables and Secrets** → **Add** → set **Type: Secret**, **Variable name:** `RESEND_API_KEY`, **Value:** the `re_...` string → **Deploy**.

Keep the same `from` domain (`mail.valentin.is`) consistent between your code and the verified domain, or sends will be rejected.

<details><summary>Sources for this section (verified high confidence)</summary>

- <https://resend.com/docs/dashboard/api-keys/introduction>
- <https://resend.com/changelog/new-api-key-permissions>
- <https://resend.com/docs/api-reference/api-keys/create-api-key>
- <https://github.com/resend/resend-skills/blob/main/skills/resend/references/api-keys.md>
- <https://resend.com/docs/dashboard/domains/introduction>
- <https://github.com/resend/resend-skills/blob/main/skills/resend/references/domains.md>
- <https://dmarcdkim.com/setup/how-to-setup-resend-spf-dkim-and-dmarc-records>
- <https://docs.gravitysmtp.com/adding-and-authenticating-a-domain-in-resend/>
</details>
