# Android direct native navigation — first correction

Only `vendor-profile` and `vendor-call-history` selections are consumed by the native shell. They open the existing API-backed profile/calls screens without forwarding the selection to JavaScript, loading a destination WebView URL, or altering web history. Other actions retain the existing bridge callback and log an `Unconverted action` marker (opaque ID only).

A native route lease binds the source URL, source-document generation, and authentication/scope cookie fingerprint. The rendered destination URL is independent of the WebView URL. Resume retains this route; actual source navigation, document replacement, logout, and changed scope revoke it. Hardware Back and toolbar Back dismiss direct native presentation locally, preserving the original WebView, URL, history, DOM draft and scroll state. Existing editor confirmation and API cookie guards remain active. Explicit “Web” tools intentionally navigate and remain unconverted.

This is NOT a 100%-native migration. Existing URL-triggered native interception remains for deep links. Navigation state and unsupported routes still use the web shell. No deployment, Play upload, signing edits, device installation, or production writes are part of this correction.

## Parent integration verification

The parent subsequently built and installed the app/test APK on the approved `emulator-5560`, using synthetic loopback data. `NativeWorkspaceShellTest` and `NativeCallTranscriptScreenTest` passed together: **OK (2 tests)**. This supersedes the implementation-only no-install limitation below.

The parent added a failing real-Activity regression for clearing the navigation owner, then fixed context/revision validation. Active native screens now dismiss when their navigation owner is cleared/replaced or stops offering the action. Retired listener calls cannot reopen them; unrelated-owner clears do not dismiss them. Source document, cookie identity, API authorization and editor guards remain intact.

Parent evidence in selected workspace: `outputs/direct-android-owner-red.log`, `outputs/direct-android-owner-green-build.log`, `outputs/direct-android-owner-green.log`. App unit tests: **29 passed, zero failures/errors**. Mobile Node suite: **170 passed, zero failed, two skipped**. No production signing/upload/deploy performed.

## Implementation-stage verification

- `NativeWorkspaceRouteTest`: supported IDs, unchanged source, unknown actions, document departure, authentication and tenant-cookie revocation.
- `NativeWorkspaceShellTest`: real MainActivity with loopback fixture; direct selections must leave URL/document/history unchanged and never invoke fallback listener; resume, hardware/toolbar return, cookie revocation and DOM retention assertions.
- Gradle outputs isolated from shared node_modules with `/tmp/trashed-native-navigation-isolated.gradle`.
- Runtime instrumentation requires an explicitly approved emulator; no installation/run performed in this bounded implementation task.
- Executed `:app:testDebugUnitTest --tests com.trashed.driver.NativeWorkspaceRouteTest --tests com.trashed.driver.NativeWorkspacePolicyTest :app:compileDebugAndroidTestJavaWithJavac`: exit 0, 8 unit tests passed (4 route + 4 policy), 0 failures/errors. Final rerun after toolbar test change also exited 0. Logs: `/tmp/trashed-direct-nav-gradle.log`, `/tmp/trashed-direct-nav-gradle-final.log`. Instrumentation compiled, not runtime-verified.
- Existing dependency warnings: flatDir metadata, deprecated Java 8 target in background-geolocation, deprecated APIs/unchecked operations. No signing/dependency changes.
