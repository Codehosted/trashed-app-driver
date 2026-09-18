import Foundation
import WebKit

@available(iOS 16.0, *)
@MainActor
protocol WorkspaceServing: AnyObject {
    var origin: URL { get }
    var onSessionChange: (() -> Void)? { get set }
    func profile() async throws -> WorkspaceProfile
    func dashboard() async throws -> WorkspaceDashboard
    func rentals(scope: String) async throws -> WorkspaceRentalsMap
    func save(_ edit: WorkspaceProfileEdit, scope: String) async throws -> WorkspaceProfile
    func calls(query: WorkspaceCallsQuery, page: Int, scope: String) async throws -> WorkspaceCallsPage
    func recording(_ call: WorkspaceCall, scope: String) async throws -> (Data, String)
    func cancelPending()
    func close()
    func renewedSession() -> (any WorkspaceServing)?
}

@available(iOS 16.0, *)
@MainActor
extension WorkspaceServing {
    func renewedSession() -> (any WorkspaceServing)? { nil }
    // Existing clients/mocks fail explicitly until they implement the new endpoint.
    func rentals(scope: String) async throws -> WorkspaceRentalsMap { throw WorkspaceError.invalidResponse }
}

// The identity check and outgoing header MUST use the same immutable snapshot.
struct WorkspaceCookieSnapshot {
    let cookies: [HTTPCookie]
    let origin: URL
    var fingerprint: String {
        cookies.filter { cookie in
            guard WorkspacePolicy.isIdentityCookie(cookie.name), cookie.expiresDate == nil || cookie.expiresDate! > Date() else { return false }
            let domain = (cookie.domain.hasPrefix(".") ? String(cookie.domain.dropFirst()) : cookie.domain).lowercased()
            let host = origin.host?.lowercased()
            return host == domain || (cookie.domain.hasPrefix(".") && host?.hasSuffix("." + domain) == true)
        }.map { "\($0.domain)|\($0.name)|\($0.path)|\($0.value)" }.sorted().joined(separator: "\n")
    }
    var hasSession: Bool {
        WorkspacePolicy.cookies(cookies, for: origin).contains {
            $0.name.contains("session-token") && WorkspacePolicy.isIdentityCookie($0.name) && !$0.value.isEmpty
        }
    }
    var selectorFingerprint: String {
        cookies.filter { WorkspacePolicy.isIdentityCookie($0.name) && !$0.name.contains("session-token") }
            .map { "\($0.domain)|\($0.name)|\($0.path)|\($0.value)" }.sorted().joined(separator: "\n")
    }
    func mayBeRenewal(of previous: Self) -> Bool {
        // This only permits a server recheck; it never authorizes the new token.
        hasSession && previous.hasSession && selectorFingerprint == previous.selectorFingerprint
    }
    func headers(for url: URL, previous: String?) throws -> [String: String] {
        if let previous = previous, fingerprint != previous { throw WorkspaceError.scopeChanged }
        return HTTPCookie.requestHeaderFields(with: WorkspacePolicy.cookies(cookies, for: url))
    }
}

// Refuse ALL redirects. No ambient URLSession cookies, shared cache, or external media requests.
private final class WorkspaceRedirectGuard: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

@available(iOS 16.0, *)
@MainActor
final class WorkspaceAPI: NSObject, WKHTTPCookieStoreObserver, WorkspaceServing {
    let origin: URL
    private let cookieStore: WKHTTPCookieStore
    private var session: URLSession
    private var fingerprint: String?
    private var acceptedCookies: WorkspaceCookieSnapshot?
    private var renewalCookies: WorkspaceCookieSnapshot?
    private var requestGeneration = UUID()
    private var invalidated = false

    var onSessionChange: (() -> Void)?

    init(origin: URL, cookieStore: WKHTTPCookieStore) {
        self.origin = origin; self.cookieStore = cookieStore
        session = Self.makeSession()
        super.init()
        cookieStore.add(self)
    }

    private static func makeSession() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil
        config.httpShouldSetCookies = false
        config.urlCache = nil
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 90
        return URLSession(configuration: config, delegate: WorkspaceRedirectGuard(), delegateQueue: nil)
    }

    func cancelPending() {
        requestGeneration = UUID()
        // Retire this session synchronously, never cancel tasks belonging to a later resume.
        session.invalidateAndCancel()
        session = Self.makeSession()
    }

    func close() {
        invalidated = true
        cookieStore.remove(self)
        session.invalidateAndCancel()
        fingerprint = nil
        acceptedCookies = nil; renewalCookies = nil
        onSessionChange = nil
    }

    func cookiesDidChange(in cookieStore: WKHTTPCookieStore) {
        Task { [weak self] in
            guard let self = self, !self.invalidated else { return }
            let current = WorkspaceCookieSnapshot(cookies: await self.allCookies(), origin: self.origin)
            guard !self.invalidated, let previous = self.fingerprint else { return }
            if current.fingerprint != previous { self.retireForCookieChange(current) }
        }
    }

    private func retireForCookieChange(_ current: WorkspaceCookieSnapshot) {
        guard !invalidated else { return }
        renewalCookies = acceptedCookies.flatMap { current.mayBeRenewal(of: $0) ? current : nil }
        invalidated = true
        session.invalidateAndCancel()
        onSessionChange?()
    }

    func renewedSession() -> (any WorkspaceServing)? {
        guard invalidated, let candidate = renewalCookies else { return nil }
        renewalCookies = nil // One bounded recheck per retired transport.
        let replacement = WorkspaceAPI(origin: origin, cookieStore: cookieStore)
        replacement.fingerprint = candidate.fingerprint
        replacement.acceptedCookies = candidate
        return replacement
    }

    private func allCookies() async -> [HTTPCookie] {
        await withCheckedContinuation { continuation in cookieStore.getAllCookies { continuation.resume(returning: $0) } }
    }

    func profile() async throws -> WorkspaceProfile {
        try await json("/api/user/profile")
    }

    func validateScope(_ scope: String, calls: Bool = false) async throws -> WorkspaceProfile {
        let profile = try await profile()
        guard profile.scope(origin: origin) == scope else { throw WorkspaceError.scopeChanged }
        if calls && !profile.capabilities.calls { throw WorkspaceError.forbidden }
        return profile
    }

    func dashboard() async throws -> WorkspaceDashboard {
        // This endpoint authorizes the current persisted actor/workspace itself.
        // Request cookie fingerprint and generation guards reject account changes.
        let generation = requestGeneration
        let result: WorkspaceDashboard = try await json("/api/mobile/dashboard")
        try Task.checkCancellation()
        guard generation == requestGeneration, !invalidated else { throw CancellationError() }
        return try result.validated()
    }

    func rentals(scope: String) async throws -> WorkspaceRentalsMap {
        let generation = requestGeneration
        let before = try await validateScope(scope)
        guard WorkspaceRentalsPolicy.allowed(before) else { throw WorkspaceError.forbidden }
        var aggregate = WorkspaceRentalsAccumulator()
        while true {
            try Task.checkCancellation()
            guard generation == requestGeneration, !invalidated else { throw CancellationError() }
            let data = try await rentalsPageData(aggregate.path)
            try Task.checkCancellation()
            guard generation == requestGeneration, !invalidated else { throw CancellationError() }
            let after = try await validateScope(scope)
            try Task.checkCancellation()
            guard generation == requestGeneration, !invalidated else { throw CancellationError() }
            // Every page uses the cookie/session guarded transport and rechecks
            // the actor. Nothing leaves this method until the snapshot is whole.
            if let result = try aggregate.append(data, profile: after, origin: origin) { return result }
        }
    }

    private func rentalsPageData(_ path: String) async throws -> Data {
        guard let url = URL(string: path, relativeTo: origin)?.absoluteURL else { throw WorkspaceError.unsafeURL }
        let (data, response) = try await request(url, maxBytes: 4 * 1024 * 1024)
        guard response.mimeType == "application/json" else { throw WorkspaceError.invalidResponse }
        return data
    }

    func calls(query: WorkspaceCallsQuery, page: Int, scope: String) async throws -> WorkspaceCallsPage {
        _ = try await validateScope(scope, calls: true)
        let result: WorkspaceCallsPage = try await json(query.path(page: page))
        _ = try await validateScope(scope, calls: true)
        return result
    }

    func save(_ edit: WorkspaceProfileEdit, scope: String) async throws -> WorkspaceProfile {
        let generation = requestGeneration
        let previous = try await validateScope(scope)
        guard generation == requestGeneration, !invalidated else { throw CancellationError() }
        let result: WorkspaceSavedProfile = try await json("/api/user/profile", method: "PATCH", body: JSONEncoder().encode(edit))
        guard result.success else { throw WorkspaceError.invalidResponse }
        guard result.user.id == previous.user.id else { throw WorkspaceError.scopeChanged }
        if result.reauthenticationRequired == true { throw WorkspaceError.emailChanged }
        // Never claim a save using optimistic values: read back the exact authenticated target.
        let verified = try await validateScope(scope)
        guard verified.user.id == result.user.id else { throw WorkspaceError.scopeChanged }
        guard result.matches(verified) else { throw WorkspaceError.server("Your update was received, but could not be confirmed. Refresh before editing again.") }
        return verified
    }

    func recording(_ call: WorkspaceCall, scope: String) async throws -> (Data, String) {
        guard let url = WorkspacePolicy.recordingURL(call.recordingUrl, callID: call.callId, origin: origin) else { throw WorkspaceError.unsafeURL }
        _ = try await validateScope(scope, calls: true)
        let (data, response) = try await request(url, maxBytes: 32 * 1024 * 1024)
        let mime = response.mimeType ?? ""
        guard ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave"].contains(mime), !data.isEmpty else { throw WorkspaceError.invalidResponse }
        _ = try await validateScope(scope, calls: true)
        return (data, mime.contains("wav") ? "wav" : "mp3")
    }

    private func json<T: Decodable>(_ path: String, method: String = "GET", body: Data? = nil) async throws -> T {
        guard let url = URL(string: path, relativeTo: origin)?.absoluteURL else { throw WorkspaceError.unsafeURL }
        let (data, response) = try await request(url, method: method, body: body, maxBytes: 4 * 1024 * 1024)
        guard response.mimeType == "application/json" else { throw WorkspaceError.invalidResponse }
        do { return try JSONDecoder().decode(T.self, from: data) }
        catch { throw WorkspaceError.invalidResponse }
    }

    // Drain on the cooperative executor, not MainActor: hopping back to the UI
    // executor for every byte makes multi-megabyte paginated maps impractical.
    // Keep streaming enforcement even when Content-Length is absent or false.
    private nonisolated static func collect(_ bytes: URLSession.AsyncBytes, maxBytes: Int) async throws -> Data {
        var data = Data()
        for try await byte in bytes {
            try Task.checkCancellation()
            if data.count >= maxBytes { throw WorkspaceError.tooLarge }
            data.append(byte)
        }
        return data
    }

    private func request(_ url: URL, method: String = "GET", body: Data? = nil, maxBytes: Int) async throws -> (Data, HTTPURLResponse) {
        guard !invalidated else { throw WorkspaceError.scopeChanged }
        guard WorkspacePolicy.sameOrigin(url, origin), url.fragment == nil else { throw WorkspaceError.unsafeURL }
        try Task.checkCancellation()
        let generation = requestGeneration
        let snapshot = WorkspaceCookieSnapshot(cookies: await allCookies(), origin: origin)
        try Task.checkCancellation()
        guard generation == requestGeneration else { throw CancellationError() }
        guard !invalidated else { throw WorkspaceError.scopeChanged }
        if let previous = fingerprint, snapshot.fingerprint != previous {
            retireForCookieChange(snapshot)
            throw WorkspaceError.scopeChanged
        }
        let headers = try snapshot.headers(for: url, previous: fingerprint)
        let current = snapshot.fingerprint
        fingerprint = current
        acceptedCookies = snapshot
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)
        request.httpMethod = method
        request.httpBody = body
        request.httpShouldHandleCookies = false
        request.setValue("application/json, audio/*", forHTTPHeaderField: "Accept")
        request.setValue("no-store", forHTTPHeaderField: "Cache-Control")
        if body != nil {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            var components = URLComponents(url: origin, resolvingAgainstBaseURL: false)!
            components.path = ""; components.query = nil; components.fragment = nil
            request.setValue(components.string, forHTTPHeaderField: "Origin")
        }
        for (name, value) in headers { request.setValue(value, forHTTPHeaderField: name) }
        let (bytes, response) = try await session.bytes(for: request)
        try Task.checkCancellation()
        guard let response = response as? HTTPURLResponse, response.url == url else { throw WorkspaceError.invalidResponse }
        guard generation == requestGeneration, !invalidated else { throw CancellationError() }
        // Data transport never writes WebKit credentials, including on PATCH/errors.
        // WKHTTPCookieStore has no compare-and-set: a stale response could overwrite
        // a newer login even with a fingerprint check before an asynchronous write.
        // Auth/login owns cookie installation; server revocation remains authoritative
        // through 401/403 and save's explicit reauthenticationRequired response.
        if response.statusCode == 401 { throw WorkspaceError.expired }
        if response.statusCode == 403 { throw WorkspaceError.forbidden }
        guard !(300..<400).contains(response.statusCode) else { throw WorkspaceError.unsafeURL }
        guard response.expectedContentLength <= maxBytes else { throw WorkspaceError.tooLarge }
        let data = try await Self.collect(bytes, maxBytes: maxBytes)
        try Task.checkCancellation()
        let finalSnapshot = WorkspaceCookieSnapshot(cookies: await allCookies(), origin: origin)
        try Task.checkCancellation()
        guard generation == requestGeneration else { throw CancellationError() }
        guard !invalidated else { throw WorkspaceError.scopeChanged }
        if finalSnapshot.fingerprint != current {
            retireForCookieChange(finalSnapshot)
            throw WorkspaceError.scopeChanged
        }
        guard (200..<300).contains(response.statusCode) else {
            // Validation messages only; never surface server traces, response HTML, or credential details.
            if response.statusCode == 400, let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let message = object["error"] as? String, message.count <= 200 { throw WorkspaceError.server(message) }
            if response.statusCode == 404, url.path.hasSuffix("/recording") { throw WorkspaceError.server("The recording is not ready or is no longer available. Please try again shortly.") }
            if response.statusCode == 410 { throw WorkspaceError.server("This legacy recording is no longer available.") }
            if response.statusCode == 404 { throw WorkspaceError.server("This item is no longer available.") }
            throw WorkspaceError.server("The service is unavailable (\(response.statusCode)). Please try again.")
        }
        return (data, response)
    }
}
