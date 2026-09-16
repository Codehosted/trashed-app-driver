# API-backed iOS workspace

## Implementation

NativeWorkspacePolicy/API/Model/View/Host implement genuine SwiftUI profile/editor and paginated call history with one shared AVPlayer. MainViewController routes `/vendor/profile` overview and `/calls/history` (including `/vendor/trisha/calls`) into a native host. Unsupported account sections/preferences and full/live-call workspace remain explicit web destinations. Deliberate web fallback bypasses native interception.

Native workspace requires iOS16+, availability-guarded without raising the app's iOS14 deployment target. Existing older-iOS shell remains unchanged.

## Safety and behavior
- Same-origin URLSession HTTP reads/writes, OS cookie store access, no DOM projection or JavaScript credential extraction.
- Redirects denied; ambient cookie storage and URLCache disabled. Trusted response cookies synchronize to OS store; auth/impersonation changes invalidate screens rather than reuse stale data. Analytics/UI cookies do not invalidate editing/playback.
- Save success requires exact normalized fields from PATCH and subsequent GET, with matching user/vendor/roles/permissions scope. No offline writes or cosmetic saves.
- Stable native rows; stale/out-of-order page rejection; loading/retry/empty/error states and one player retained across row collapse.
- Audio must match same-origin recording endpoint, downloads into a bounded protected temporary file; no credentials forwarded to provider URLs. Player/file cleanup on close/session invalidation/background. Foreground host revalidates account scope.
- Intrinsic iOS toolbar text sizing avoids clipped Cancel labels; standard grouped fields, Dynamic Type, adaptive brand tint for dark mode.

## Checks

```sh
node --test tests/ios-native-workspace-policy.test.mjs
node --test tests/native-bottom-navigation-ios.test.mjs tests/native-history.test.mjs tests/ios-auth.test.mjs tests/ios-native-workspace-policy.test.mjs
xcrun swiftc -typecheck -warnings-as-errors \
  -sdk "$(xcrun --sdk iphonesimulator --show-sdk-path)" \
  -target arm64-apple-ios16.0-simulator ios/App/App/NativeWorkspace*.swift
xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath <artifact-dir>/DerivedData CODE_SIGNING_ALLOWED=NO build
```

## Repeatable Simulator UI + HTTP fixture verification

Install the built Debug app on an approved already-booted Simulator. Use its exact UUID. Fixture mode is compiled **only for Debug Simulator**, restricts the origin to HTTP127.0.0.1 and uses a separate nonpersistent cookie store. No production credentials, customer data, app-store state or outgoing communications.

```sh
# Separate managed server process:
python3 scripts/native-workspace-fixture.py --port 3421

# Repeat for --mode profile, calls, errors. Run profile before errors when repeating
# against the same fixture because it resets the edited name used in retry checks.
python3 scripts/verify-ios-native-workspace.py \
  --cli <installed-xcodebuildmcp>/build/cli.js \
  --simulator <approved-uuid> \
  --mode profile --output <artifact-dir>/profile
```

Wait for semantic native snapshots and read back the HTTP fixture state. The verifier records actual native requests and screenshots. It never labels fixture writes as production writes. It covers discard without write; real native PATCH+GET confirmation; failed-save draft and retry;401 clearing profile; two-page history/search; AVPlayer playback after collapse and pause. Synthetic recording is a low-amplitude20second WAV, not customer audio.

Verified checkpoint: App simulator build passed; standalone warnings-as-errors check passed;22auth/navigation/history/policy tests passed; all3UI modes passed with9checks and7screenshots. Dark call screen and light profile/editor inspected; large accessibility type inspected separately. A transient XcodeBuildMCP snapshot timeout recovered with a fresh snapshot; no simulated success substituted.

## Remaining gates

Normal authenticated shell route entry/web fallback end-to-end, real backend session renewal and foreground/background race cases, physical/provider push, live-account API integration, seek gesture, recording share/download, detailed historical deep links and remaining call-forwarding/favorites/statistics parity remain to verify or implement. Existing full call workspace is discoverable under More call options. No production release, rollout or full-native app claim is implied.
