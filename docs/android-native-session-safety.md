# Android native workspace session safety

## Change
`NativeWorkspaceApi` is now a read-only consumer of the shared Android cookie jar, matching the iOS data-transport boundary. It does not install or delete response cookies for JSON GET/PATCH, audio, redirects, or error responses. Authentication/login code still owns cookie writes.

This prevents a delayed account-A response from overwriting account B's newer login. Data requests retain the outgoing identity check and recheck the live identity before publishing results. Cancellation/interruption is checked after headers, at EOF (including empty bodies), after stream closure and after the final cookie-source callback. Cancelled audio downloads are deleted rather than exposed.

Confirmed email changes still surface `EmailChanged` from the server's explicit `reauthenticationRequired` response. Ignored cookie deletion cannot turn a persisted email change into a misleading failed-save result.

## Tradeoffs / scope
- Native workspace reads do not prolong sessions through response-cookie renewal. Backend revocation and HTTP401/403 remain authoritative.
- Android still invalidates its screen when another component changes the session cookie. Automatic same-account rolling-token recovery is a separate follow-up; it is not implemented by this patch.
- No auth/login cookie writer, iOS source, backend endpoint, account permissions, or notification-send path changed.
- Release tooling now validates all signing fields and keystore readability before network checks, artifact cleanup, dependencies or build. Tests exercise missing-field guards without loading real credentials or invoking network/build commands.

## Verified
Parent rerun, not just worker reports:
- Full Node suite: **190 passed, 2 release-artifact checks skipped, 0 failed** (192 total).
- Android Java unit suite: **38 passed**, no failures/errors/skips.
- Offline debug APK + instrumentation APK build and Android lint succeeded; lint: **0 errors, 61 warnings**.
- Real emulator instrumentation: **5 passed** across `NativeWorkspaceCookieRaceTest`, `NativeWorkspaceShellTest`, and `NativeCallTranscriptScreenTest`.
- Cookie race instrumentation uses real Android CookieManager and HTTP on loopback. It verifies stale rotation/deletion cannot change the newer cookie, GET/error/redirect responses leave cookies unchanged, and actual Android PATCH preserves the explicit email reauthentication result. It restores preexisting loopback and production cookies and the cookie-acceptance setting.
- Shell/transcript checks retain native navigation, dashboard dock clearance, transcript behavior and audio continuity.
- APK configuration points to `https://trashed.app`; the tested APK is debug-signed, not a Google Play release.

Parent workspace evidence: `outputs/android-session-safety-parent-build.log`, `android-session-safety-parent-emulator.log`, `android-session-safety-parent-node.log`.

## Repeat
```sh
node --test tests/*.test.mjs
bash -n scripts/ci-build-android.sh
# With the installed JDK/SDK paths configured:
android/gradlew -p android --offline :app:testDebugUnitTest :app:lintDebug :app:assembleDebug :app:assembleDebugAndroidTest
adb -s <approved-emulator> shell am instrument -w -r \
  -e class com.trashed.driver.NativeWorkspaceCookieRaceTest,com.trashed.driver.NativeWorkspaceShellTest,com.trashed.driver.NativeCallTranscriptScreenTest \
  com.trashed.driver.test/androidx.test.runner.AndroidJUnitRunner
```
Install the just-built debug app and test APK before instrumentation; do not reset or uninstall the user's app. Check `OK (5 tests)` in runner output, not merely adb's exit status.

No physical iPhone actions or transfer interference. No production notification sends or Play upload. Google Play sign-in and signing-key authorization remain external release prerequisites.
