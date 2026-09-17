# Android native dashboard and system appearance

Android owns `/vendor/dashboard` and `vendor-dashboard` through the existing direct presentation lease: no WebView navigation, auth/scope/document/menu ownership checks retained. The new version-1 dashboard DTO is fetched once per refresh at `/api/mobile/dashboard` with exact-origin, per-request session cookies, no redirects/no cache and cancellation. Snapshot scope changes invalidate the screen. Canvas bars, Month/Year metrics, selectable accessible chart data, rentals/customer/available cards and inventory types are real data; empty/zero/error states are distinct. Existing snapshot remains during refresh/failure. Advanced dashboard mutations remain web-only and are not represented by fake controls.

Appearance is OS-authoritative on configuration change/resume. Recolors existing widgets without changing editors, scroll/list, transcript or audio; mutable tokens style subsequently created widgets. Navigation ignores stale projected dark booleans. Same-origin-only JS event `trashed:system-appearance` carries appearance only. Chat gets immediate palette correction while web projection catches up. No Activity restart/theme network refresh is initiated by configuration repaint.

## Executed verification

- Qualified isolated Gradle `:app:testDebugUnitTest :app:assembleDebug :app:assembleDebugAndroidTest` succeeded. Unit XML: 34 tests, 0 failures/errors (5 new dashboard cases).
- Installed both debug APKs with `adb -s emulator-5560 install -r` (no uninstall/reset).
- Real emulator runner: `NativeSystemAppearanceTest,NativeDashboardScreenTest` => `OK (3 tests)`: existing edit text and cursor survive both repaint directions; white primary-button label remains legible; dashboard Month/Year and accessible month selection operate and preserve snapshot/selection during repaint.
- Build log: `/tmp/trashed-dashboard-build.log`. APKs: `android/app/build/outputs/apk/debug/app-debug.apk` and `android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk`.
- No Play upload, release signing, production writes, backend/iOS edits or dependency changes.

## Parent integration verification
The initial implementation-only limitations below are historical. The parent recovered the timed-out follow-up, rebuilt the application and exercised `NativeAppearanceActivityTest` in the real MainActivity using authenticated loopback fixtures. It verifies dashboard period/scroll/snapshot, profile editor/cursor and discard dialog, transcript view and playing MediaPlayer retention through live OS uiMode changes, with no theme-triggered data refetch or Activity recreation. The emulator appearance is restored afterward.

The dashboard now has a revenue card, Month/Year controls, native axes/month labels and a responsive metric grid. Parent retinted toolbar overflow and synchronized both legacy and WindowInsetsController system-bar flags. Final screenshot capture validates background and contrasting status glyph pixels before saving the same bitmap.

Final Activity run: **OK (1 test)**; separate combined dashboard/appearance run: **OK (4 tests)**; JVM: **34 passed**, no failures/errors. Logs in enclosing workspace: `outputs/dashboard-android-final-ui.log`, `outputs/dashboard-android-parent-final-build.log`, `outputs/dashboard-android-pixel-proof.json`; screenshots `outputs/dashboard-android-light.png` and `outputs/dashboard-android-dark.png`.

This does not certify all arbitrary projected chat content, large-font/TalkBack permutations, every external/system dialog, or production-native API integration. Existing web-only dashboard actions are not native parity. No store upload or production write.

## Initial implementation limitations (before parent follow-up)

This bounded implementation is not full visual/end-to-end acceptance. No live authenticated dashboard endpoint was exercised; DTO/routing tests and on-device synthetic widget tests are not live API evidence. No screenshot matrix, full shell dashboard direct-navigation test, dashboard HTTP failure/401/403 race instrumentation, full-device uiMode toggle with active audio, or font-scale/TalkBack traversal was performed. Existing direct-navigation ownership checks remain unchanged.

Immediate recoloring maps the known native palette in place. Arbitrary measured chat CSS colors, embedded rasterized text/spans, separately opened date pickers and transient confirmation/tool dialogs are not comprehensively recolored/tracked; primary profile editor, navigation sheet and conversation dialog are tracked. Thus full app-wide appearance parity remains a verification/follow-up item, not a proven result. Repainting does not recreate native workspace or refetch; normal pause/resume retains the pre-existing request/audio suspend/resume policy. Dashboard chart data disclosure provides accessible selection rather than individual virtual Canvas bar nodes. Advanced dashboard mutations remain explicitly outside native coverage.
