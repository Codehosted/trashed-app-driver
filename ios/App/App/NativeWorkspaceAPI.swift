import Foundation
import WebKit

@available(iOS 16.0, *)
@MainActor
protocol WorkspaceServing: AnyObject {
    var origin: URL { get }
    var onSessionChange: (() -> Void)? { get set }
    func profile() async throws -> WorkspaceProfile
    func save(_ edit: WorkspaceProfileEdit, scope: String) async throws -> WorkspaceProfile
    func calls(query: WorkspaceCallsQuery, page: Int, scope: String) async throws -> WorkspaceCallsPage
    func recording(_ call: WorkspaceCall, scope: String) async throws -> (Data, String)
    func cancelPending()
    func close()
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
    private var requestGeneration = UUID()
    private var invalidated = false
    private var installingResponseCookies = false
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
        onSessionChange = nil
    }

    func cookiesDidChange(in cookieStore: WKHTTPCookieStore) {
        Task { [weak self] in
            guard let self = self, !self.invalidated, !self.installingResponseCookies, let previous = self.fingerprint else { return }
            let current = await self.cookieFingerprint()
            if current != previous { self.invalidated = true; self.onSessionChange?() }
        }
    }

    private func allCookies() async -> [HTTPCookie] {
        await withCheckedContinuation { continuation in cookieStore.getAllCookies { continuation.resume(returning: $0) } }
    }

    private func cookieFingerprint() async -> String {
        WorkspaceCookieSnapshot(cookies: await allCookies(), origin: origin).fingerprint
    }

    private func installResponseCookies(_ response: HTTPURLResponse, url: URL) async {
        let fields = response.allHeaderFields.reduce(into: [String: String]()) { result, pair in
            if let key = pair.key as? String, let value = pair.value as? String { result[key] = value }
        }
        let issued = HTTPCookie.cookies(withResponseHeaderFields: fields, for: url)
        installingResponseCookies = true
        defer { installingResponseCookies = false }
        for cookie in issued {
            // Only accept cookies scoped to this trusted response's exact host/domain.
            let domain = cookie.domain.lowercased()
            let bare = domain.hasPrefix(".") ? String(domain.dropFirst()) : domain
            guard url.host?.lowercased() == bare else { continue }
            await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
                if let expiry = cookie.expiresDate, expiry <= Date() {
                    cookieStore.delete(cookie) { continuation.resume() }
                } else {
                    cookieStore.setCookie(cookie) { continuation.resume() }
                }
            }
        }
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

    private func request(_ url: URL, method: String = "GET", body: Data? = nil, maxBytes: Int) async throws -> (Data, HTTPURLResponse) {
        guard !invalidated else { throw WorkspaceError.scopeChanged }
        guard WorkspacePolicy.sameOrigin(url, origin), url.fragment == nil else { throw WorkspaceError.unsafeURL }
        try Task.checkCancellation()
        let generation = requestGeneration
        let snapshot = WorkspaceCookieSnapshot(cookies: await allCookies(), origin: origin)
        try Task.checkCancellation()
        guard generation == requestGeneration else { throw CancellationError() }
        guard !invalidated else { throw WorkspaceError.scopeChanged }
        let headers = try snapshot.headers(for: url, previous: fingerprint)
        let current = snapshot.fingerprint
        fingerprint = current
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
        guard let response = response as? HTTPURLResponse, response.url == url else { throw WorkspaceError.invalidResponse }
        guard generation == requestGeneration, !invalidated else { throw CancellationError() }
        // Preserve server-issued cookie attributes/expiry, including revocations.
        // Rotations or scope changes fail closed and require a newly validated screen.
        await installResponseCookies(response, url: url)
        if response.statusCode == 401 { throw WorkspaceError.expired }
        if response.statusCode == 403 { throw WorkspaceError.forbidden }
        guard !(300..<400).contains(response.statusCode) else { throw WorkspaceError.unsafeURL }
        guard response.expectedContentLength <= maxBytes else { throw WorkspaceError.tooLarge }
        var data = Data()
        for try await byte in bytes {
            if data.count >= maxBytes { throw WorkspaceError.tooLarge }
            data.append(byte)
        }
        try Task.checkCancellation()
        let finalFingerprint = await cookieFingerprint()
        guard generation == requestGeneration else { throw CancellationError() }
        guard !invalidated, finalFingerprint == current else { throw WorkspaceError.scopeChanged }
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
