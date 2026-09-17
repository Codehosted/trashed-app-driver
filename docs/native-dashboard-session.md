# Native dashboard session and root boundaries

## Dashboard ownership

On iOS 16+, normal authenticated launch reads `/api/user/profile` before deciding the home destination. Dashboard-eligible accounts get a child-owned SwiftUI root. Opening that root does not load `/app` or `/vendor/dashboard` HTML, and it has no Close action exposing a duplicate webpage. Profile and Calls are native stack destinations; remaining web destinations are explicitly labeled.

The boot profile seeds the native model so the initial dashboard must match the same user/vendor. Exact same-origin `/app` and dashboard navigation targets are intercepted before WebKit navigation. Other role destinations retain their existing routing. The app still supports iOS 14/15 through the previous web route; this is not an all-supported-OS native migration.

## Credential renewal

A different session-token value is not proof of a different user: NextAuth can roll it for the same signed-in account. Treat it as untrusted credentials pending verification, never as authorization.

1. Clear all private display state and stop audio immediately.
2. Retire the old transport; allow one candidate only when a session cookie remains and impersonation/workspace selectors are unchanged.
3. Keep the candidate private. Profile, calls, pagination and saves cannot use it.
4. Fetch a fresh server-authorized dashboard and compare its userId/vendorId to the retained identity.
5. Only publish that transport after successful validation. Any validation failure closes the candidate; a subsequent profile must also match the retained actor, workspace, roles and permissions.
6. Close, background/resume, cancellation and later credential changes cannot resurrect an obsolete response. Reopen is an explicit native authenticated bootstrap, not a web fallback.

## Read-only credential transport

WorkspaceAPI never installs or deletes WebKit cookies from HTTP responses, including profile PATCH responses. WebKit offers no atomic compare-and-set for asynchronous cookie writes: an older response could otherwise replace a newer sign-in even after a preflight fingerprint check. Auth/login owns credential writes. Workspace requests use an immutable outgoing cookie snapshot, reject redirects, disable ambient cookies/cache, and validate lifecycle and cookie state before publishing data.

Consequently, native workspace reads do not slide cookie expiry. A genuinely expired session returns to native login. The backend remains authoritative for revocation: 401/403 and the profile response's explicit `reauthenticationRequired` are respected. Changing email changes the server credential version; successful persistence still surfaces `emailChanged` rather than being obscured by response-cookie deletion.

## Verified checks

- `node --test tests/ios-dashboard-renewal.test.mjs`: production Swift model; same-user renewal, different user/vendor, quarantine against profile/call/save access, temporary validation failure, close, suspend/resume, repeated credential change, logout and retained identity.
- `node --test tests/ios-dashboard-cookie-integration.test.mjs`: real WebKit cookie storage and HTTP; observer callback is deterministic in the host CLI, plus delayed-observer request-preflight handling.
- `node --test tests/ios-dashboard-cookie-race.test.mjs`: real WebKit storage and controlled HTTP response timing; stale Set-Cookie rotation/deletion, 401/403, mid-body changes, cancellation/close, bounded renewal and email reauthentication.
- `node --test tests/ios-dashboard-navigation.test.mjs`: production bootstrap compiled with recording platform doubles, plus native containment/route wiring checks.
- Full simulator build and actual normal-bootstrap UI were verified separately. Synthetic fixture request logs contained only API paths while opening Dashboard/Profile/Calls, returning Back, changing system appearance, foregrounding, rejecting a foreign actor, reopening, and returning to native login on expiry.

CLI cookie tests do not prove SDK observer-delivery timing. Simulator fixtures do not prove physical-device APNs or production notification delivery. Native push initialization must be integrated before release because the dashboard no longer mounts the web push provider.
