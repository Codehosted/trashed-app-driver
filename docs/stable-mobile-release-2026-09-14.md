# Trashed vendor + driver release — 2026-09-14

**Status: release candidates prepared; no production deployment or store submission. Release gates remain open.**

## Delivered locally

- General **Trashed** display name and role-aware `/app` entry. Existing `com.trashed.driver` store identities and native authentication remain intact. Website features remain website features inside the wrapper; there is no parallel vendor UI implementation.
- Startup animation limited to a WebView session, with four-page first-use walkthrough and persistent completion. Competing vendor setup prompts and notification permission registration wait for the walkthrough.
- Real operational notification inbox/unread counts and driver messages replace demonstration alerts. Removed misleading notification test/settings controls.
- iOS WebView constrained to native safe areas; Android system-bar/cutout padding retained. Larger flat driver controls and flat purple/white launcher artwork replace the gradient identity.
- Customer phone links open the device's phone confirmation/dialer. No CallKit, incoming VoIP, direct-call permission, or automatic call-completion claim. This matches George's clarification.
- Vendor push/inbox fanout covers managed Trisha/Telnyx call results, order approval events, and route changes. Ordinary outgoing phone calls do not generate an automatic result event. Fresh recipient access checks, event deduplication, shared-device token transfer, and revoke-before-logout are covered by tests.
- New OG-style iOS cover and walkthrough artwork use actual current simulator captures. The Android cover now uses a visually verified current native login capture, replacing the legacy draft; all store assets still require release approval.

## Verification

| Check | Result | Evidence |
|---|---|---|
| Mobile/native contracts + branding/art tooling | 61/61 passed | `artifacts/native-experience/mobile-tests.log` |
| Website experience tests | 75/75 across 12 suites | `../trashed-app/output/mobile-release/2026-09-14/mobile-experience-final-tests.json` |
| Push, inbox, events, authorization, logout | 165/165 across 27 suites | `../trashed-app/output/mobile-release/2026-09-14/vendor-notification-final-tests.json` |
| TypeScript, both repositories | Passed | Mobile `artifacts/native-experience/mobile-types.log`; web `output/mobile-release/2026-09-14/web-types.log` |
| Whitespace/diff check, both repositories | Passed | `git diff --check` |
| Flat launcher assets | 35 verified | `app-store-assets/artwork/icon-manifest.json` |
| Store artwork | 4 RGB outputs, dimensions and hashes verified | `app-store-assets/2026-09/manifest.json` |
| iOS Simulator native build | Passed | `/tmp/trashed-mobile-ios-build.log` |
| Android debug + instrumentation build | Passed; lint 0 errors / 33 warnings | `artifacts/native-experience/android/verification.json` |
| Android API 36 runtime regression suite | 2/2 passed: native login validation and measured safe-area bounds | `artifacts/native-experience/android/runtime/AndroidReleaseTest-results.json` |
| Signed iOS device build | **Failed** embedding AppAuth.framework: `errSecInternalComponent` | `/tmp/trashed-mobile-ios-device-build.log` |
| Local read-only smoke | 8/8 passed | `../trashed-app/output/mobile-release/2026-09-14T19-17-51.308Z/vendor-readonly-smoke.json` |
| Production read-only smoke | Existing 7 boundaries passed; new `/app` **404** | `../trashed-app/output/mobile-release/2026-09-14T19-00-02.741Z/vendor-readonly-smoke.json` |

Test groups overlap; do not add their counts as distinct cases. Source and mock tests do not establish device delivery or store publication. The smoke report's `releaseReady` field describes its routing checks only.

## Observed simulator behavior

iPhone 17 Pro Max, iOS 26.5, native development wrapper loading `http://localhost:3000`:

- Native sign-in reached the vendor dashboard through `/app`.
- All four walkthrough pages were visible and completed. A competing workspace chooser was found and subsequently gated; the gate fix is covered by tests.
- Relaunch retained sign-in and did not repeat completed onboarding.
- Dashboard → Customers → Call History navigation stayed in the wrapper without an observed repeat splash. Call History displayed its correct empty state, not a fabricated call.
- Status-bar clearance and sidebar close-button placement were visually correct in portrait. This is not landscape, keyboard, VoiceOver, or physical-device proof.
- Source captures are under `app-store-assets/sources/2026-09/`; call-history evidence is `artifacts/native-experience/ios-call-history.png`.
- Development hot reload produced stale-chunk errors while parallel edits were underway; fresh navigation/relaunch recovered. Production caching behavior is not inferred from this dev session.

## Safety and environment

- No orders, calls, messages, or provider pushes were created/sent. Production checks were unauthenticated GET-only, without following redirects or exposing response bodies.
- All development interaction used port 3000 and the isolated local `trashed_ios_review_20260910` database. Existing synthetic customers/orders were not changed. A disposable local-only QA manager was added; real account credentials were not changed.
- `scripts/local-mobile-dev.mjs` loads development env files before stripping outbound/provider credentials and rejecting non-local databases. The development server remains available on port 3000.
- iOS and Android generated configs were restored to `https://trashed.app/app?source=trashed-app` after retaining development artifacts. The installed simulator build intentionally still uses localhost.
- Unrelated pre-existing dirty work in both repositories was preserved. The original checkouts remain uncommitted; isolated candidate branch state is tracked separately. No production deployment or store upload occurred. The draft website preview deployment is documented below.

## Remaining release gates — do not skip

1. Restore physical iPhone availability; Mirroring reports **iPhone Not Found**. Resolve signing-key access with George; do not change keychain ACLs or bypass certificate warnings.
2. Use an approved local development connection to port 3000 on the physical device. Verify safe areas, keyboard, VoiceOver, onboarding persistence, and outgoing dialer number; cancel without placing a call.
3. Run the permitted local order approval scenario **only on George's device against port 3000**. No production test orders.
4. Prove iOS/Android push delivery, foreground/background/terminated behavior, notification tap routing, and logout revocation with an explicitly approved test device. Provider acceptance alone is insufficient. Do not switch production APNs environment to accommodate a development token.
5. Review and approve both store sets and listing copy. Android runtime checks below cover login, native safe areas, and the outgoing-dialer boundary; signed-in Android navigation, keyboard, and accessibility still need verification.
6. Validate/build the isolated release candidate, deploy web first, and rerun production smoke until `/app` passes. Then produce signed store builds, submit, and verify provider review/publication state separately.

Details: [native contract](native-experience-verification.md), [store review packet](../app-store-assets/2026-09/README.md), and the paired website's `docs/mobile-vendor-release-verification.md`.

## Isolated candidate follow-up

- Clean paired worktrees: `/Users/georgebyers/GitHub/.codex-worktrees/trashed-stable-mobile-20260914/trashed-app` and `trashed-app-mobile`, both on `codex/mobile-vendor-stable-release-20260914`. Web base `7f5b0ad2d` retains the latest checkout/pricing fixes; mobile base `286097d` retains the merged native login recovery.
- Campaign, robots, and unrelated checkout changes were excluded. Only two `/app` navigation guards were carried from the mixed root-shell file. File manifests are `web-isolation.json` and `mobile-isolation.json` beside the worktrees.
- Existing Android SDK36/AGP/system-bar/version-guard work was explicitly adopted as a release prerequisite, not attributed as new work.
- Review fixed two additional regressions: exact `/vendor` contact-alert links are accepted; vendor push latency no longer postpones existing call-end realtime/usage or driver assignment alerts. All parallel work is settled before return. Seven reviewed files were mirrored back to the original checkout.
- Isolated mobile tests: 94/94 after adding the release preflight; isolated mobile type check passed. Combined web tests: 222/222 across 35 distinct files, with a separate latest 54/54 regression review. These are overlapping evidence, not additive totals.
- Android runtime used a read-only, no-snapshot API36 emulator and an APK whose installed URL was verified as localhost:3000. No orders/calls. The existing automated regression suite passed; CUA cannot attach the unbundled emulator process, so manual navigation, dialer, and screenshot capture remain unverified.
- App Store Connect's existing browser session now presents login. No store metadata or release state was changed.
- Full isolated web build is a compile/packaging check using only an allowlisted environment and the isolated local database. No migration command or production credentials are passed. This development-configured artifact is not a production deployment artifact.

A shared GET-only production `/app` preflight now gates iOS TestFlight upload and Android release builds before signing/artifact work. It correctly exits 3 on the current production 404. The required redirect is same-origin `/app/login` with exactly `callbackUrl=/app` and `source=trashed-app`. Android verification builds remain usable locally.

Apple's public lookup currently reports **Trashed Driver 1.0.2**, released 2026-09-14 at 14:38:27 UTC, bundle `com.trashed.driver` ([listing](https://apps.apple.com/us/app/trashed-driver/id6756239268)). This confirms publication of the previous app, not this candidate. Before merging the native candidate, choose a new marketing version/build number and update the existing TestFlight default; its current 1.0.2 default must not be mistaken for the next release. Google Play current state still needs an authenticated refresh.

The isolated web build completed compilation, TypeScript, static generation and 35 native libvips trace checks. The only later runtime-source change was role-neutral Google account-recovery wording, covered by its passing seven-test entry suite. Vercel subsequently built that exact final web commit successfully; runtime results are below. No deployment uses this local development-configured artifact.


## Deployed preview and final Android follow-up — 20:12 UTC

- Draft web PR: https://github.com/Codehosted/trashed-app/pull/589; native PR: https://github.com/Codehosted/trashed-app-driver/pull/29. Neither is merged.
- Vercel deployment `dpl_7CDoxZ1aWTbDNAkTrhbamK4phcrL` is READY for exact web commit `3009d3b9e34682b756f803c038214893bfbe50a3`. Build success is not runtime readiness: nine unauthenticated, fixed-preview-host GET checks returned eight expected results, but `/app` returned **500**. Provider runtime logs identify NextAuth **NO_SECRET**. Approval was requested for a new branch-only preview sign-in secret; no authentication settings were changed.
- The normal Vercel preview build invoked its existing migration check. Logs show `Pending migrations: []` and `No pending migrations to apply`; no new migration was applied. A future rebuild must not be described as migration-free. Local isolated builds still avoid the migration command.
- Android visual review exposed white status icons on a white safe-area strip. The actual native content frame is now dark `#020617`, with white status/navigation icons; existing insets and WebView bounds are unchanged. No screenshot retouching was used.
- **Final Android API36 runtime: 3/3 passed in 22.176 seconds.** Measured system-bar/cutout clearance and frame/icon appearance; native empty-login validation; actual Capacitor WebView synthetic phone link opening the populated system dialer. This supersedes, not adds to, the earlier two-test runtime run.
- Dialer evidence: exactly one `android.intent.action.VIEW` for `tel:+12025550123`; active app `com.google.android.dialer`; `CALL_PHONE` neither requested nor granted; zero blocked/unexpected intents. The Call button was never pressed. This proves the Android WebView-to-dialer boundary, not an authenticated customer flow, physical iPhone behavior, or call completion.
- Current native login and idle dialer screenshots were visually reviewed by the root release task. Evidence/hashes: `artifacts/native-experience/android/dialer/AndroidDialerTest-results.json`; capture provenance: `native-login-provenance.json` in the same folder. The login capture predates the synthetic fixture and contains no account or customer data.
- The emulator was read-only, with snapshots disabled, and was closed gracefully. Packaged test backend was verified as `http://localhost:3000/app?source=trashed-app`; generated working files were restored to the production URL afterward. No account sign-in, order creation, or call occurred in this Android test.
- Production routing and both stores remain on their previous releases. Physical-device/signing access, real push delivery, the permitted physical-device local order test, final store versions/artwork approval, production web smoke, and signed store publication remain required.


## First-launch and showcase follow-up — 20:53 UTC

- Native offline intro now precedes sign-in/session recovery, with four pages and persistent completion. Real iOS Simulator checks include fresh signed-out launch, retained session, interruption, Skip, no repeated intro, and padded button hit areas. Web prompts no longer overlap: workspace → optional inventory → notification permission → welcome. See the latest native-contract section for exact evidence/limitations.
- Latest complete checks: **240/240 web tests across 36 files**, final web type gate passes; **98/98 mobile tests**; **7/7 Android functional runtime tests**. Android capture/render disagreement remains a separate unresolved visual gate. Do not interpret functional counts as visual approval or physical-device proof.
- Exact web commit `58549957c3373f1e6c9becf189a25ec6b4b4b63f` built READY as Vercel deployment `dpl_6hsY9bzHaAKK1g4gcjW6UWdmobkt`. Its nine fixed-host, unauthenticated GET checks passed 8/9; `/app` remains500 with provider-confirmed NextAuth `NO_SECRET`. Build migration logs 20:44:07 report no pending migrations and none applied. Preview-only sign-in configuration still awaits approval. No security settings changed.
- Production `/app` was rechecked and still404; native release preflight still blocks with exit3. This candidate has not reached production or either store.
- User rejected nested purple/white showcase frames. New [full-bleed map concept](../app-store-assets/2026-09/concepts/map-route-showcase-v2.png) uses one enlarged route card and existing brand/map references. Built-in imagegen prompts/provenance are saved alongside it. This is an 851×1848 illustrative concept, not a native screenshot, approved final store export, or live route claim. Prior framed drafts remain provenance only.
- Still required: approved preview configuration; physical iPhone signing/connectivity and real device checks; Android visual verification; approved targeted push delivery/tap/logout proof; orders only on George's device against port 3000; final creative approval/store versions; web deployment and production smoke; signed store submission/publication.
