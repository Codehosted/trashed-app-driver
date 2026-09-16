# Android API-backed native workspace

## Implementation

MainActivity routes the named `/vendor/profile` overview and `/calls/history` (including the legacy alias) into NativeWorkspaceView. Its RecyclerView rows, editor, search, pagination and MediaPlayer run on native Android, not an HTML projection. Unconverted profile tabs/driver settings stay in the existing shell. Deliberate **Full call workspace · Web** bypasses native interception so favorites/forwarding remain reachable; live monitoring uses the existing `/calls/monitor` route. No invented favorites or forwarding URL.

- Native MaterialToolbar, shared Jakarta fonts, flat light/dark tokens, standard dialog editing and accessible controls.
- Per-account/role/permission-scoped data; cancelled/stale request results rejected. NativeWorkspaceCookieStore reads the OS cookie jar for each request URL and waits for server-issued cookie updates off the UI thread. Identity changes between initial validation and outgoing headers are rejected.
- Native PATCH response normalized fields must equal authenticated GET readback. Server errors keep the draft;401 and changed sessions clear protected UI.
- Single native MediaPlayer persists through row collapse, supports seek/pause/speed/stop and handles focus/lifecycle cleanup. The app fetches only exact same-origin recording endpoints into bounded private temporary files, revalidates workspace after download, and never gives cookie-bearing URLs to MediaPlayer.
- Debug network exception is loopback-only in src/debug; no global cleartext exemption or release auth bypass. Test activity implementations ship only in the instrumentation APK and are nonexported.

## Repeatable verification

```sh
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
ANDROID_HOME=/opt/homebrew/share/android-commandlinetools \
./android/gradlew -p android --offline --no-daemon \
  :app:assembleDebug :app:assembleDebugAndroidTest :app:testDebugUnitTest :app:lintDebug

python3 scripts/test-android-native-workspace.py
python3 scripts/verify-android-native-workspace.py \
  --emulator emulator-5560 --output ../../outputs/android-workspace-verified
```

The verifier requires an already-booted explicitly named emulator and built APKs. It does not reset/uninstall the app or access production endpoints. NativeWorkspaceRegressionTest owns an actual loopback HTTP fixture and uses synthetic account/call data only. Screenshots wait for idle and two rendered frames; view-tree state alone can precede compositor output. Inspect screenshots rather than treating their existence as visual success.

## Verified checkpoint

- Debug app/test APK builds passed; lint zero errors.
-24Java unit tests passed, including15focused workspace policy/HTTP tests.
-5emulator regressions passed: Android PATCH+GET save/readback and validation; pagination/session revocation; native playback/collapse/seek/pause/speed; error/draft/retry and401; native search/empty state; OS CookieManager path/origin/rotation checks are included in the five test methods.
-9screenshots captured and inspected: light/dark profile, saved profile, calls, expanded/collapsed audio, error, expired account and search.
-164mobile source checks passed,2release-artifact checks skipped. Old tests updated to include the fifth debug-only test host and native editor dismissal before web Back; existing isolation checks remain enforced.

The initial cookie runtime test hit cold WebView initialization inside the five-second write timeout. Test setup now initializes the real CookieManager first, matching MainActivity startup, without increasing the production timeout.

## Remaining gates

This is **local fixture-backed verification**, not production rollout or live provider proof. MainActivity route wiring is compiled and reviewed, but normal authenticated shell entry/back/web-fallback needs a separate end-to-end pass. Full-native account preferences/security/avatar, live calls/favorites/forwarding/stats, real-backend session refresh, background/foreground race cases, provider push and other main screens remain separate migration work. Native data caches are currently memory-only; no durable offline account/call cache is claimed.
