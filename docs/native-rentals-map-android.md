# Android native Rentals map

## Integration

`vendor-rentals` is consumed by `MainActivity.openDirectWorkspace` before the web navigation listener. The existing navigation context/revision/offered-action gate remains authoritative. A native route lease is bound to the source document, session fingerprint and navigation-document generation; native selection does not navigate the underlying WebView. `NativeBottomNavigation` projects Rentals selection without modifying offered actions. Dismissal restores the source selection.

`NativeWorkspaceView` creates `NativeRentalsMapView` and calls `GET /api/vendor/rentals/map` through the existing cookie-scoped, no-store, redirect-rejecting transport. Version, scope, counts, coordinates and app-relative rental-detail hrefs are validated before presentation. Optional confirmation codes may be absent. No endpoint response or private markers are persisted.

## Screen

- Native Canvas street tiles, compact rental dots, selected-marker halo, pan/pinch, accessible zoom buttons and Fit all.
- Search and status filters run locally over the full returned mapped rental set. Counts disclose rentals lacking coordinates.
- Marker tap or the accessible Choose rental control opens a scrollable bottom detail panel.
- Explicit `Rental details · Web` and `Rental list · Web` actions; the latter uses `/vendor/rentals?view=list`, which deliberately bypasses native map interception.
- Loading, successful-empty, no matches, transport/malformed-data retry, and authorization invalidation are separate paths.
- Refresh drops old markers before fetching. Suspension, session invalidation, close and disposal clear private map/detail/dialog state. Scope IDs survive only ordinary suspension/refresh to detect a changed response scope. Closing disposes the tile loader.
- Public OpenStreetMap raster tiles retain the existing bounded seven-day cache and attribution; tile requests carry no application cookies. No location permission, new SDK, WebView map or paid key is introduced.

## Verification

Run from the worktree:

```sh
python3 tests/android-native-rentals-map.py --compile-native
```

The runner executes real loopback transport and pure-Java DTO/policy/viewport JUnit tests, source-contract guards for native-before-web routing and screen wiring, and compiles all app Java sources with JDK 21 against Android 36 plus existing cached AAR/JARs. It uses the already generated resource `R.jar` and Capacitor libraries from sibling `trashed-app-mobile` (override with `ANDROID_CACHED_BUILD`; override SDK with `ANDROID_JAR`). It creates temporary output only and never downloads dependencies or runs Gradle.

This is Java/type and contract verification, not a resource rebuild, APK build, emulator install or device UI test. The initial source-only check was followed by the emulator pass below. Small-screen/keyboard geometry, raw pan/pinch/marker gestures, accessibility traversal, shell routing and live permission revocation remain separate coverage gaps.

### Emulator QA (2026-09-17)

Built `:app:assembleDebug :app:assembleDebugAndroidTest` offline with JDK 21/Android SDK 36, installed both APKs with `adb -s emulator-5560 install -r` (no uninstall/reset), and ran `NativeRentalsMapScreenTest` through AndroidJUnitRunner: **OK (2 tests)**. A warmed-cache light repeat returned **OK (1 test)**. The instrumentation uses real Android widgets, API transport, an isolated loopback fixture on port 3423, and synthetic data only; it does not launch the production shell or modify its cookies.

Verified light/dark five-pin map, one-unmapped disclosure, native chooser and selected bottom panel, local search/no-match/status filter, zoom-in/Fit all button actions, 503 marker clearing and Retry recovery, successful-empty state, and account-identity clearing of markers/details. Screenshot review confirmed complete street tiles and selected halo in both modes. Button interactions are native `performClick`/list selection and text editing, not injected finger/keyboard gestures. Fit all was exercised but viewport bounds were not asserted in this instrumentation.

Artifacts: `/Users/georgebyers/Documents/Codex/2026-09-15/i-n/outputs/native-rentals-map/android/` contains `build.log`, `rebuild.log`, `instrumentation.log`, `light-recheck.log`, `isolated-build.gradle`, and 14 `rentals-*.png` screenshots under `screenshots/native-workspace-qa/`. APKs remain at `android/app/build/outputs/apk/debug/app-debug.apk` and `android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk`.

Run the fixture with `python3 scripts/native-workspace-fixture.py --port 3423`, reverse with `adb -s emulator-5560 reverse tcp:3423 tcp:3423`, then invoke `adb -s emulator-5560 shell am instrument -w -r -e class com.trashed.driver.NativeRentalsMapScreenTest com.trashed.driver.test/androidx.test.runner.AndroidJUnitRunner`. The shared fixture expects synthetic `next-auth.session-token=local-ui-fixture`; the test supplies it through its test-only host, without overwriting the real CookieManager. Initial fixture-auth mismatch was corrected in the test; no production-code defect was found in this pass.

Cold tile downloads can outlast the first screenshot delay; inspect tiles visually and recapture after warming rather than labeling incomplete imagery final. The test sets OS light/dark mode; restore the emulator's original mode after running.
