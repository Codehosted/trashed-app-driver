# iOS native Rentals map

## Implementation

Rentals opens a native SwiftUI/MapKit screen from the native Manage dock or the accepted `vendor-rentals` action. The exact same-origin `/vendor/rentals` route is intercepted; detail routes remain web-owned. Native direct-entry keeps the existing source WebView document intact and uses the established host lease/return rules.

`NativeRentalsMapView.swift` is registered in the Xcode Sources phase. It uses `MKMapView` through `UIViewRepresentable`, guarded for iOS 16+ while retaining the app's iOS 14 deployment target. No added SDK, API key or location permission.

- System-adaptive muted flat map with traffic and POIs suppressed.
- Small indigo dots, selected green dot, native pan/zoom and Fit all control.
- Search, status filter and accessible rental chooser.
- Bottom rental summary with customer/address, size/status and dates.
- Explicit `Rental details · Web` and `Rental list · Web` actions; existing rental operations remain available there.
- Search and summary are layout siblings rather than covering MapKit attribution. Accessibility text uses a larger scrollable summary allocation. Reduced Motion disables animated camera fitting.
- Separate loading, network failure/retry, successful empty/no matches and unmapped-rental count states.

## Data and lifecycle

`GET /api/vendor/rentals/map?pageSize=200` uses the existing same-origin OS-cookie transport. The client fetches version2 pages sequentially, validates unchanged scope/snapshot/counts, rejects duplicate IDs, repeated cursors, nonprogress and premature termination, and publishes only a complete aggregate. Each page is limited to256KiB/200rows; the original4MiB HTTP response limit remains in force. A32MiB aggregate serialized-data envelope fails explicitly with the web-list option instead of truncating rentals. Legacy version1 is accepted only as the first complete response.

The client validates permissions and account/vendor scope around every page, rejects malformed/count-inconsistent coordinates, and keeps private map data in memory only. Session changes, suspension, close and leaving Rentals clear pins and details; resumed screens reload after reauthorization. Stale/cancelled requests cannot publish their data.

### Pagination transport verification

The real `WorkspaceAPI` and WebKit cookie store loaded2400unique rentals over18loopback HTTP pages totaling4637313bytes, larger than the old4MiB single-response cap. Both declared-length and streaming oversized responses still fail at the original cap. Cancellation, account/scope changes, mixed snapshots/counts, duplicates, incomplete sequences and memory-envelope failures are covered by the Foundation/model tests. Byte draining now runs on a non-MainActor executor; the same streaming bounds and final cookie/generation rechecks remain intact.

Run `node --test tests/ios-native-rentals*.test.mjs tests/ios-dashboard-cookie-integration.test.mjs tests/ios-dashboard-cookie-race.test.mjs`. Full iOS regression and iOS14-target SDK warnings-as-errors typecheck also pass. These are real host native-transport tests with synthetic HTTP data, not a new Simulator UI run. The screen verification below predates pagination; do not label it as updated-device proof.

The companion backend branch `feat/native-rentals-map-api` is required. Deploy the reviewed backend before distributing the native app; no deployment is implied by this implementation.

## Verified checks

```sh
node --test tests/ios*.test.mjs tests/native-bottom-navigation-ios.test.mjs tests/rentals-map-fixture.test.mjs
xcrun swiftc -typecheck -warnings-as-errors \
  -sdk "$(xcrun --sdk iphonesimulator --show-sdk-path)" \
  -target arm64-apple-ios14.0-simulator \
  ios/App/App/NativeWorkspacePolicy.swift \
  ios/App/App/NativeWorkspaceAPI.swift \
  ios/App/App/NativeWorkspaceModel.swift \
  ios/App/App/NativeWorkspaceView.swift \
  ios/App/App/NativeRentalsMapView.swift \
  ios/App/App/NativeDashboardView.swift \
  ios/App/App/NativeCallTranscript.swift
```

The tests compile/execute production model, DTO, navigation and endpoint methods with explicitly synthetic data and transport/audio doubles. Cookie-race regressions use the established local HTTP harness. Swift SDK typechecking is not a full Xcode build or rendered UI proof.

## Verified Simulator acceptance and repeatable QA

A full ad-hoc signed Xcode Debug build was installed on the existing Trashed QA Simulator. Real MapKit tiles and native interactions were checked in light/dark: pin selection, search, status filter, chooser, pan→Fit, native Manage→Rentals→Back, error/retry, empty, expired, denied and foreign scope. Normal bootstrap confirmed no Rentals HTML request before explicit web fallback. The local detail fallback made an authenticated HTTP request and rendered in-app when the generated Capacitor allowlist matched the loopback origin. Web-link return via AX was not automated; normal native Back was verified separately.

Visual QA found and fixed search/filter truncation at maximum Dynamic Type, an oversized fit glyph, and camera fitting after changed layout bounds. The large-text footer is scrollable and its details action was reached. The final SDK build and installed app include these fixes.

Use the existing DEBUG Simulator fixture guard with loopback origin and nonpersistent cookies:

```sh
python3 scripts/native-workspace-fixture.py --port 3421
SIMCTL_CHILD_TRASHED_WORKSPACE_FIXTURE_ORIGIN=http://127.0.0.1:3421 \
SIMCTL_CHILD_TRASHED_WORKSPACE_FIXTURE_PATH=/vendor/rentals \
xcrun simctl launch <approved-simulator-uuid> com.trashed.driver
```

The fixture serves five synthetic Detroit locations and one unmapped rental. It is not production/live-account proof. Capture light/dark phone screenshots, select pins and confirm matching details, pan/zoom/fit, use search/status/chooser, inspect large Dynamic Type and keyboard, test list/detail fallback and return, and verify no duplicate web Rentals page was loaded on native entry.

`POST /__control` supports `rentalsEmpty`, `rentalsError`, `rentalsPermission`, `rentalsWrongScope` and `expired`. The repeatable runner saves actual snapshots, screenshots, HTTP traces and a pass/fail report:

```sh
python3 scripts/native-workspace-fixture.py --port 3422 \
  --dashboard-fixture tests/fixtures/native-rentals-dashboard.json
python3 scripts/verify-ios-rentals-map.py --cli <installed-xcodebuildmcp>/build/cli.js \
  --simulator <approved-simulator-uuid> --origin http://127.0.0.1:3422 \
  --phase controls --output <artifact-dir>/controls
# Repeat with --phase states and --phase navigation.
```

UI tests are synthetic fixture integration, not live-account/backend proof. Production backend deployment, live API integration and store release remain separate gates. Before any release, regenerate Capacitor config for `https://trashed.app`; never distribute the loopback QA build.
