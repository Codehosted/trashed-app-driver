import Foundation

// Foundation-only rules are exercised by the host Swift test harness.
enum WorkspacePushPolicy {
    static let appID = "com.trashed.driver"
    static func token(_ data: Data) -> String? {
        guard !data.isEmpty, data.count <= 512 else { return nil }
        return data.map { String(format: "%02x", $0) }.joined()
    }
    static func destination(_ raw: String?, origin: URL) -> URL? {
        guard let raw = raw, raw.count <= 2048, !raw.contains("\\"),
              let url = URL(string: raw, relativeTo: origin)?.absoluteURL,
              WorkspacePolicy.sameOrigin(url, origin),
              var c = URLComponents(url: url, resolvingAgainstBaseURL: false), c.fragment == nil,
              ["/vendor/dashboard", "/vendor/profile", "/calls/history", "/vendor/trisha/calls",
               "/vendor/rentals", "/vendor/inventory", "/vendor/customers", "/vendor/driver"].contains(c.percentEncodedPath)
        else { return nil }
        // Notifications cannot introduce auth/account actions, redirects or arbitrary query parameters.
        c.query = nil
        return c.url
    }
    static func registrationBody(_ token: String, registrationId: String? = nil) throws -> Data {
        var body = ["token": token, "platform": "ios", "appId": appID]
        if let registrationId = registrationId { body["registrationId"] = registrationId }
        return try JSONSerialization.data(withJSONObject: body)
    }
    static func revokeBody(_ token: String, registrationId: String? = nil) throws -> Data {
        var body: [String: Any] = ["token": token, "allAudiences": true]
        if let registrationId = registrationId { body["registrationId"] = registrationId }
        return try JSONSerialization.data(withJSONObject: body)
    }
}

private final class WorkspacePushRedirectGuard: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

// Immutable authenticated-cookie transport: no ambient cookies, redirect or Set-Cookie propagation.
@available(iOS 16.0, macOS 13.0, *)
final class WorkspacePushTransport {
    let origin: URL
    let cookies: [HTTPCookie]
    private let session: URLSession
    init(origin: URL, cookies: [HTTPCookie]) {
        self.origin = origin; self.cookies = cookies
        let c = URLSessionConfiguration.ephemeral
        c.httpCookieStorage = nil; c.httpShouldSetCookies = false; c.urlCache = nil
        c.requestCachePolicy = .reloadIgnoringLocalCacheData
        c.timeoutIntervalForRequest = 15; c.timeoutIntervalForResource = 20
        session = URLSession(configuration: c, delegate: WorkspacePushRedirectGuard(), delegateQueue: nil)
    }
    // Do not cancel an in-flight mutation: drain it before a later account's POST or logout DELETE.
    func close() { session.finishTasksAndInvalidate() }
    func request(_ path: String, method: String = "GET", body: Data? = nil) async throws -> Data {
        guard ["/api/user/profile", "/api/vendor/push-token", "/api/driver/push-token", "/api/vendor/push-receipt"].contains(path),
              let url = URL(string: path, relativeTo: origin)?.absoluteURL,
              WorkspacePolicy.sameOrigin(url, origin) else { throw WorkspaceError.unsafeURL }
        var r = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)
        r.httpMethod = method; r.httpBody = body; r.httpShouldHandleCookies = false
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        r.setValue("no-store", forHTTPHeaderField: "Cache-Control")
        if body != nil {
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
            var c = URLComponents(url: origin, resolvingAgainstBaseURL: false)!
            c.path = ""; c.query = nil; c.fragment = nil
            r.setValue(c.string, forHTTPHeaderField: "Origin")
        }
        for (key, value) in HTTPCookie.requestHeaderFields(with: WorkspacePolicy.cookies(cookies, for: url)) {
            r.setValue(value, forHTTPHeaderField: key)
        }
        let (bytes, response) = try await session.bytes(for: r)
        guard let response = response as? HTTPURLResponse, response.url == url,
              (200..<300).contains(response.statusCode), response.mimeType == "application/json",
              response.expectedContentLength <= 262144 else { throw WorkspaceError.invalidResponse }
        var data = Data()
        for try await byte in bytes {
            guard data.count < 262144 else { throw WorkspaceError.tooLarge }
            data.append(byte)
        }
        return data
    }
    func verify(_ scope: String) async throws {
        let p = try JSONDecoder().decode(WorkspaceProfile.self, from: await request("/api/user/profile"))
        guard p.scope(origin: origin) == scope else { throw WorkspaceError.scopeChanged }
    }
    func acknowledged(_ path: String, method: String, body: Data, requireFence: Bool = false) async throws {
        let data = try await request(path, method: method, body: body)
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              object["ok"] as? Bool == true,
              !requireFence || object["fenced"] as? Bool == true else { throw WorkspaceError.invalidResponse }
    }
}

#if canImport(UIKit)
import UIKit
import WebKit
import UserNotifications
import Security
import Capacitor

private struct WorkspacePushBinding: Codable {
    let token: String
    let origin: String
    let userID: Int
    var registrationID: String? = nil
}

private enum WorkspacePushVault {
    static var query: [String: Any] { [kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "com.trashed.driver.native-push", kSecAttrAccount as String: "bindings"] }
    static func read() throws -> [WorkspacePushBinding] {
        var q = query; q[kSecReturnData as String] = true
        var value: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &value)
        if status == errSecItemNotFound { return [] }
        guard status == errSecSuccess, let data = value as? Data else { throw WorkspaceError.server("Device notification storage is unavailable (\(status)).") }
        return try JSONDecoder().decode([WorkspacePushBinding].self, from: data)
    }
    static func write(_ bindings: [WorkspacePushBinding]) throws {
        let data = try JSONEncoder().encode(bindings)
        let update = [kSecValueData as String: data]
        let status = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if status == errSecItemNotFound {
            var q = query; q[kSecValueData as String] = data
            q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            guard SecItemAdd(q as CFDictionary, nil) == errSecSuccess else { throw WorkspaceError.invalidResponse }
        } else if status != errSecSuccess { throw WorkspaceError.invalidResponse }
    }
}

@available(iOS 16.0, *)
@MainActor
final class NativeWorkspacePush: NSObject, WKHTTPCookieStoreObserver, UNUserNotificationCenterDelegate {
    static let shared = NativeWorkspacePush()
    private struct Context {
        let profile: WorkspaceProfile
        let origin: URL
        let store: WKHTTPCookieStore
        let snapshot: WorkspaceCookieSnapshot
        var scope: String { profile.scope(origin: origin) }
    }
    private var context: Context?
    private var generation = UUID()
    private var registration: Task<Void, Never>?
    private var lastToken: String?
    private var observer: NSObjectProtocol?
    private var failureObserver: NSObjectProtocol?
    private var downstream: UNUserNotificationCenterDelegate?
    private var homeActive = false
    private var loggingOut = false
    private var awaitingLaunch = false
    private var pendingOpen: [AnyHashable: Any]?
    private var open: ((URL) -> Void)?
    var onError: ((String) -> Void)?

    private override init() {
        super.init()
        observer = NotificationCenter.default.addObserver(forName: .capacitorDidRegisterForRemoteNotifications,
            object: nil, queue: .main) { [weak self] note in
            guard let data = note.object as? Data else { return }
            Task { @MainActor in self?.receivedToken(data) }
        }
        failureObserver = NotificationCenter.default.addObserver(forName: .capacitorDidFailToRegisterForRemoteNotifications,
            object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in
                guard let self = self, self.context != nil else { return }
                self.onError?("Notification registration failed. Check your connection and try again.")
            }
        }
    }

    // Call ONLY after onboarding + an authenticated profile. No permission prompt by default.
    func prepareLaunchRouting() {
        awaitingLaunch = true
        let center = UNUserNotificationCenter.current()
        if center.delegate !== self { downstream = center.delegate; center.delegate = self }
    }

    func captureLaunchNotification(_ payload: [AnyHashable: Any]?) {
        guard let payload = payload, payload["audience"] as? String == "vendor" else { return }
        pendingOpen = payload // Memory only until profile + receipt ownership are verified.
        prepareLaunchRouting()
    }

    func start(profile: WorkspaceProfile, origin: URL, cookieStore: WKHTTPCookieStore,
               allowPermissionPrompt: Bool = false, onOpen: @escaping (URL) -> Void) async throws {
        guard !loggingOut else { throw WorkspaceError.scopeChanged }
        let launchTap = pendingOpen
        let wasAwaitingLaunch = awaitingLaunch
        stop()
        if wasAwaitingLaunch { prepareLaunchRouting() }
        let id = generation
        await registration?.value
        guard id == generation, !loggingOut else { throw CancellationError() }
        let snapshot = WorkspaceCookieSnapshot(cookies: await cookies(cookieStore), origin: origin)
        guard snapshot.hasSession, profile.user.id > 0, (profile.user.vendor?.id ?? 0) > 0 else { throw WorkspaceError.expired }
        let current = Context(profile: profile, origin: origin, store: cookieStore, snapshot: snapshot)
        try await validate(current)
        guard id == generation else { throw CancellationError() }
        // A previous account's rotated tokens cannot be safely revoked with a new account's cookies.
        let bindings = try WorkspacePushVault.read()
        guard bindings.allSatisfy({ $0.origin == canonical(origin) && $0.userID == profile.user.id }) else {
            throw WorkspaceError.server("Sign back into the previous account and disconnect notifications before switching accounts.")
        }
        context = current; open = onOpen; cookieStore.add(self)
        let verifiedLaunchTap = pendingOpen ?? launchTap
        awaitingLaunch = false; pendingOpen = nil
        setHomeActive(true)
        if let verifiedLaunchTap = verifiedLaunchTap { receipt(verifiedLaunchTap, opened: true) { _ in } }
        let center = UNUserNotificationCenter.current()
        var settings = await center.notificationSettings()
        guard id == generation else { return }
        if settings.authorizationStatus == .notDetermined && allowPermissionPrompt {
            _ = try await center.requestAuthorization(options: [.alert, .badge, .sound])
            settings = await center.notificationSettings()
        }
        guard id == generation else { return }
        #if DEBUG && targetEnvironment(simulator)
        if origin.scheme == "http", origin.host == "127.0.0.1", origin.port != nil,
           ProcessInfo.processInfo.environment["TRASHED_NATIVE_PUSH_FIXTURE"] == "1" {
            receivedToken(Data([0x54, 0x45, 0x53, 0x54])) // Synthetic loopback token, never an APNs request.
            return
        }
        #endif
        if [.authorized, .provisional, .ephemeral].contains(settings.authorizationStatus) {
            UIApplication.shared.registerForRemoteNotifications()
        } else if settings.authorizationStatus == .denied && allowPermissionPrompt,
                  let settingsURL = URL(string: UIApplication.openSettingsURLString) {
            _ = await UIApplication.shared.open(settingsURL)
        }
    }

    // Temporary web navigation/unmount never revokes subscriptions. Restore Capacitor's router.
    func setHomeActive(_ active: Bool) {
        homeActive = active && context != nil && !loggingOut
        let center = UNUserNotificationCenter.current()
        if homeActive {
            if center.delegate !== self { downstream = center.delegate; center.delegate = self }
        } else if center.delegate === self {
            center.delegate = downstream
        }
    }
    func stop() {
        generation = UUID(); setHomeActive(false)
        context?.store.remove(self); context = nil; open = nil
        awaitingLaunch = false; pendingOpen = nil
        // The outgoing POST is deliberately drained, not blindly cancelled and allowed to race a DELETE.
    }
    func cookiesDidChange(in cookieStore: WKHTTPCookieStore) {
        Task { [weak self] in
            guard let self = self, let c = self.context else { return }
            let id = self.generation
            let snapshot = WorkspaceCookieSnapshot(cookies: await self.cookies(cookieStore), origin: c.origin)
            guard id == self.generation else { return }
            if snapshot.fingerprint != c.snapshot.fingerprint { self.stop() }
        }
    }
    private func receivedToken(_ data: Data) {
        guard let token = WorkspacePushPolicy.token(data) else { return }
        lastToken = token
        guard let c = context, !loggingOut else { return }
        let id = generation, previous = registration
        registration = Task { [weak self] in
            await previous?.value
            guard let self = self, id == self.generation, !self.loggingOut else { return }
            let transport = WorkspacePushTransport(origin: c.origin, cookies: c.snapshot.cookies)
            defer { transport.close() }
            do {
                try await self.validate(c)
                guard id == self.generation, !self.loggingOut else { return }
                // Persist BEFORE issuing the write; timeout/kill must not orphan a server subscription.
                var bindings = try WorkspacePushVault.read()
                let index: Int
                if let existing = bindings.firstIndex(where: { $0.token == token && $0.origin == self.canonical(c.origin) && $0.userID == c.profile.user.id }) { index = existing }
                else {
                    index = bindings.count
                    bindings.append(WorkspacePushBinding(token: token, origin: self.canonical(c.origin), userID: c.profile.user.id))
                }
                if bindings[index].registrationID == nil { bindings[index].registrationID = UUID().uuidString }
                try WorkspacePushVault.write(bindings)
                try await transport.acknowledged("/api/vendor/push-token", method: "POST",
                    body: WorkspacePushPolicy.registrationBody(token, registrationId: bindings[index].registrationID), requireFence: true)
                try await self.validate(c)
                guard id == self.generation else { return }
            } catch {
                if id == self.generation { self.onError?("Could not connect notifications. Try again when connected.") }
            }
        }
    }

    // MUST finish before backend signOut or deleting WK cookies. Failure means remain signed in.
    func prepareLogout(profile: WorkspaceProfile, origin: URL, cookieStore: WKHTTPCookieStore) async throws {
        guard !loggingOut else { throw WorkspaceError.scopeChanged }
        loggingOut = true
        stop()
        defer { loggingOut = false }
        await registration?.value
        let snapshot = WorkspaceCookieSnapshot(cookies: await cookies(cookieStore), origin: origin)
        let c = Context(profile: profile, origin: origin, store: cookieStore, snapshot: snapshot)
        try await validate(c)
        var bindings = try WorkspacePushVault.read()
        // Include Capacitor's latest token even if this native workspace never registered it.
        if let token = lastToken, !bindings.contains(where: { $0.token == token }) {
            bindings.append(WorkspacePushBinding(token: token, origin: canonical(origin), userID: profile.user.id))
        }
        guard bindings.allSatisfy({ $0.origin == canonical(origin) && $0.userID == profile.user.id }) else {
            throw WorkspaceError.scopeChanged
        }
        let transport = WorkspacePushTransport(origin: origin, cookies: snapshot.cookies)
        defer { transport.close() }
        for binding in bindings {
            try await validate(c)
            try await transport.acknowledged("/api/driver/push-token", method: "DELETE",
                body: WorkspacePushPolicy.revokeBody(binding.token, registrationId: binding.registrationID), requireFence: binding.registrationID != nil)
            try await validate(c)
        }
        try WorkspacePushVault.write([])
        lastToken = nil
        UIApplication.shared.unregisterForRemoteNotifications()
        UNUserNotificationCenter.current().removeAllDeliveredNotifications()
    }

    private func cookies(_ store: WKHTTPCookieStore) async -> [HTTPCookie] {
        await withCheckedContinuation { continuation in store.getAllCookies { continuation.resume(returning: $0) } }
    }
    private func validate(_ c: Context) async throws {
        let before = WorkspaceCookieSnapshot(cookies: await cookies(c.store), origin: c.origin)
        guard before.hasSession, before.fingerprint == c.snapshot.fingerprint else { throw WorkspaceError.scopeChanged }
        let transport = WorkspacePushTransport(origin: c.origin, cookies: c.snapshot.cookies)
        defer { transport.close() }
        try await transport.verify(c.scope)
        let after = WorkspaceCookieSnapshot(cookies: await cookies(c.store), origin: c.origin)
        guard after.fingerprint == c.snapshot.fingerprint else { throw WorkspaceError.scopeChanged }
    }
    private func canonical(_ origin: URL) -> String {
        "\(origin.scheme ?? "")://\(origin.host ?? ""):\(origin.port ?? (origin.scheme == "https" ? 443 : 80))"
    }
    private func owns(_ notification: UNNotification) -> Bool {
        homeActive && context != nil && !loggingOut && notification.request.trigger is UNPushNotificationTrigger
            && notification.request.content.userInfo["audience"] as? String == "vendor"
    }
    private func receipt(_ payload: [AnyHashable: Any], opened: Bool, completion: @escaping (Bool) -> Void) {
        guard let c = context else { completion(false); return }
        let id = generation
        Task {
            do {
                try await validate(c)
                guard id == generation, homeActive, !loggingOut else { completion(false); return }
                guard let uuid = payload["deliveryUuid"] as? String, !uuid.isEmpty, uuid.count <= 128 else { completion(false); return }
                do {
                    let transport = WorkspacePushTransport(origin: c.origin, cookies: c.snapshot.cookies)
                    defer { transport.close() }
                    let body = try JSONSerialization.data(withJSONObject: ["deliveryUuid": uuid, "receipt": opened ? "opened" : "foreground_received"])
                    let data = try await transport.request("/api/vendor/push-receipt", method: "POST", body: body)
                    guard let result = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                          result["ok"] as? Bool == true, result["matched"] as? Bool == true else { completion(false); return }
                }
                try await validate(c)
                guard id == generation, homeActive, !loggingOut else { completion(false); return }
                if opened, let url = WorkspacePushPolicy.destination(payload["deepLink"] as? String, origin: c.origin) { open?(url) }
                completion(true)
            } catch { completion(false) }
        }
    }
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping @Sendable (UNNotificationPresentationOptions) -> Void) {
        Task { @MainActor in
            if awaitingLaunch && notification.request.content.userInfo["audience"] as? String == "vendor" {
                completionHandler([]) // No account-bound presentation before authentication.
            } else if owns(notification) {
                receipt(notification.request.content.userInfo, opened: false) { valid in completionHandler(valid ? [.banner, .sound] : []) }
            } else if let delegate = downstream, delegate.responds(to: #selector(UNUserNotificationCenterDelegate.userNotificationCenter(_:willPresent:withCompletionHandler:))) {
                delegate.userNotificationCenter?(center, willPresent: notification, withCompletionHandler: completionHandler)
            } else { completionHandler([]) }
        }
    }
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping @Sendable () -> Void) {
        Task { @MainActor in
            if awaitingLaunch && response.notification.request.trigger is UNPushNotificationTrigger,
               response.notification.request.content.userInfo["audience"] as? String == "vendor" {
                if response.actionIdentifier != UNNotificationDismissActionIdentifier { pendingOpen = response.notification.request.content.userInfo }
                completionHandler() // One memory-only tap; ownership is checked after native bootstrap.
            } else if owns(response.notification) {
                if response.actionIdentifier == UNNotificationDismissActionIdentifier { completionHandler(); return }
                receipt(response.notification.request.content.userInfo, opened: true) { _ in completionHandler() }
            } else if let delegate = downstream, delegate.responds(to: #selector(UNUserNotificationCenterDelegate.userNotificationCenter(_:didReceive:withCompletionHandler:))) {
                delegate.userNotificationCenter?(center, didReceive: response, withCompletionHandler: completionHandler)
            } else { completionHandler() }
        }
    }
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, openSettingsFor notification: UNNotification?) {
        Task { @MainActor in downstream?.userNotificationCenter?(center, openSettingsFor: notification) }
    }
}
@available(iOS 16.0, *)
@objc(TrashedWorkspacePushPlugin)
public final class TrashedWorkspacePushPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TrashedWorkspacePushPlugin"
    public let jsName = "TrashedWorkspacePush"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "prepareLogout", returnType: CAPPluginReturnPromise)]

    @objc public func prepareLogout(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard call.options.isEmpty,
                  let host = bridge?.viewController as? MainViewController,
                  let configured = bridge?.config.serverURL, let current = webView?.url,
                  WorkspacePolicy.sameOrigin(current, configured) else {
                call.reject("Sign out is unavailable from this screen."); return
            }
            do {
                try await host.prepareNativePushLogout()
                call.resolve(["ok": true])
            } catch {
                call.reject("Could not disconnect notifications. Check your connection and try signing out again.")
            }
        }
    }
}
#endif
