# Starfall — TestFlight & Google Play (Internal Testing)

Native iOS/Android wrappers via **Capacitor 8**, verified against live docs (July 2026).
Each section cites its sources. Prerequisites you already have: approved Apple
Developer account, Google Play Console account, Xcode, Android Studio, the
TestFlight app on your iPhone.

## The one big-picture rule (read first)

- **Internal testing has NO content review** on either store — you can ship builds
  with the Stripe store fully visible to internal testers.
- **Before a PUBLIC release**, Apple (Guideline 3.1.1) and Google (Play Billing)
  forbid selling digital goods (credits/skins/pass) via Stripe inside the app.
  That is a *production* problem, not a *testing* one — see §4. Do not block the
  test milestone on it.

## Architecture decision (already applied in the repo)

`capacitor.config.json` uses **`server.url: https://starfall.valentin.is`** — the
native app loads the live site. This means better-auth cookie sessions and the
relative `/api/*` calls work **unchanged** (the WebView origin *is* your domain).
Zero code changes for the test builds.

## One-time repo setup (on your Mac)

```bash
git clone https://github.com/Valentin-Israel/informatik-10a.git starfall && cd starfall
npm install
npx cap add ios
npx cap add android
npm run icons                 # regenerates web icons + mobile assets/ (icon-only, splash, ...)
npx capacitor-assets generate # writes native icon/splash sets into ios/ and android/
npx cap sync                  # copy web assets + config into both native projects
```

Then commit `ios/` and `android/` (they are source, not build output).

---

## Capacitor 8 — wrapping Starfall: Armada for iOS/Android (verified July 2026)

### 1. Current version + toolchain requirements

Current major is **Capacitor 8** (released 2025-12-08). Verified requirements:

| Requirement | Version |
|---|---|
| Node.js | **22+** |
| Xcode | **26.0+** (min deployment target **iOS 15**) |
| iOS dependency manager | **Swift Package Manager is the default** for new projects (CocoaPods no longer required) |
| Android Studio | **2025.2.1 (Otter)+** |
| Android | min **API 24** (Android 7), target **SDK 36** (Android 16) |

### 2. Install + add platforms (run in repo root, next to `package.json`)

```bash
npm i @capacitor/core
npm i -D @capacitor/cli
# capacitor.config.json already exists (appId is.valentin.starfall, webDir "public") — skip `npx cap init`

npm i @capacitor/ios @capacitor/android
npx cap add ios        # creates ios/  (open with: npx cap open ios → ios/App/App.xcworkspace)
npx cap add android    # creates android/  (open with: npx cap open android)
npx cap sync           # copies webDir into both native projects + updates native deps; run after every web build or plugin install
```

Note: Capacitor requires `public/index.html` to contain a `<head>` tag, or plugin injection fails.

**Commit vs gitignore:** commit `ios/` and `android/` entirely — Capacitor treats native projects as source assets (no regeneration step like Cordova). Gitignore only the generated copies: `ios/App/App/public/`, `ios/DerivedData/`, `android/app/src/main/assets/public/`, and `android/app/src/main/assets/capacitor.config.json` (the platform `.gitignore` files created by `cap add` cover most of this; the Android `capacitor.config.json` copy is a known gap — add it manually).

### 3. Option A — `server.url` (load the live site)

```json
{
  "appId": "is.valentin.starfall",
  "appName": "Starfall: Armada",
  "webDir": "public",
  "server": {
    "url": "https://starfall.valentin.is",
    "androidScheme": "https"
  },
  "ios": {
    "contentInset": "always",
    "limitsNavigationsToAppBoundDomains": true
  }
}
```

Facts and caveats (all verified against the config docs):
- **`webDir` is still used** — `npx cap sync` copies it into the native projects regardless; keep `"webDir": "public"` and the folder non-empty. With `server.url` set, the WebView simply loads the remote URL instead of the bundled copy.
- **Cookies just work.** The WebView origin is literally `https://starfall.valentin.is`, so better-auth's cookie sessions and the relative `fetch('/api/...')` calls (auth + Stripe) behave exactly as in a normal browser: first-party, same-origin, default `SameSite=Lax` is fine. No CORS, no client or Worker changes.
- **Offline = blank screen** unless the PWA service worker runs inside the WebView. Android WebView supports SWs for https origins. On iOS, WKWebView only enables service workers via **App-Bound Domains**: add `WKAppBoundDomains` (array, max 10 domains) with `starfall.valentin.is` to `ios/App/App/Info.plist` and keep `ios.limitsNavigationsToAppBoundDomains: true` (docs: recommended whenever `WKAppBoundDomains` is present, "otherwise some features won't work").
- **Official caveat:** the docs label `server.url` as "intended for use with live-reload servers… **not intended for use in production**." It works, but it's an officially unsupported production pattern.
- **Apple review:** internal TestFlight builds skip Beta App Review, so remote loading is a non-issue for this milestone. For public App Store release, a pure remote-URL wrapper risks **Guideline 4.2 (Minimum Functionality)** rejection.

### 4. Option B — bundled assets (the store-release path)

Ship `public/` inside the binary. The WebView origin becomes `capacitor://localhost` (iOS) / `https://localhost` (Android), which breaks this app as-is:
- Relative `fetch('/api/...')` resolves to `capacitor://localhost/api/...` → 404/failure. Every API call needs an absolute base (`https://starfall.valentin.is/api/...`).
- That makes the API **cross-origin**: the Cloudflare Worker must send `Access-Control-Allow-Origin: capacitor://localhost` (and `https://localhost`) + `Access-Control-Allow-Credentials: true`; better-auth needs those origins in `trustedOrigins`; session cookies must be `SameSite=None; Secure`. WKWebView's third-party-cookie handling is unreliable, so you'd also enable the built-in cookie patch: `"plugins": { "CapacitorCookies": { "enabled": true } }` (routes `document.cookie` through native storage; disabled by default).

### 5. Icons + splash — `@capacitor/assets`

```bash
npm install @capacitor/assets --save-dev
```
Create an `assets/` folder in the repo root containing (PNG or JPG):
- `icon-only.png` — min **1024×1024**
- `icon-foreground.png` + `icon-background.png` — Android adaptive icon layers, min 1024×1024
- `splash.png` and `splash-dark.png` — min **2732×2732**

```bash
npx capacitor-assets generate            # or --ios / --android
```
Outputs all native icon/splash sizes into `ios/` and `android/` (Android 12+ splash = centered icon on a solid color, per platform rules).

### 6. Recommendation for the TestFlight / internal-testing build

**Use `server.url` → `https://starfall.valentin.is` (Option A).** Justification for this specific app:
1. The backend is same-origin with cookie sessions and relative fetch paths — Option A requires **zero code changes** to client, better-auth, or the Worker; Option B requires an API-base refactor, CORS-with-credentials on the Worker, `SameSite=None` cookies, and `trustedOrigins` changes, all just to test a wrapper.
2. Internal TestFlight and Play internal testing don't go through content review, so the "remote wrapper" review risk is deferred, and the "not for production" caveat doesn't bite for a test channel.
3. You keep instant updates: every deploy to the Worker updates the app with no new binary.

**Before public store submission**, plan the migration to Option B (bundled assets + absolute API base + CORS/`SameSite=None` + `CapacitorCookies`) and add genuinely native touches (push notifications, haptics) to clear Apple's Guideline 4.2. Add `WKAppBoundDomains` now either way — it's what makes your existing service worker function on iOS.

Repo note: `/home/user/informatik-10a/capacitor.config.json` is already Capacitor-8-compatible; for Option A only the `server.url` line and `ios.limitsNavigationsToAppBoundDomains` need to be added.

<details><summary>Sources (verified high)</summary>

- <https://capacitorjs.com/docs/getting-started>
- <https://capacitorjs.com/docs/getting-started/environment-setup>
- <https://capacitorjs.com/docs/config>
- <https://capacitorjs.com/docs/ios>
- <https://capacitorjs.com/docs/android>
- <https://capacitorjs.com/docs/basics/workflow>
- <https://capacitorjs.com/docs/guides/splash-screens-and-icons>
- <https://capacitorjs.com/docs/apis/cookies>
- <https://ionic.io/blog/announcing-capacitor-8>
- <https://capacitorjs.com/docs/updating/8-0>
- <https://github.com/ionic-team/capacitor/issues/4122>
- <https://github.com/ionic-team/capacitor/issues/5563>
- <https://developer.apple.com/app-store/review/guidelines/#minimum-functionality>
</details>

---

## Apple: Xcode project → TestFlight testers (verified July 2026)

### 0. Minimum requirements (in force now)

- **Since April 28, 2026, App Store Connect only accepts uploads built with Xcode 26 or later (iOS 26 SDK)** ([Apple upcoming requirements](https://developer.apple.com/news/upcoming-requirements/?id=02032026a)). This is the *build SDK* — your deployment target can stay lower (e.g. iOS 16).
- **macOS:** initial Xcode 26 runs on macOS Sequoia 15.6+; the current Xcode 26.6 requires **macOS Tahoe 26.2+** ([system requirements](https://developer.apple.com/xcode/system-requirements/)). Practically: update the Mac to Tahoe and install the latest Xcode 26.x from the App Store.
- Apple Developer Program membership (you have it). **Privacy policy URL:** not marked required by Apple's docs for TestFlight itself (Test Information's required field is the Beta App Description), but it *is* required for the later App Store submission — and since Starfall has accounts + payments, fill the Privacy Policy URL field in Test Information anyway.

### 1. Register the bundle ID `is.valentin.starfall`

**Short answer: Xcode automatic signing registers it for you.** With a team selected and "Automatically manage signing" on, Xcode registers the App ID in your account on first build/archive (supported since Xcode 11.4). Manual route, if you prefer doing it on the dashboard:

1. [developer.apple.com/account](https://developer.apple.com/account) → **Certificates, Identifiers & Profiles** → **Identifiers** → **(+)**.
2. Select **App IDs** → **Continue** → type **App IDs** → **Continue**.
3. **Description:** `Starfall Armada`. Select **Explicit** and enter `is.valentin.starfall` (must match Xcode exactly).
4. Tick needed **Capabilities** (In-App Purchase is on by default for explicit IDs; add Push Notifications later if you want them).
5. **Continue** → **Register**.

### 2. Create the app record in App Store Connect

Prerequisite: Account Holder must have signed the latest agreement under **Business**; the bundle ID must already exist (step 1 or one Xcode build with automatic signing).

1. [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **Apps** → **(+)** top-left → **New App**.
2. Fill the dialog:
   - **Platforms:** iOS
   - **Name:** `Starfall: Armada` (App Store display name, must be unique on the store)
   - **Primary Language:** English (U.S.)
   - **Bundle ID:** pick `is.valentin.starfall` from the dropdown
   - **SKU:** any internal unique string, e.g. `starfall-armada-001` (never shown publicly)
   - **User Access:** Full Access
3. **Create**. App appears with status "Prepare for Submission".

### 3. Xcode: sign, version, archive, upload

1. In the Capacitor iOS project (`npx cap add ios`, open `ios/App/App.xcworkspace`): target **App** → **Signing & Capabilities** → check **Automatically manage signing**, pick your **Team**.
2. Target → **General**: set **Version** (`CFBundleShortVersionString`, e.g. `1.0.0`) and **Build** (`CFBundleVersion`, must increase with every upload — or let Xcode manage it, see 3.5).
3. **Skip the export-compliance question:** add to `Info.plist`: `ITSAppUsesNonExemptEncryption` = `NO` (Boolean). Correct for Starfall — it only uses OS-provided HTTPS/TLS, which is exempt ([Apple](https://developer.apple.com/documentation/security/complying-with-encryption-export-regulations)). Without the key, App Store Connect asks the encryption questionnaire on **every** upload and the build sits in "Missing Compliance" until answered.
4. Select destination **Any iOS Device (arm64)** → menu **Product → Archive**.
5. **Window → Organizer** → **Archives** → select the archive → (optional **Validate App**) → **Distribute App**. Current dialog options: choose **TestFlight & App Store** (default; also submits-ready) or **TestFlight Internal Only** (can never be submitted to the store — fine for pure testing). Leave checked: **Upload your app's symbols** and **Manage version and build number** (auto-bumps the build number). Click **Distribute**.
6. Upload finishes → build shows as **Processing** in App Store Connect → TestFlight tab. Apple doesn't publish a duration; typically minutes up to ~1 hour, email when done. With the `ITSAppUsesNonExemptEncryption` key set, it goes straight to "Ready to Test/Submit".

### 4. TestFlight testers

**Internal group (start here — no review, instant):**
- Testers must be **App Store Connect users** on your team (max **100**; roles: Account Holder, Admin, App Manager, Developer, Marketing). Add Korbinian under **Users and Access** first if needed.
- **Apps → Starfall: Armada → TestFlight** tab → **(+)** next to **Internal Testing** → name the group → optionally check **Enable automatic distribution** (every new build goes to the group automatically) → **Create**.
- Group → **Invite Testers** → tick users → **Add**. They get an email; they install the free **TestFlight** app on iPhone, accept the invite, and install the build. **No Beta App Review.** Builds expire after **90 days**.

**External group (up to 10,000, requires Beta App Review):**
- Prerequisite: an internal group must exist. Also fill **TestFlight → Test Information**: **Beta App Description** (required), **Feedback Email**, Beta App Review contact info — and because Starfall requires sign-in, provide a **demo account** for the reviewer.
- **(+)** next to **External Testing** → name group → **Create** → **Add Builds** → pick platform/version/build → enter **What to Test** → **Submit Review**.
- **First build of a version goes through Beta App Review** (statuses: Waiting for Review → In Review → Approved/Rejected; usually ~1 day); subsequent builds of the same version typically don't need re-review. Max 6 build submissions per 24 h.
- Add testers: **(+)** next to **Testers** → **Email** / **Existing** / **Import** (CSV) — or **Create Public Link** (open to anyone, optional tester limit 1–10,000 and device/OS criteria).

### Project-specific warnings (before external review)

- **Capacitor origin:** natively, the app serves from `capacitor://localhost`, so `fetch('/api/...')` will NOT hit `starfall.valentin.is`. Fix in the repo (API base URL for native builds, plus CORS + cookie handling for better-auth) or set `server.url` — decide before the first archive.
- **Stripe for digital goods:** in-app purchases of credits/skins/battle-pass via Stripe checkout violates App Review Guideline 3.1.1 on iOS (digital content must use Apple IAP, except narrow US external-link entitlements). Internal TestFlight won't care (no review); **external Beta App Review can reject for it.** Plan IAP or gate the store in the native build.

<details><summary>Sources (verified high)</summary>

- <https://developer.apple.com/help/account/identifiers/register-an-app-id/>
- <https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app>
- <https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases>
- <https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview>
- <https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers>
- <https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers/>
- <https://developer.apple.com/help/app-store-connect/test-a-beta-version/provide-test-information>
- <https://developer.apple.com/documentation/bundleresources/information-property-list/itsappusesnonexemptencryption>
- <https://developer.apple.com/documentation/security/complying-with-encryption-export-regulations>
- <https://developer.apple.com/news/upcoming-requirements/?id=02032026a>
- <https://developer.apple.com/xcode/system-requirements/>
</details>

---

## Google Play — Internal Testing (verified July 2026)

Internal testing is Play's TestFlight equivalent: up to 100 testers, releases live **within minutes, no Google review**. It works even on a brand-new app with almost no store setup.

### 0. Packaging note (before you build anything)

The client calls `fetch('/api/...')` with cookie sessions, so the app must actually run on the `https://starfall.valentin.is` origin. Two options for the Android build:

- **Recommended — TWA (Trusted Web Activity)** via Bubblewrap: the app opens the real site in Chrome, so relative paths, better-auth cookies, and the service worker all work unchanged. Add Digital Asset Links (`/.well-known/assetlinks.json`) on the Worker.
- **Capacitor** (repo already has `capacitor.config.json`, appId `is.valentin.starfall`): the default WebView origin is `https://localhost`, which **breaks** relative `/api` calls and cookies. If you go this route, point it at the live site:

```json
{
  "appId": "is.valentin.starfall",
  "appName": "Starfall: Armada",
  "webDir": "public",
  "server": { "url": "https://starfall.valentin.is" }
}
```

Either way you end up with an Android project you open in Android Studio to produce the `.aab`.

### 1. Create the app in Play Console

1. [play.google.com/console](https://play.google.com/console) → **Home** → **Create app**.
2. Fill in:
   - **App name**: `Starfall: Armada`
   - **Default language**: English (United States)
   - **App or game**: **Game**
   - **Free or paid**: **Free** (in-app Stripe note: see below — Play billing policy applies to IAP-like digital goods; for internal testing this won't block you, but plan before production)
3. **Declarations**: check **Developer Program Policies** and **US export laws** acknowledgments (Play App Signing terms are accepted at first upload).
4. Click **Create app**.

### 2. Build a signed .aab in Android Studio

1. Open the Android project → **Build → Generate Signed Bundle/APK…**
2. Select **Android App Bundle** → **Next**.
3. Under **Key store path** click **Create new…** and fill the **New Key Store** dialog:
   - **Key store path**: e.g. `~/keystores/starfall-upload.jks` (back this file up — it's your *upload key*)
   - **Password** / confirm
   - **Alias**: e.g. `starfall-upload`, key password, **Validity**: 25+ years, certificate name fields
4. **Next** → choose **release** build variant → **Create**.
5. Output lands in `app/build/outputs/bundle/release/app-release.aab` (Studio pops a "locate" notification).

**Play App Signing** is automatic for new apps: on first upload, Google generates an RSA 4096-bit *app signing key* and re-signs your bundle; your `.jks` is only the *upload key* (resettable if lost). Over 90% of new apps use this default — no extra enrollment steps.

### 3. Internal testing release

1. Play Console → your app → left nav **Testing → Internal testing**.
2. **Testers** tab → **Create email list** → name it, paste tester Gmail addresses (comma-separated or CSV) → **Save changes**. Limit: **up to 100 testers per app**.
3. **Releases** tab → **Create new release**.
4. First release: accept **Play App Signing** default (Google-generated key) → drag in `app-release.aab`.
5. Release name auto-fills from versionName; add release notes → **Next** → fix any errors/warnings → **Save and publish** (roll out to Internal testing).
6. Back on **Testers** tab: tick your email list, add a feedback email/URL, click **Copy link** and send the **opt-in link** to testers. Testers open it, tap "Become a tester," then install from Play.

**Speed**: "available to testers within minutes" — no review queue. Closed/open testing and production releases go through app review (typically hours to ~7 days for new apps).

### 4. New-account constraints (check which apply to you)

- **12-testers / 14-days rule**: *personal* accounts created after Nov 13, 2023 must run a **closed test** with **at least 12 testers opted-in for 14 consecutive days** before applying for **production** access ("Apply for production" on the Dashboard; ~7-day review of your answers). This does **NOT** block internal testing — you can start internal testing immediately. **Organization accounts are exempt** — if your Console account is registered to CashXChain UG as an organization, this rule doesn't apply at all.
- **Device verification**: new personal accounts (early 2024 onward) must verify access to a real, non-rooted Android device (Android 10+) via the **Play Console mobile app** (Home page task → **View details** → scan QR → **Verify**; takes under a minute). Blocks publishing to Play, not account usage.
- **Identity verification** must be complete before any app can be published (legal name/address, possibly government ID; D-U-N-S number for organization accounts).

### 5. Store listing minimums

You **can create an internal testing release before the app is fully configured** — store listing, content rating, data safety, etc. can be skipped for now. Caveat: testers "will see a temporary name for the app" until setup is done. All the Dashboard setup tasks (listing graphics, content rating questionnaire, data safety form, privacy policy URL) become mandatory only when you move to closed/open testing or production.

### Quick checklist

- [ ] Decide TWA vs Capacitor-with-server-url (relative `/api` + cookies)
- [ ] Create app in Play Console (Game, Free, declarations)
- [ ] Build signed `.aab` (upload keystore → back it up)
- [ ] Internal testing → email list (≤100) → create release → upload `.aab`
- [ ] Copy opt-in link → send to testers → live in minutes

<details><summary>Sources (verified high)</summary>

- <https://support.google.com/googleplay/android-developer/answer/9845334>
- <https://support.google.com/googleplay/android-developer/answer/9859152>
- <https://support.google.com/googleplay/android-developer/answer/9859348>
- <https://support.google.com/googleplay/android-developer/answer/9842756>
- <https://developer.android.com/studio/publish/app-signing>
- <https://support.google.com/googleplay/android-developer/answer/14151465>
- <https://support.google.com/googleplay/android-developer/answer/14316361>
</details>

---

## Selling credits/skins/battle-pass via Stripe inside the native apps — policy status (verified July 2026)

### 1. iOS (App Store)

**Baseline — Guideline 3.1.1: NO.** Digital unlocks ("subscriptions, in-game currencies, game levels, access to premium content") **must use In-App Purchase**. A Stripe checkout completing *inside* the app (including inside the Capacitor webview) is a prohibited "own mechanism" — this applies worldwide, US included.

**US storefront carve-out (Epic v. Apple, live since May 2025):** Guideline 3.1.1(a) now states entitlements "are not required for developers to include buttons, external links, or other calls to action in their United States storefront apps." So on the **US storefront** you may put a "Buy credits on starfall.valentin.is" button that opens **Safari**, where Stripe checkout completes on your site. Current commission on those linked-out sales: **0%** — the Ninth Circuit (Dec 2025) upheld the contempt finding but said Apple may eventually charge a cost-based fee; the district court hasn't set a rate, and the **Supreme Court agreed in late June 2026 to hear Apple's appeal**. Treat 0% as temporary; don't architect pricing around it.

**The cross-platform catch — 3.1.3(b):** web-purchased items may be *consumed* in the app, but for games the exact text is: "…including consumable items in multi-platform games, **provided those items are also available as in-app purchases within the app**." So "hide the store, let web-bought credits sync into the iOS app" is not strictly compliant for a game — Apple expects credits to also exist as IAP. (Battle-pass = auto-renewable subscription IAP.)

**EU:** separate DMA regime — StoreKit External Purchase Link Entitlement (EU) plus fees (announced: 2% initial acquisition + 5–13% Store Services + 5% Core Technology Commission; the CTF→CTC transition planned for Jan 2026 is still in flux with the European Commission). Link-out is possible but not fee-free. Everywhere else: IAP only.

### 2. Android (Google Play)

**Baseline — Payments policy: NO.** Virtual currencies/items and subscriptions must use Google Play Billing, and apps "may not lead users to a payment method other than Google Play's billing system" — explicitly including "in-app webviews, buttons, links, messaging."

**US carve-out (Epic v. Google injunction — effective Oct 29, 2025, programs live Dec 9, 2025, in force through Nov 2027):** two enrollment programs for US users:
- **Alternative billing program**: use Stripe **in-app**, "in lieu of or alongside" Play Billing. Play Billing is *not* required alongside.
- **External content links program**: link out to purchase digital items — destination may be "browser, webview, or pre-installed third-party app store."
- **Fees:** Google published a schedule (10% first $1M/yr; then 10–25% depending on type/install date, distinction effective June 30, 2026) but states it "is not assessing these fees" yet. Enrollment deadline for apps already doing this was **Jan 28, 2026** — enroll *before* shipping it: Play Console → **Settings → Alternative billing** (declaration form + APIs: information screen, transaction reporting).

**Outside the US:** user-choice billing (eligible countries, Play Billing must be offered alongside, fee reduced ~4%) or the EEA alternative-billing programs (fee reduced 3–4%). Otherwise Play Billing only. Consuming web-purchased credits in the app is fine on Play as long as the app doesn't steer to the web purchase.

### 3. Does this affect internal testing? Effectively no.

- **TestFlight internal testing** (up to 100 App Store Connect team members): **no Beta App Review**. Only *external* TestFlight requires your build to be "approved by App Review for TestFlight." You can ship internal builds with the Stripe store fully visible.
  1. App Store Connect → your app → **TestFlight** → under **Internal Testing** click **+** → name the group.
  2. Add testers (must hold Account Holder/Admin/App Manager/Developer/Marketing role).
  3. Upload the build (Xcode/Transporter); it appears in the group with no review.
- **Play internal testing** (up to 100 testers): Google's docs state internal tests "may not be subject to the usual Play policy or security reviews" — builds go live in minutes. Closed/open/production tracks *are* reviewed.
  1. Play Console → your app → **Testing → Internal testing** → **Create new release**.
  2. Upload the .aab, add tester email list, share the opt-in link.
- **Boundary:** the moment you promote to **external TestFlight** or Play **closed/open/production**, review applies — the Stripe store must be gated by then.

### 4. Recommendation for Starfall: Armada

**Test phase (now):** ship both internal tracks with the Stripe store as-is. Zero changes required. Stay strictly on TestFlight *internal* + Play *internal*.

**Build the gate now, flip it later:** since one web codebase serves web + Capacitor, add a runtime platform check (`Capacitor.isNativePlatform()` / `!!window.Capacitor`) combined with a server-driven flag from your Worker (e.g. `GET /api/config` returning `storeEnabled` per platform) — so store visibility toggles without app-store resubmission. (Note: because API calls are relative, decide whether the Capacitor shell loads the remote site via `server.url: "https://starfall.valentin.is"` or packages `public/` — the config flag works either way.)

**Production:**
- **Android:** easiest — enroll in the US alternative billing program and keep Stripe in-app for US users (0% today, 10–25% later); use Play Billing or hide the store for other countries.
- **iOS:** implement StoreKit IAP for credits/skins and an auto-renewable subscription for the battle-pass (a Capacitor IAP plugin or RevenueCat keeps it manageable) — required anyway by 3.1.3(b) if web-bought credits are usable in-app. Optionally add the US link-out button to Stripe on top (0% commission while litigation runs).
- If you want to launch iOS without IAP work, the only clean option is removing *both* the store *and* in-app consumption of web-bought consumables from the iOS build — usually not worth it for a game; budget the IAP integration instead.

This is policy analysis, not legal advice; the Apple US commission and the Epic/Google settlement are active litigation — recheck both before the production submission.

<details><summary>Sources (verified high)</summary>

- <https://developer.apple.com/app-store/review/guidelines/>
- <https://developer.apple.com/news/?id=9txfddzf>
- <https://developer.apple.com/testflight/>
- <https://developer.apple.com/support/dma-and-apps-in-the-eu/>
- <https://support.google.com/googleplay/android-developer/answer/9858738>
- <https://support.google.com/googleplay/android-developer/answer/15582165>
- <https://support.google.com/googleplay/android-developer/answer/16470497>
- <https://support.google.com/googleplay/android-developer/answer/16497028>
- <https://support.google.com/googleplay/android-developer/answer/9845334>
- <https://www.ghacks.net/2026/07/02/supreme-court-agrees-to-hear-apple-appeal-over-27-external-payment-fee-in-epic-contempt-case/>
- <https://9to5mac.com/2026/05/04/apple-files-for-supreme-court-stay-in-epic-case-over-off-app-store-commission-dispute/>
- <https://www.revenuecat.com/blog/growth/apple-eu-dma-update-june-2025/>
- <https://www.macrumors.com/2025/06/26/app-store-eu-rule-change-dma/>
</details>
