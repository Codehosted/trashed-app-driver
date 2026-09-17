# Android dashboard dock verification

Scope: Android native dashboard host/dock integration and focused tests only. No API/session changes, iOS edits, install, signing, or release.

## Findings

- The existing `NativeBottomNavigation` owns a vertical LinearLayout with weighted content followed by a measured WRAP_CONTENT dock. MainActivity replaces only that weighted WebView slot with `chatContainer`, so the native dashboard cannot cover the dock.
- MainActivity applies system bars/display cutout/IME insets once to the outer content. The dock explicitly avoids applying them again. Keyboard hides the dock and the weighted content resizes; call list/player remain in their existing layout.
- Direct dashboard routing does not navigate the underlying WebView, so its selected tab can remain stale. Correct native dashboard selection must be presentation-only, retain the exact offered tabs/actions, and restore web selection on close.
- Dashboard footer currently has only the shell's 8dp bottom padding. Add scrollable end breathing room, not a guessed dock-height spacer (the layout already consumes actual dock height).

## Verification

- Added dashboard-only 24dp scrollable footer padding in `NativeWorkspaceView.java`; measured dock and system inset consumption remain unchanged.
- Added presentation-only dashboard selection in `NativeBottomNavigation.java`, integrated at native workspace open/close in `MainActivity.java`. Existing tab contents, IDs, context/revision checks, keyboard gating and direct-native dispatch remain intact; web state is not mutated.
- `node --test tests/android-dashboard-dock.test.mjs tests/native-bottom-navigation-android.test.mjs tests/android-native-compatibility.test.mjs`: 11 passed, 0 failed. New dock checks are source-contract tests, not device geometry tests.
- With `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home` and `ANDROID_HOME=/opt/homebrew/share/android-commandlinetools`, ran `android/gradlew -p android --offline :app:testDebugUnitTest :app:assembleDebug :app:lintDebug`: exit 0. Unit XML: 34 tests, 0 failures/errors/skipped. Debug APK exists; lint completed with warnings. Log: `/tmp/trashed-android-dashboard-dock-gradle.log`.
- `git diff --check`: passed.
- Parent emulator instrumentation now passes through actual MainActivity direct-native Dashboard, preserves source document/history and validates selection. Final footer rect=(53,2028)-(1027,2106), measured dock=(0,2190)-(1080,2337), giving84physicalpixels clearance; entirefooterheight visible. Actual renderer screenshot `outputs/android-dashboard-dock-footer.png` inspected. Instrumentation `OK (1 test)` in `outputs/android-dock-emulator-test.log`; geometry `outputs/android-dashboard-dock-geometry.log`. Synthetic loopback session only; original onboarding prefs and production/loopback cookies restored by the test.
- No Play production release claimed; this is emulator runtime proof with debug-signed APK.
