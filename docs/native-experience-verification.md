# General Trashed shell: native verification

## Shipping contract

- Keep `com.trashed.driver` on both platforms so existing installations update in place. The displayed product name is **Trashed**.
- Open `/app?source=trashed-app`; the website chooses the authorized vendor dashboard or driver experience. The native login exchanges and existing accounts remain unchanged.
- The iOS WebView lives inside the native safe-area layout guide on all four edges. No injected global CSS changes page positioning. Android retains its native system-bar/display-cutout padding.
- Customer calls open the device's phone app. They do not create app-hosted VoIP calls, change the default phone app, or record a connected/completed call. iOS displays its call confirmation; Android displays its dialer. No `CALL_PHONE` permission is requested.
- The website normalizes customer phone numbers to plain `tel:` URLs and rejects URL schemes, carrier commands, control characters, and post-dial commands. The separate explicit carrier-forwarding guide is not changed.
- Microphone permission is declared for existing user-started website voice features, not requested on launch. This does not claim background audio, CallKit, or incoming VoIP support.

## Automated checks

Mobile: `bun run test` includes native display/identity contracts, actual Foundation-only Swift login URL tests on macOS, safe-area constraints, the installed Capacitor external-phone dispatch contract, and missing/invalid microphone privacy-string cases.

Website: `bun vitest run --config vitest.config.unit.ts tests/lib/phone-call-href.test.ts tests/app/driver-phone-dialer.test.tsx` covers formatted/local/international phone links, invalid or injected inputs, safe driver links, and no dialer event for invalid values. All use in-memory fixtures; no orders, calls, or communications are created.

## Device gate — not replaced by passing source tests

Use the connected approved physical device and the developer website on port 3000. Do not place test orders against production or call a real recipient.

1. Sync/build a development wrapper with the local web origin. Confirm the installed bundle still identifies as `com.trashed.driver` and displays **Trashed**.
2. Sign in with the permitted existing development account. Check vendor `/app` entry opens its dashboard; check driver-only entry opens `/driver`. Confirm web navigation stays inside the app.
3. Cold launch, navigate between several pages, and dismiss/reopen dialogs. Splash should run once per cold WebView session. Onboarding should persist across later launches.
4. On iPhone, inspect top/bottom/left/right WebView bounds against native safe-area bounds. Inspect CSS `env(safe-area-inset-top)` inside the constrained WebView: it should be zero, not add the native inset again. Verify back/close controls stay below the status bar in portrait and landscape, with no doubled top gap.
5. Tap a development customer phone link. Confirm the correct normalized number in the iOS confirmation or Android dialer, then **cancel/back without placing the call**. Ensure returning to Trashed preserves the page and does not replay the splash. A dialer-open event is not proof of a completed call.
6. Microphone access requires a separate approved permission interaction; declaring the permission is not proof of capture or audio quality.

An Android device check remains required when hardware is available. Do not label unexecuted device checks as passed.

## Android local build evidence — 2026-09-14

- Development debug APK and instrumentation APK compiled successfully with JDK 21 / API 36. Packaged app remains `com.trashed.driver`, displays **Trashed**, supports API 23+, and targets API 36.
- APK inspection confirmed `https://trashed.local/app?source=trashed-app`, both audio permission declarations, optional microphone hardware, and absence of `CALL_PHONE`. Debug signature verified.
- Android lint completed with **0 errors / 33 warnings**, primarily launcher-art warnings. The existing JVM starter test passed; it only checks arithmetic and is not feature proof. Instrumentation tests initially compiled without execution. Follow-up on a read-only API36 emulator passed **2/2**: native login/empty-input validation and measured WebView bounds against system bars/display cutout. See `artifacts/native-experience/android/runtime/AndroidReleaseTest-results.json`. Physical Android and manual dialer/visual checks remain unverified.
- Evidence and development APK are under `artifacts/native-experience/android/`; `verification.json` records the APK SHA-256. The follow-up localhost development APK was installed only on the disposable emulator; no APK was uploaded.
- After capture, Android's generated configuration was restored to `https://trashed.app/app?source=trashed-app`. The retained debug APK still contains the development URL intentionally.

## Backend release preflight — 2026-09-14

- TestFlight upload and Android release mode run the shared `scripts/check-mobile-backend.mjs` before artifact/dependency/signing work. Android verification mode is unchanged.
- The gate makes one read-only `GET https://trashed.app/app`, without cookies or redirect following, with a 20-second timeout. It requires HTTP 307 to same-origin `/app/login` with exactly `callbackUrl=/app` and `source=trashed-app`; network errors, missing routes, and unexpected redirects block release.
- The production check returned **HTTP 404 / exit 3** on this date, correctly blocking release until the website entry is deployed. Re-run the gate after web rollout; this result is not a claim about later production state.
- The mobile suite passed **94/94** tests, including mocked redirect/error cases and proof that both release scripts stop before downstream work. Shell syntax and diff checks passed. No signing or upload was performed.

## Platform references

- [Apple phone URL behavior](https://developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/PhoneLinks/PhoneLinks.html): system confirmation is required before dialing.
- [Android Intent API](https://developer.android.com/reference/android/content/Intent): `ACTION_VIEW` with `tel:` opens the populated phone dialer; it is distinct from `ACTION_CALL`.

Production smoke must stay read-only: inspect deployed app/login routes, authentication boundaries, and response status. A local-only native build or a successful route response does not establish that either store release has been published.


## Native pre-login walkthrough follow-up — 20:53 UTC

The walkthrough now runs offline in both native shells **before** cookie recovery, login, or any remote WebView request. Four bundled pages cover vendors/drivers, routes, phone-dialer links, and operational notifications. Only Skip/Get started writes local completion version 1; interrupted onboarding restarts at page 1. Completed launches resume the existing login/session path. A one-time WebView bootstrap gate preserves Capacitor's existing navigation/client/plugin behavior after completion. The full existing user agent is retained with one exact `TrashedOnboarding/1` UI-only marker; it grants no auth, roles, or device permission. The web companion skips duplicate intro and sequences workspace/inventory/notification/welcome prompts.

**Automated:** latest complete mobile suite **99/99**; Android API36 combined instrumentation **7/7 in 79.648s**, including both pre-completion `loadUrl` overloads blocked, persistent synthetic-cookie recovery, Next/Back/recreate/Skip, completion/UA preservation, unchanged permissions, login validation, measured safe areas/bar flags, and populated ACTION_VIEW dialer with no call. The tests assert disposable emulator hardware and exact localhost:3000 package URL before resetting test state. Counts supersede earlier 94/3 results, not add to them.

**Actual iOS Simulator:** retained-session and explicitly signed-out first launch both showed native intro. Four pages, Back/Next, interrupted relaunch, completion persistence, later relaunch, Skip→login, local QA sign-in without duplicate web intro, and logout passed. Notification permission was declined. Final button-label hit-area refinement was rebuilt and verified with real taps away from the label text on Next/Back/Skip. Final simulator dylib SHA256: `6b05ad0147871c680c6357702643ad5485926a60a74402c7d6a39683cfc038cc`. Evidence: `/Users/georgebyers/GitHub/trashed-app-mobile/artifacts/native-experience/first-launch/ios-native-onboarding-results.json`. This is not physical-device/VoiceOver proof.

**Android visual gate remains unresolved.** Despite passing bounds/behavior checks, UIAutomation, PixelCopy and one bounded normal screencap produced inconsistent/missing unchanged regions; root review could not accept complete page 3/4 artwork. No production redraw workaround or screenshot retouch was applied. The diagnostic capture is not a visual pass or an additional functional test. Full Android device/screen verification remains required before release. Exact APK/testAPK/source hashes, failed fixture/callback attempts, final 7 run, and cleanup: `/Users/georgebyers/GitHub/trashed-app-mobile/artifacts/native-experience/first-launch/native-agent-final/android-native-onboarding-results.json`.

The disposable Android emulator was closed without snapshot; iOS remains at empty native login. Generated repository configs were restored to production, while retained development artifacts intentionally target localhost:3000. No orders, calls, pushes, or permission grants occurred.

## Three-screen illustrated onboarding — 2026-09-15

This redesign supersedes the **visuals and four-page copy** in the earlier walkthrough evidence, not its first-use lifecycle. The new offline pages are **Your waste service business in your pocket**, **Real-time customer chat**, and **Hauler and dispatch**. Each has one short benefit sentence and one simple local illustration, the approved purple symbol beside the native wordmark, flat purple actions/progress, and a neutral canvas. Hero images are aspect-fit without a card, border, or shadow. Content scrolls separately from the reachable Back/Skip and Next/Get started controls; iOS uses Dynamic Type and Android uses scaled text.

Completion version remains **1**: existing completed users are not forced through the intro again. The native bootstrap still prevents web requests and permission prompts before completion, preserves the full original user agent, and appends the same UI-only completion marker. No auth, push, location, or call behavior changed. The superseded four complex illustrations are not bundled in either app.

**Verified source/build gates:** the full native suite passed **121/121**, including actual compiled Swift/Java policy tests and new offline-resource, page-count, contrast, unframed-image, and action-size contracts. The three source illustrations were copied byte-identically into both native resource trees; both compiled artifacts include them. The signed physical-iPhone development build **202609151515** compiled and passed strict signature verification; its configured web origin is the approved LAN Mac on port 3000. Android app and instrumentation APKs compiled with API36 and contain only the exact localhost:3000 development entry. Production resource configurations were restored byte-exactly. Evidence and exact source/binary hashes: `artifacts/native-experience/onboarding-redesign/implementation-manifest.json`.

**Not implied by these results:** physical/device visual acceptance, Dynamic Type/VoiceOver/TalkBack usability, compact/landscape presentation, and an actual Android system Files picker remain separate acceptance gates. Earlier four-page simulator and Android screenshot results do not prove this redesign. Fresh Android synthetic instrumentation results are recorded separately below once run; intercepted native file intents/test-provider copies are not real system-picker UI proof. No production release or store upload was performed for this check.

**Login polish in the same native patch:** Google and email Sign In use explicit plain SwiftUI button styling, matching 50-point/14-point-rounded geometry alongside the unchanged official Apple button. Google has one thin neutral outline; enabled Sign In is flat purple/white with a quiet contrast-safe disabled state. Android uses the same palette and flat 50dp controls. Fields, copy, and existing background artwork use neutral/purple colors; authentication, account linking, validation, and keyboard/scroll layout remain unchanged. The preferred AI on-the-go benefit sentence appears on both platforms. Source contracts and Android measured button/header assertions cover this change; actual final iPhone appearance remains parent-owned acceptance.
