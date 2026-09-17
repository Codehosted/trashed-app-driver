# Native dashboard bottom dock

## Scope and design

Root-owned SwiftUI bottom navigation for iOS 16+ only. Legacy native Profile/Calls modals and the existing web-owned dock remain separate. No release, simulator install, configuration, auth transport, push service or Xcode project changes are part of this patch.

The dock uses the app's Manage / Assistant / Calls / Account grouping and the existing plugin's SF Symbols. Dashboard becomes the first native destination inside Manage (the older web projection has a separate fifth Dashboard button). Profile and call history stay native; remaining existing destinations explicitly say `· Web`. Native dashboard refresh and return do not load HTML.

Navigation derives from the current server profile's role, vendor, permission map and calls capability; explicit permission maps deny absent keys. The native profile DTO does not expose product-tier entitlements, so web fallback destinations still require their existing authoritative server checks. There is no claim that this client policy proves product entitlement. A stale menu action must be found again in the current allowed entries before execution. Root account menu retains notification enablement; no logout callback is introduced or guessed.

## Layout contract

The root places its expanding NavigationStack and intrinsically sized dock as siblings in a zero-spacing VStack. Parent simulator verification found that a safeAreaInset attached outside NavigationStack still allowed the last dashboard footer under the dock on iOS 26; physical sibling allocation removes that overlap. No hard-coded device/home-indicator height is used. System safe area provides home-indicator clearance. Calls' existing player remains inside the navigation content above the dock.

Dynamic Type uses intrinsic text height and a two-column grid at accessibility sizes, with at least 44pt action targets. The dock hides while the keyboard is showing and returns on dismissal, avoiding overlap with call search and input accessory UI. Sheet/full-screen destinations keep their own system presentation.

## Verification evidence

Parent signed Simulator build succeeded (`outputs/dashboard-dock-parent-build.log`). Full mobile suite:191 tests,189passed,2skipped,0failed (`outputs/dashboard-dock-parent-tests.log`). Actual normal-bootstrap Simulator showed the dock immediately, native Profile/Calls navigation and Josh search worked, and repeated full-scroll checks captured the complete footer above the dock in light, dark and largest accessibility text. Screenshots: `outputs/dashboard-dock-physical-bottom.png`, `dashboard-dock-physical-bottom-dark.png`, `dashboard-dock-accessibility-final-footer.png`. The UI driver's semantic snapshot listed the footer while offscreen, so it was not used alone as geometry proof. Landscape, actual software-keyboard occlusion and physical-device geometry are not claimed verified.

## Parent simulator acceptance checks

1. Launch through normal native authenticated bootstrap. Confirm Dashboard is native and the dock is visible immediately, without a web `setState` or dashboard HTML request.
2. Inspect `workspace-bottom-dock`, with `trashed-native-tab-vendor-manage`, `trashed-native-tab-vendor-assistant`, `trashed-native-tab-vendor-calls`, and `trashed-native-tab-vendor-account` when permitted. Manage must be selected on Dashboard.
3. Scroll to the very end. `dashboard-scroll-end` labels the final `Revenue in USD. Pull down to refresh.` footer. Capture its entire frame and dock frame; assert footer.maxY <= dock.minY and that neither footer nor home indicator is obscured. Repeat in landscape and largest accessibility text size; capture screenshots, not just semantic node presence.
4. Manage → Dashboard stays native. Calls → Calls opens native history with Calls selected; Back selects Manage. Account → Profile opens native account with Account selected; Back selects Manage. Check denied roles/features do not offer those entries and stale items cannot dispatch after renewal.
5. Open call search keyboard: dock must hide, then restore on dismissal. Play audio and scroll to final call: player must be above dock, and final row/load-more must clear both. A transcript full-screen cover must remain unobstructed.
6. Account → Profile → Edit presents the existing editor without adding a second dock. A legacy web-launched native Profile modal still has Close and no new dock.
7. Verify light/dark system appearance and recheck fixture HTTP logs for only native API reads while using Dashboard/Profile/Calls. Web links are deliberate labeled fallbacks, not evidence of native route completeness.

Do not distribute a fixture-configured build. Parent must restore the ignored Capacitor config to the intended production URL and independently perform the authorized release workflow.
