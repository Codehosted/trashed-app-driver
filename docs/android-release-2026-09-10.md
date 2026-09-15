# Android release readiness — September 10, 2026

## Verified Google Play state before submission

- Package: `com.trashed.driver`.
- Production: **1.0.2 (3)**, available on Google Play at **100% rollout** in the United States. Last published August 13, 2026.
- Publishing overview: no unpublished changes; managed publishing is off.
- Developer verification: all apps registered successfully.
- Sole active policy issue: updates must target **Android 16 / API 36**. Production currently targets API 35.
- Google Play requires a compliant production release before it clears this issue. A local build or draft upload does not clear it.
- R8 optimization is a recommendation, not a release blocker. Optimization settings were not changed for this compatibility release.

## Submitted release: 1.0.3 (4)

- Compile and target SDK raised to 36; minimum SDK remains 23.
- Android Gradle Plugin raised to 8.10.1, which supports API 36 with the existing Gradle 8.11.1 wrapper.
- Release script now rejects missing version metadata before building, preventing accidental fallback to version code 1.
- Native content now applies system-bar and display-cutout insets to both the login overlay and WebView. An Android 16 instrumentation test reproduced the status-bar overlap before this fix.
- Google Play upload certificate matches the existing local signing key. No keys, permissions, account settings, or iOS files were changed by this task.

## Artifact validation

- Mobile contract tests: 28 passed.
- Final native release build and unit tests: passed; Android lint reports zero errors (33 non-blocking warnings).
- Android 16 emulator: both instrumentation tests passed against the signed release APK (native login/empty-field validation and system-bar/cutout bounds). Before the inset fix, the bounds test failed with `WebView overlaps the status bar`.
- APK and AAB signatures verified. Upload certificate SHA-256: `A8:7C:28:49:C6:4A:87:37:DA:9D:42:85:F0:9A:CD:0F:09:3E:9F:A1:0F:CE:FF:F9:7F:25:CE:E8:2F:CB:41:98`.
- Bundletool validates the actual AAB and confirms version `1.0.3`, code `4`, target/compile SDK `36`, and minimum SDK `23`.
- 16 KB APK alignment check passed; the bundle contains no native `.so` libraries.
- Production Google sign-in configuration returns HTTP 200 and `configured: true` for the Android user agent. This is not a completed Google sign-in test.
- No physical Android handset was connected. Real-device Google sign-in, tracking, and FCM delivery were not retested. No customer messages, bookings, or charges were made.

Release artifacts:

- `artifacts/android-api36-20260910/trashed-driver-1.0.3-4.aab` — SHA-256 `55b355d2879a8fda50317ae6438510179fdc1b197f041ab6f6c015fe16854381`.
- `artifacts/android-api36-20260910/trashed-driver-1.0.3-4.apk` — SHA-256 `77993123b04a05f5a3a247c7537aacc25dfc3096425772f0f93f2badaa20cdfd`.

## Release boundary

The user explicitly authorized resubmission on September 10, 2026. The verified AAB was uploaded to the existing production track, and Google Play accepted version **1.0.3 (4)** with target SDK **36**. Its release validation reported no blocking errors and one non-blocking warning about the absent deobfuscation file; R8/ProGuard obfuscation remains disabled. Supported device counts were unchanged.

The production change **1.0.3 (4) - Android 16 compatibility** was sent for review on September 10, 2026. At **19:29 UTC / 3:29 PM EDT**, Google's automatic quick checks had completed, and the authenticated publishing overview explicitly confirmed: **Your changes are now in review.** The production release remained listed under **Changes in review** with **Start full rollout**. This is verified review submission, not approval or publication; Google may identify additional issues during review.

The release retains full rollout to the existing targeted countries (United States). Managed publishing remains off, so Google approval publishes the update automatically. No other Play Console changes were submitted, and iOS work was left untouched.

- [Google Play publishing overview](https://play.google.com/console/u/1/developers/6938821433952276828/app/4973143831974738728/publishing)
- [Production track](https://play.google.com/console/u/1/developers/6938821433952276828/app/4973143831974738728/tracks/production)

Evidence and release artifacts are kept under `artifacts/android-api36-20260910/`. The isolated build is under `build/android-api36-release/` to avoid interfering with concurrent iOS work.

## References

- [Google Play target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878)
- [Android Gradle Plugin 8.10 compatibility](https://developer.android.com/build/releases/agp-8-10-0-release-notes)
- [Android 16 behavior changes](https://developer.android.com/about/versions/16/behavior-changes-16)
