# iOS native dashboard / system appearance checkpoint

## Scope and checkpoint
- Read `work/native-dashboard-contract.md`; preserving the existing uncommitted direct-native, profile, call and transcript changes.
- Native route `/vendor/dashboard`, direct action `vendor-dashboard`; Swift Charts behind iOS 16 availability (app target remains iOS 14).
- Dashboard will use existing ephemeral WorkspaceAPI/WK cookie transport and scope/lifecycle guards, not a hidden web controller. No dashboard mutation shortcuts will be fabricated.
- Whole-app device appearance: remove web-projected native overrides, adopt dynamic native colors, signal only safe same-origin existing web documents without reload/auth resets.
- Tests will execute production Swift DTO/model/navigation code, plus full simulator compilation. Existing DEBUG loopback fixture supports `/vendor/dashboard` once registered. Parent owns fixture HTTP server and runtime QA.

## Current discovery
- Booted simulators: `Trashed-Parity-QA` and `iPhone 17 Pro Max` (iOS 26.5).
- Workspace: `ios/App/App.xcworkspace`, scheme `App`.
- Existing profile/call API already rejects redirects, disables URLSession cache and ambient cookies, compares cookie fingerprints, revalidates profile scope and cancels requests.
- Appearance defects confirmed: `TrashedNavigationPlugin` explicitly pins bar/sheets to projected web appearance; `NativeChatView` pins preferredColorScheme; chat styles hardcode projected RGB; shell trait callback only updates status bar.

## Parent integration verification
Full Xcode Simulator build succeeded, and compiled-object timestamps include the final appearance fixes. The dashboard makes one authenticated `/api/mobile/dashboard` request per load instead of repeating profile roundtrips; cancellation/cookie identity and returned snapshot scope checks remain.

Actual Simulator fixture checks passed: period selection survives light/dark changes with no HTTP refetch, month selection works, refresh failure retains data, valid zero values remain zero, and changed account scope clears the snapshot. The profile editor also survives dark/light changes with the exact unsaved draft and no new HTTP requests. Software keyboard was not visible in hardware-keyboard mode and is not claimed visually tested.

Evidence in enclosing workspace: `outputs/dashboard-ios-parent-final-build.log`, `outputs/dashboard-ios-runtime-proof.json`, `outputs/ios-editor-system-proof.json`, and corresponding light/dark PNGs. Parent rerun:11 focused tests pass and174 total mobile tests pass with2skips. These are local synthetic QA; no production deployment or store upload.

### System appearance focused verification
- Native navigation/account sheet stay `.unspecified`; chat has no projected `preferredColorScheme`. Trait changes repaint, without reinitializing models, dismissing sheets, resetting auth, or replacing input/IME state.
- The safe-origin web signal reads `matchMedia` at execution time (not a potentially stale captured native trait), installs one media listener, and neither reloads the document nor touches cookies/storage/history. Document-start initialization, foreground resume, and appearance updates share this signal.
- Separate high-contrast purple **fill** from adaptive foreground **accent**: sender bubbles, selected chat tabs/account rows, send buttons and badges keep readable white labels in dark mode. Destructive red action fills use black text.
- Projected neutral design tokens map to dynamic system colors. Arbitrary non-token brand/status fills remain exact, including pale lavender; inherited projected text uses WCAG luminance to choose readable black/white. Saturation thresholds no longer misclassify brand fills. Both recursive and measured chat carry their parent surface, including sender bubbles.
- `node --test tests/ios-system-appearance.test.mjs tests/native-bottom-navigation-ios.test.mjs tests/native-onboarding.test.mjs`: **10 passed, 0 failed/skipped** (log `outputs/ios-appearance-focus.log` at workspace root).
- The new suite compiles/executes real production Swift origin policy and generated JS; tests same-origin/top-frame restriction, listener uniqueness, latest OS state, draft/selection preservation. It also compiles/executes real **UIKit UIColor via Mac Catalyst on the host**, resolving light/dark traits and asserting >=4.5 contrast, exact retained brand fills, and neutral dynamic colors. This is executable UIKit proof, not a shim or simulator screenshot.
- Appearance wiring/state-retention checks are source assertions, not end-to-end interaction evidence. Parent owns full iOS app compilation and actual dashboard/transcript/audio/profile-editor runtime screenshots. Login/onboarding already derive colors from SwiftUI system colorScheme; no auth guards were removed.
