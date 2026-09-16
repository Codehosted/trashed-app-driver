# Android workspace HTTP client regression checks

The API-backed native account/call client uses named JSON endpoints and authenticated same-origin recording paths. It is not an HTML projection.

## Repeatable focused checks

```sh
python3 scripts/test-android-native-workspace.py
# Or through normal Android CI, with JAVA_HOME and ANDROID_HOME set:
./android/gradlew -p android :app:testDebugUnitTest :app:lintDebug
```

The Python runner compiles the **actual** Java policy and API client with the already-resolved JUnit and JSON jars. It only uses temporary compilation output and loopback test sockets. It does not touch production APIs, credentials, customer records or shared Gradle builds. Test artifacts and synthetic response bodies are test-only.

## Evidence boundaries

- JVM loopback tests exercise actual HTTP GET profile/call pages, encoded search, post-request workspace checks, redirects, unauthorized/forbidden/server failures, MIME validation, Set-Cookie delivery/identity rotation, audio download and cleanup.
- Save semantics use an explicitly injected connection double because desktop JDK `HttpURLConnection` rejects PATCH. **This does not prove Android PATCH transport**: instrumentation against a loopback fixture must prove the Android implementation before shipping.
- Policy tests cover canonical profile/calls routes; keep unconverted account tabs and driver-local settings in their existing screens, reject cross-origin/provider recordings and encoded traversal, and hash identity cookies including session chunks/impersonation rather than UI or analytics cookies.
- Value equality for immutable call rows supports DiffUtil without rebuilding unchanged rows. Profile-save readback compares against the server's returned normalized fields, not unnormalized input.
- The live UI must construct the API with `CookieSource`, reading cookies for the exact request URL and applying server-issued Set-Cookie attributes through CookieManager. The static-string constructor is for controlled fixtures; do not treat its frozen state as a live cookie store.
- Native audio uses one platform MediaPlayer and a bounded private temporary file. Stale player callbacks must not affect a newer recording. Playback/collapse, audio focus, seek, session change and lifecycle require emulator verification in addition to JVM tests.

Current recovery check: 15 JVM tests passed. The five real emulator regressions in `NativeWorkspaceRegressionTest` also passed, including Android PATCH transport+GET readback, native playback/collapse/seek, search, session revocation and actual OS cookie path/rotation behavior. Host routing is compiled; normal authenticated shell end-to-end integration remains separate. See `docs/native-workspace-android.md`. No production release is implied.
