import Foundation

// Foundation-only contracts shared by the native screens and executable policy tests.
// No DOM state, HTML, persistent response cache, or web-renderer dependency.
enum WorkspaceRoute: Equatable {
    case profile
    case calls(WorkspaceCallsQuery)

    static func parse(_ url: URL, origin: URL) -> WorkspaceRoute? {
        guard WorkspacePolicy.sameOrigin(url, origin), let c = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        switch c.percentEncodedPath {
        case "/vendor/profile":
            // These existing account actions remain web-owned in this slice.
            // Never intercept their links and strand the user on the overview.
            let selected = c.queryItems?.first { $0.name == "view" }?.value
            guard selected == nil || selected == "about" else { return nil }
            return .profile
        case "/calls/history", "/vendor/trisha/calls":
            let items = c.queryItems ?? []
            func value(_ name: String, _ fallback: String) -> String { items.first { $0.name == name }?.value ?? fallback }
            return .calls(WorkspaceCallsQuery(search: value("search", ""), filter: value("filter", "all"), sort: value("sort", "timestamp-desc")))
        default: return nil
        }
    }
}

struct WorkspaceCallsQuery: Equatable, Hashable {
    var search = ""
    var filter = "all"
    var sort = "timestamp-desc"

    func path(page: Int) -> String {
        var c = URLComponents()
        c.path = "/api/ai-features/calls"
        c.queryItems = [URLQueryItem(name: "page", value: String(page)), URLQueryItem(name: "search", value: search), URLQueryItem(name: "filter", value: filter), URLQueryItem(name: "sort", value: sort)]
        return c.string!
    }
}

enum WorkspacePolicy {
    static func isIdentityCookie(_ name: String) -> Bool {
        if name == "impersonate-vendor-user-uuid" || name == "doc-mode" { return true }
        let bases = ["next-auth.session-token", "__Secure-next-auth.session-token", "authjs.session-token", "__Secure-authjs.session-token"]
        return bases.contains { base in
            if name == base { return true }
            guard name.hasPrefix(base + ".") else { return false }
            let chunk = name.dropFirst(base.count + 1)
            return !chunk.isEmpty && chunk.allSatisfy { $0.isASCII && $0.isNumber }
        }
    }

    static func sameOrigin(_ url: URL, _ origin: URL) -> Bool {
        guard let scheme = origin.scheme?.lowercased(), ["https", "http"].contains(scheme),
              let host = origin.host?.lowercased(), url.scheme?.lowercased() == scheme,
              url.host?.lowercased() == host, url.user == nil, url.password == nil,
              origin.user == nil, origin.password == nil else { return false }
        return (url.port ?? (scheme == "https" ? 443 : 80)) == (origin.port ?? (scheme == "https" ? 443 : 80))
    }

    static func recordingURL(_ raw: String?, callID: String, origin: URL) -> URL? {
        guard let raw = raw, !callID.isEmpty,
              let encoded = callID.addingPercentEncoding(withAllowedCharacters: CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()")),
              let url = URL(string: raw, relativeTo: origin)?.absoluteURL,
              sameOrigin(url, origin), let c = URLComponents(url: url, resolvingAgainstBaseURL: false),
              c.fragment == nil, c.query == nil,
              c.percentEncodedPath == "/api/calls/\(encoded)/recording" else { return nil }
        return url
    }

    static func cookies(_ cookies: [HTTPCookie], for url: URL, now: Date = Date()) -> [HTTPCookie] {
        guard let host = url.host?.lowercased() else { return [] }
        return cookies.filter { cookie in
            let domain = cookie.domain.lowercased()
            let bare = domain.hasPrefix(".") ? String(domain.dropFirst()) : domain
            let matches = host == bare || (domain.hasPrefix(".") && host.hasSuffix("." + bare))
            let path = url.path.isEmpty ? "/" : url.path
            let pathMatches = path == cookie.path || (path.hasPrefix(cookie.path) && (cookie.path.hasSuffix("/") || path.dropFirst(cookie.path.count).hasPrefix("/")))
            return matches && pathMatches && (!cookie.isSecure || url.scheme == "https") && (cookie.expiresDate == nil || cookie.expiresDate! > now)
        }.sorted { ($0.name, $0.path) < ($1.name, $1.path) }
    }
}

struct WorkspaceProfile: Decodable {
    let user: User
    let capabilities: Capabilities
    struct User: Decodable, Identifiable {
        let id: Int
        let name: String?
        let email: String
        let phone: String?
        let image: String?
        let roles: [String]
        let vendor: Vendor?
        let emailVerified: Bool?
        var vendorPermissions: [String: Bool]? = nil
        struct Vendor: Decodable { let id: Int; let businessName: String }
    }
    struct Capabilities: Decodable { let calls: Bool }
    func scope(origin: URL) -> String {
        let permissions = (user.vendorPermissions ?? [:]).keys.sorted().map { "\($0)=\(user.vendorPermissions?[$0] == true)" }.joined(separator: ",")
        return "\(origin.scheme ?? "")://\(origin.host ?? ""):\(origin.port ?? (origin.scheme == "https" ? 443 : 80))|\(user.id)|\(user.vendor?.id.description ?? "none")|\(user.roles.sorted().joined(separator: ","))|\(permissions)|\(capabilities.calls)"
    }
}

struct WorkspaceSavedProfile: Decodable {
    let success: Bool
    var reauthenticationRequired: Bool? = nil
    let user: User
    struct User: Decodable {
        let id: Int
        let name: String?
        let email: String
        let phone: String?
    }
    func matches(_ verified: WorkspaceProfile) -> Bool {
        success && user.id == verified.user.id && user.name == verified.user.name
            && user.email == verified.user.email && user.phone == verified.user.phone
    }
}

struct WorkspaceProfileEdit: Encodable {
    var name: String
    var email: String
    var phone: String
    var validation: String? {
        if name.trimmingCharacters(in: .whitespacesAndNewlines).count < 2 { return "Enter a name with at least 2 characters." }
        if !email.contains("@") || email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return "Enter your email address." }
        return nil // The server is authoritative for email uniqueness and E.164 phone validation.
    }
}

struct WorkspaceCall: Decodable, Identifiable {
    let id: String
    let callId: String
    let customerName: String
    let customerPhone: String
    let duration: Double
    let durationFormatted: String
    let status: String
    let timestamp: String
    let transcript: String
    let hasRecording: Bool
    let recordingUrl: String?
    let customerSatisfaction: Double?
    var date: Date? {
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return parser.date(from: timestamp) ?? ISO8601DateFormatter().date(from: timestamp)
    }
}

struct WorkspaceCallsPage: Decodable {
    let calls: [WorkspaceCall]
    let totalCalls: Int
    let totalPages: Int
    let currentPage: Int
}

struct WorkspacePagination {
    private(set) var calls: [WorkspaceCall] = []
    private(set) var currentPage = 0
    private(set) var totalPages = 0
    private(set) var totalCalls = 0
    private(set) var generation = UUID()
    var hasMore: Bool { currentPage < totalPages }
    mutating func reset() { self = WorkspacePagination() }
    mutating func apply(_ page: WorkspaceCallsPage, requested: Int, generation: UUID) throws {
        guard generation == self.generation else { throw CancellationError() }
        guard requested == currentPage + 1, page.currentPage == requested,
              page.totalCalls >= 0, page.totalPages >= 0, page.calls.count <= 10,
              page.calls.allSatisfy({ !$0.id.isEmpty && !$0.callId.isEmpty }) else { throw WorkspaceError.invalidResponse }
        var seen = Set(calls.map(\.id))
        calls += page.calls.filter { seen.insert($0.id).inserted }
        currentPage = page.currentPage; totalPages = page.totalPages; totalCalls = page.totalCalls
    }
}

enum WorkspaceError: LocalizedError {
    case expired, forbidden, scopeChanged, invalidResponse, unsafeURL, tooLarge, emailChanged, server(String)
    var errorDescription: String? {
        switch self {
        case .emailChanged: return "Email saved. Sign in again with your new address."
        case .expired: return "Your session has expired. Sign in again to continue."
        case .forbidden: return "Your account does not have access to this feature."
        case .scopeChanged: return "Your workspace changed. Reopen this screen to load the current account."
        case .invalidResponse: return "The service returned an unsupported response. Please try again."
        case .unsafeURL: return "This recording cannot be opened securely."
        case .tooLarge: return "This recording is too large to play in the app."
        case .server(let message): return message
        }
    }
}
