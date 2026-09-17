# Native workspace push: parent integration and release gate

## Parent integration checkpoint
The service is now wired into the local native root and guarded prelogout plugin. Persisted registration IDs and `fenced:true` acknowledgements have been added, plus server `matched:true` receipt ownership checks. Backend migration0149 and route changes are NOT deployed; every release gate below remains mandatory. Parent verified native foreground/background/tap via synthetic Simulator notification injection, not real APNs. Cold-launch queue is implemented but not yet runtime verified. Read enclosing work/push-fence-parent-progress.md for the remaining legacy web POST timeout limitation. The implementation/history below predates these parent changes.

## Implemented, compiled, not yet activated

`NativeWorkspacePush.shared` registers APNs without any webpage. It consumes the existing AppDelegate `.capacitorDidRegisterForRemoteNotifications` event; AppDelegate is unchanged. The service is already in Xcode Sources. It uses an ephemeral, redirect-rejecting transport with immutable origin-matched WK cookies, authenticated `/api/user/profile` scope checks before/after writes, generation retirement, and a serialized registration queue. A POST already sent is drained rather than cancelled before logout's DELETE, to avoid the ordinary late-write/revoke race. Keychain stores device-only bindings before POST, including tokens whose network result is uncertain; no token logging.

The proxy owns explicit vendor remote notifications only while native home is active. It forwards local/driver notifications and settings callbacks to the captured Capacitor router and restores that router when native home is inactive. Native foreground presentation is the OS banner/sound, not a hidden web toast. Receipts and tap dispatch recheck scope; routes are finite same-origin paths with queries stripped. Stop/unmount does NOT unregister or revoke background subscriptions.

## Exact integration calls (Main/Model/Host/View remain parent-owned)

After `bootstrapWorkspace` has a verified profile and the native root is displayed, with onboarding finished:

```swift
Task { @MainActor in
    do {
        try await NativeWorkspacePush.shared.start(
            profile: profile,
            origin: config.origin,
            cookieStore: store,
            allowPermissionPrompt: false,
            onOpen: { [weak self] url in
                // Route native dashboard/profile/calls through your existing native routing;
                // use the existing explicit web destination handler for the other allowlisted paths.
                // Do not load dashboard HTML, do not open arbitrary external URLs.
                self?.handleVerifiedPushDestination(url) // parent-owned adapter, not supplied API
            })
    } catch {
        // Display a generic retry/status message; never log cookies or tokens.
    }
}
```

- Existing permission: `false` registers immediately when authorized/provisional/ephemeral. A first-time permission prompt requires calling `start(...allowPermissionPrompt: true...)` from an explicit native Enable Notifications action or AFTER native first-use onboarding is complete. Do not prompt during login/bootstrap before the root appears. The old web inventory/workspace onboarding gate is not executed by native home.
- Native-to-web navigation: `NativeWorkspacePush.shared.setHomeActive(false)` before exposing the web feature. Returning to the same verified native scope: `setHomeActive(true)`; if credentials may have changed, use a new verified `start` instead.
- On model invalidation, login presentation, account/selector change: `NativeWorkspacePush.shared.stop()`. Once same-account renewal is freshly verified, call `start` with the replacement profile/cookie store. Stop retires callbacks, removes the cookie observer, restores the router, and retains server subscriptions.
- Keep a host generation/cancellation guard around awaited start; call stop if the native host is no longer current. Never have separate competing owners call start for the same singleton.

## REQUIRED before enabling start: logout interception

The existing web logout cannot know a token registered only by native code. Its localStorage token lookup is therefore insufficient. `UIApplication.unregisterForRemoteNotifications()` alone is not server revocation.

**Every explicit logout/account-switch path must execute this BEFORE the existing backend signOut or WK cookie deletion:**

```swift
let api = WorkspaceAPI(origin: origin, cookieStore: store)
defer { api.close() }
let current = try await api.profile()
try await NativeWorkspacePush.shared.prepareLogout(
    profile: current, origin: origin, cookieStore: store)
// Only now proceed with existing backend logout and credential deletion.
```

`prepareLogout` drains native registration, revalidates the profile and cookie snapshot, DELETEs all Keychain-recorded device tokens at `/api/driver/push-token` with `allAudiences:true`, requires `{ok:true}` acknowledgement, then clears bindings, unregisters APNs, and clears delivered notifications. Failure must block logout and offer retry. Do not ignore the error. Native menu interception alone does not cover independent web profile/account-menu sign-out buttons.

**Release blocker in this assigned scope:** webrepo is read-only and Main/Navigation are parent-owned. I have NOT installed a pre-logout callback covering web sign-out actions. There is no such callback in current MainViewController. Merely intercepting navigation to login is too late; signOut has already invalidated credentials. Parent must provide a native pre-logout bridge awaited by the shared web logout helper (requiring separately authorized web change), or route ALL logout controls through a native logout owner. Until then, DO NOT activate native registration in production. A PushNotifications.unregister override is insufficient: the web helper intentionally swallows native unregister failures after a successful web-token server revoke.

Persisted bindings belonging to a different user/origin fail closed; sign back into the outgoing account and revoke first. This deliberately avoids claiming a new account's DELETE revoked someone else's token. Expired old credentials may require backend-assisted recovery. Server token POST does transactionally remove the SAME token from other users across audiences, but cannot clean up unknown rotated old tokens.

## Backend facts verified read-only

- POST `/api/vendor/push-token`: `{token,platform:"ios",appId:"com.trashed.driver"}`; owner/manager authorization; per-token advisory lock; removes other users' same-token rows across audiences; vendor upsert.
- DELETE `/api/driver/push-token`: `{token,allAudiences:true}`; current authenticated user, app ID and token; advisory lock.
- Receipt `/api/vendor/push-receipt`: `{deliveryUuid,receipt:"foreground_received"|"opened"}`; scoped by actor/vendor/audience. `{ok:true}` also occurs for zero matching rows, so it is NOT proof of delivery ownership. Push payload presently includes audience/deliveryUuid but no mandatory verified actor binding.

## Verification and limitations

- `node --test tests/ios-native-workspace-push.test.mjs`: 2 passed. First test compiles actual production Foundation Swift and executes real localhost HTTP: scope mismatch rejection, exact registration/revoke payload, no ambient/Set-Cookie leakage, redirect rejection, endpoint/path/deep-link allowlists. Second is a source-contract regression check, NOT a runtime UIKit lifecycle test.
- Full unsigned simulator `xcodebuild ... build` succeeded, including arm64 NativeWorkspacePush.swift; build log `/tmp/trashed-native-push-build.log`, derived data `/tmp/trashed-native-push-build`. No app installed/launched, no production writes or notifications sent.
- Real-device APNs delivery, denial/re-enable, foreground delegate routing, notification tap after cold launch, logout outage/retry, and shared-device account switching remain required. A cold-launch tap can arrive at Capacitor before the authenticated native proxy is installed; no unauthenticated queue/replay was added here.
- A transport timeout cannot prove a POST never committed. Bindings are retained for retry/revoke; absolute ordering against a server operation that finishes after its client timed out requires a server-side registration generation/revocation fence. Existing backend does not provide one. Do not describe these tests as proving that distributed timeout case.
