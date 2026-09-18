# Native dock avatar implementation and QA

## Implemented

- **Trisha** replaces Assistant in both native iOS docks and Android's native bottom navigation. Uses the existing branded waving GIF, not a generic icon or new generated character.
- Bundled artwork: 96×96, 67 frames / 10 seconds, 327385 bytes, with a still frame for disabled animation.
- Account avatar comes from authenticated `/api/user/profile` (`user.image`), not the WebView navigation payload or vendor owner. Missing/unavailable images use bounded initials.
- Saved DiceBear SVG selections request equivalent PNG with the exact seed/options. Supported HTTPS image origins are allowlisted; redirects, credentials, oversized bodies and decoded images are rejected.
- Private account images remain memory-only and clear on account/document retirement and lifecycle transitions. Raster icons remain untinted while standard navigation symbols preserve selected colors.

## Verified

- Full mobile regression: **197 passed, 0 failed, 2 release-artifact checks skipped**.
- iOS focused suite: **61 passed**, plus subsequent focused URL/lifecycle/artwork checks passed.
- Android avatar policy: **7 JUnit tests passed**; existing native workspace/rental JVM suite: **40 passed**.
- Full Android Debug/instrumentation build succeeded; installed on existing emulator5560 without uninstalling.
- Actual Android instrumentation: **OK (3 tests)**. Validated changing GIF pixels, raster color preservation, animation stop on keyboard/reset, rejection of stale asynchronous results, authenticated profile→public image loading and immediate account-scope clearing.
- Full iOS Debug build succeeded; installed/launched on Trashed-Parity-QA `DAA318E0-7950-4B30-9AA3-9ABB26A94795`.
- Real iOS SwiftUI root and UIKit docks rendered Trisha and the saved-image fixture. Separated screenshots showed changed Trisha pixels in both implementations. UIKit light/dark screenshots inspected.
- Changing saved image to null and refreshing through background/foreground replaced the old photo with new profile initials; restoring the image restored the photo.
- Recorded profile requests carried session cookies; avatar image requests carried neither Cookie nor Authorization.
- Asset-generation script recreated all three source assets byte-for-byte in a temporary directory.

## Runtime bugs caught and fixed

1. Initial GIF optimization dropped alpha before quantization and exposed a green chroma-key background. Corrected by compositing RGBA frames onto `#f3edff`; added Android rendered-pixel assertion.
2. SwiftUI account avatar inside a UIKit-created hosting controller relied on `scenePhase`, which stayed inactive. Replaced with UIApplication lifecycle notifications and confirmed a real image HTTP request.
3. Capacitor's effective `serverURL` included appStartPath. Derived a trusted origin separately for the UIKit avatar loader without weakening saved-image URL validation; verified photo rendering afterward.
4. Updated an overbroad dock source test to allow fixed icon dimensions while still forbidding a fixed-height outer dock.

## Evidence

Artifact directory: `outputs/native-dock-avatars/` in the selected workspace.

- `full-mobile-tests.log`, `ios-tests.log`, `android-build.log`, `ios-build.log`
- `android-instrumentation.log`, `android-profile-recheck.log`
- `avatar-http-trace.json`, `ios-ui-events.json`, `verification-summary.json`
- `ios-root-avatars-fixed.png`, `ios-uikit-avatars-fixed.png`, `ios-uikit-light.png`
- `ios-uikit-profile-refresh.png` (new initials after saved-image removal)
- `ios-animation-{a,b}.png`, `ios-uikit-fixed-{a,b}.png`
- `android-profile-avatar.png` (unobstructed corrected asset)

Initial Android capture contained a System UI ANR dialog. Chose Wait rather than resetting/killing the emulator, reran and recaptured an unobstructed result. Earlier failed captures are not final visual proof.

## Repeatable commands

```sh
# Python with Pillow available; source is the existing backend artwork.
python3 scripts/build-native-trisha-artwork.py \
  --source ../trashed-rentals-map-api/public/images/trisha-avatar-smiling.gif --sync-native
node --test tests/ios-dock-avatar*.test.mjs
python3 tests/android-dock-avatar-policy.py
python3 scripts/native-dock-avatar-fixture.py --port 3424
adb -s emulator-5560 reverse tcp:3424 tcp:3424
adb -s emulator-5560 shell am instrument -w -r \
  -e class com.trashed.driver.NativeDockAvatarTest \
  com.trashed.driver.test/androidx.test.runner.AndroidJUnitRunner
```

For iOS root QA, build with loopback Capacitor origin3424 and launch the existing DEBUG Simulator bootstrap using `SIMCTL_CHILD_TRASHED_WORKSPACE_BOOTSTRAP_ORIGIN=http://127.0.0.1:3424`. Account→Account & security · Web opens the synthetic UIKit dock page, whose native controls fetch profile independently. Fixture imagery is an intentionally solid teal image, not a real customer's photo.

## Boundaries

This verifies native rendering, real local authenticated transport and lifecycle behavior—not production user-photo data or a released app. Reduce Motion/animator-disabled behavior exists in code; the iOS OS setting toggle itself was not separately exercised. The root screenshot's notification warning comes from a prior synthetic push binding at a different fixture origin; no production push registration was changed.

The source-generated Capacitor config was restored to production after QA. The installed iOS build remains a loopback QA artifact. No physical-device install, production deploy, store upload, email or Slack message was performed for this slice. Follow-up changes are on `feat/native-vendor-workspace`, separate from Rentals PR37's reviewed commit.
