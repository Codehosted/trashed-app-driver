import Foundation

/// Saved-profile image allowlist. This policy does not confer account authority.
enum NativeDockAvatarPolicy {
    /// Capacitor may include appStartPath in serverURL. Derive a trusted API
    /// origin here without relaxing validation of saved image URL values.
    static func origin(fromConfiguredURL url: URL) -> URL? {
        guard var parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              parts.user == nil, parts.password == nil else { return nil }
        parts.path = ""; parts.query = nil; parts.fragment = nil
        return validOrigin(parts) ? parts.url : nil
    }

    static func imageURL(_ raw: String?, origin: URL) -> URL? {
        guard let raw = raw, !raw.isEmpty, raw.utf16.count <= 2048,
              !raw.unicodeScalars.contains(where: { $0.value <= 32 || $0.value == 127 || $0 == "\\" }),
              let base = URLComponents(url: origin, resolvingAgainstBaseURL: false), validOrigin(base),
              // Foundation may percent-encode malformed input; reject rather than repair.
              raw.range(of: "%($|[^0-9A-Fa-f]|[0-9A-Fa-f]($|[^0-9A-Fa-f]))", options: .regularExpression) == nil,
              let value = URLComponents(string: raw), value.user == nil, value.password == nil, value.fragment == nil,
              safePath(value.percentEncodedPath) else { return nil }
        let url: URL
        if value.scheme == nil {
            guard raw.hasPrefix("/"), !raw.hasPrefix("//"), value.host == nil,
                  let resolved = URL(string: raw, relativeTo: origin)?.absoluteURL else { return nil }
            url = resolved
        } else {
            guard let absolute = value.url else { return nil }
            url = absolute
        }
        guard var parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let host = parts.host?.lowercased(), parts.user == nil, parts.password == nil, parts.fragment == nil else { return nil }
        if !sameOrigin(parts, base) {
            guard parts.scheme == "https", parts.port == nil || parts.port == 443 else { return nil }
            let known = host == "api.dicebear.com" || host == "avatars.githubusercontent.com"
                || host.range(of: "^lh[0-9]+\\.googleusercontent\\.com$", options: .regularExpression) != nil
                || host.range(of: "^[a-z0-9-]+\\.public\\.blob\\.vercel-storage\\.com$", options: .regularExpression) != nil
            guard known else { return nil }
        }
        if host == "api.dicebear.com",
           parts.percentEncodedPath.range(of: "^/[0-9]+\\.x/[a-z][a-z0-9-]*/svg$", options: .regularExpression) != nil {
            // Raster equivalent of the exact saved selection; preserve all query
            // bytes, seed and style options rather than rendering arbitrary SVG.
            parts.percentEncodedPath = String(parts.percentEncodedPath.dropLast(3)) + "png"
        }
        return parts.url
    }

    private static func validOrigin(_ value: URLComponents) -> Bool {
        guard let host = value.host?.lowercased(), value.user == nil, value.password == nil,
              value.query == nil, value.fragment == nil, value.path.isEmpty || value.path == "/" else { return false }
        let loopback = host == "127.0.0.1" || host == "localhost"
        if value.scheme == "http" { return loopback && (value.port ?? 0) > 0 }
        return value.scheme == "https" && !loopback && !host.contains(":") && !host.hasSuffix(".localhost")
            && host.range(of: "^[0-9.]+$", options: .regularExpression) == nil
            && (value.port == nil || value.port! > 0)
    }
    private static func sameOrigin(_ left: URLComponents, _ right: URLComponents) -> Bool {
        left.scheme == right.scheme && left.host?.lowercased() == right.host?.lowercased()
            && (left.port ?? (left.scheme == "https" ? 443 : 80)) == (right.port ?? (right.scheme == "https" ? 443 : 80))
    }
    private static func safePath(_ path: String) -> Bool {
        guard path.hasPrefix("/"), path.range(of: "%(00|0a|0d|2e|2f|5c|25)", options: [.regularExpression, .caseInsensitive]) == nil else { return false }
        return !path.split(separator: "/").contains(where: { $0 == "." || $0 == ".." })
    }
    static func initials(_ name: String?) -> String {
        guard let name = name else { return "?" }
        let cleaned = name.unicodeScalars.filter { !CharacterSet.controlCharacters.contains($0) && !CharacterSet.illegalCharacters.contains($0) }
        let words = String(String.UnicodeScalarView(cleaned)).split(whereSeparator: { $0.isWhitespace })
        guard let first = words.first?.first else { return "?" }
        let last = words.count > 1 ? String(words.last!.first!) : ""
        return String((String(first) + last).uppercased().prefix(2))
    }
}
