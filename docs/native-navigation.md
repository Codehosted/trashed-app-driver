# Native navigation boundary

Trashed still uses **one Capacitor WebView and bridge per app**. This is not a
native view-controller stack and does not prerender or keep hidden pages mounted.

## Verification gates

- Android: API 36 / WebView 133 emulator instrumentation **2/2 passed**, including
  modal-first handling, exact renderer back, request-time same-URL race rejection,
  retained synthetic draft, one WebView, and account/root boundaries. This is
  synthetic HTTP-origin instrumentation, not physical-device or real Radix UI proof.
- iOS: the original screen-edge recognizer never activated despite direct touches
  at x=1 and x=8 points, an attached 440×956 view, and eligible history. The failure
  was in gesture recognition, not a denied history target; UIKit's internal reason
  is unproven. The remediation uses an ordinary one-finger pan with explicit edge
  and direction gates. This passed actual Inventory→Dashboard Back and vertical
  scrolling. A real Sheet exposed a second issue: WebKit's DOM touch/scroll-lock
  recognizers blocked an admitted pan before its action callback. Scoped
  simultaneous recognition restored action delivery. The final normal simulator
  binary passed actual UI checks: root drawer closes; Inventory drawer closes
  without navigating underneath; the next edge swipe returns to Dashboard; another
  stays at the session root. Center drags and short edge swipes do not navigate,
  and vertical scrolling works. Actual Log out returns to native sign-in; a full
  edge swipe there stays on sign-in without exposing the prior workspace.
  These checks used the production-mode local website
  on port 3000 with database access forced read-only. Earlier short/coalesced
  synthesized input attempts did not complete the action; their precise delivery
  cause is unproven. This is not a physical-device reliability claim.
  Temporary DEBUG touch-delivery diagnostics remain excluded. A build or compiled
  policy test alone does not verify actual UIKit gesture delivery.
- Full native policy/regression suite: **112/112 passed**. Production resource
  configs restored byte-exactly after local builds; no store release performed.

## Behavior and boundaries

- iOS accepts a direct one-finger pan starting within the leftmost 24 points.
  Center touches are rejected immediately; vertical, leftward, and multi-finger
  gestures cannot begin Back. The WebView scroll pan waits for this narrow gate
  to fail, preserving ordinary center/vertical scrolling. Only this edge pan may
  cooperate with recognizers contained inside its WebView; public pan, pinch,
  rotation, tap, and long-press recognizers are excluded. No private WebKit class
  names or APIs are used. A deliberate rightward
  horizontal swipe of at least 64 points checks for an open dialog first, then loads the exact validated previous
  WebKit history item within the visible session's same-origin `/vendor`, `/driver`,
  `/calls`, or `/admin` workspace. Standard WebKit back/forward gestures remain off
  because they can skip script-created entries. This is back-only, with no interactive
  page preview or drag animation. Capacitor's navigation delegate is untouched.
- Android checks for an open Radix dialog/alert dialog first and sends Escape;
  a nondismissable modal still consumes Back. This applies to visible same-origin
  help/legal/admin pages too. Native intro/login remain higher priority. Otherwise
  Back validates the adjacent workspace entry, then issues guarded renderer
  `history.go(-1)` with current-location/history-length checks. A request-time
  URL/index/list-size/back-target snapshot is rechecked after modal evaluation;
  a same-URL history change consumes the stale Back request without retargeting it. Android's native
  `goBack` and `goBackOrForward` both use Chromium UI-history skipping. At the visible session root,
  normal system fallback remains. This does not add predictive page previews.
- Native login/intro reset an in-memory history floor. Only the first committed
  workspace after native session entry establishes the new floor; `/app`, auth
  redirects, API URLs, other origins, and old-account history cannot establish it.
- `pushState` and history pops update native history eligibility. A same-document
  pop does not recreate the bridge. WebKit/Android/Next may still evict documents,
  rerender routes, or reload data: scroll, draft, and page retention are not promised
  beyond the browser's normal behavior. This enhancement does not persist history
  or customer data.

The native shell does not preload pages. The web layer owns bounded Next prefetch:
only `/vendor/dashboard`, `/vendor/inventory`, `/driver`, and `/driver?view=profile`
are allowed, only for inactive links in an authenticated open native drawer, and
never during impersonation. Their load-time setup writes were separated into
explicit POST actions; prefetch does not provision preferences, stores, or driver
membership. Other operational links remain unprefetched. There are no hidden
client mounts or extra WebViews. Tel links, external intents, exports, permissions,
and auth retain their existing handlers.

Tests compile the actual Swift/Java URL and session-floor policies. Android's
synthetic instrumentation covers system Back, same-document draft retention,
one-WebView identity, modal-first handling, login priority, and the account/root boundary, guarded to
the disposable emulator and `http://localhost:3000`. Compilation and runtime
results are separate gates; authored instrumentation is not runtime proof.

Platform references: [WebKit exact-item navigation](https://developer.apple.com/documentation/webkit/wkwebview/go(to:)),
[UIKit pan gesture](https://developer.apple.com/documentation/uikit/uipangesturerecognizer),
[UIKit gesture admission](https://developer.apple.com/documentation/uikit/uigesturerecognizerdelegate/gesturerecognizershouldbegin(_:)),
[UIKit simultaneous gestures](https://developer.apple.com/documentation/uikit/allowing-the-simultaneous-recognition-of-multiple-gestures),
[Android custom Back](https://developer.android.com/guide/navigation/navigation-custom-back).

The simultaneous-admission test compiles the actual Swift delegate method with
small view/type fixtures on macOS; it does not emulate UIKit timing. Actual
simulator gestures are a separate gate. WebKit's [touch-event recognizer source](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/ios/WKTouchEventsGestureRecognizer.mm)
documents the `preventDefault` cancellation mechanism observed with modal scroll lock.

Android instrumentation supplies a fixed synthetic HTTP-origin document through
an androidTest-only request interceptor, delegates lifecycle/history callbacks to
the actual app client, and blocks all other fixture requests. `loadDataWithBaseURL`
is not valid HTTP-history proof: Chromium records a data URL. The unactivated
pushState fixture intentionally covers [Chromium UI-history skipping](https://chromium.googlesource.com/chromium/src/+/main/docs/history_manipulation_intervention.md).
Direct AndroidX dispatcher fallback may finish an instrumentation-launched root;
a physical Android 12+ launcher Back normally backgrounds it. Tests assert no
account-A navigation in either lifecycle and check the retained page on resume
when the framework keeps the activity. This is not physical/predictive-gesture proof.

WebKit has [similar UI-history skipping](https://bugs.webkit.org/show_bug.cgi?id=248303).
The iOS exact-item check allows nonzero session floors (local bootstrap/login entries
can precede the first workspace), rechecks current and target item identity after
modal JavaScript completes, and never navigates through unknown intermediate entries.

The native history floor is a navigation/UI guard, **not an authentication boundary**.
Server-side session and tenant authorization remain authoritative. Android's
[versioned JNI source](https://raw.githubusercontent.com/chromium/chromium/133.0.6943.137/content/browser/renderer_host/navigation_controller_android.cc)
confirms even `goBackOrForward` skips entries; failed attempts are retained rather
than treating that API as exact. No skipping/native fallback runs if renderer
validation fails.
