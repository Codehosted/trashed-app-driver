import Foundation
import CryptoKit

/// Content-addressed screen cache, independent of bridge context/revision.
/// A current authenticated controller payload is
/// mandatory: cache entries are never an authority for identity or offline actions.
/// All disk work is serialized by the plugin's worker queue.
final class NativeChatCache {
    struct Entry: Codable {
        let schema: Int
        let expiresAt: TimeInterval
        let scope: String
        let fingerprint: String
        let compiled: NativeChatState
        let integrity: String
    }
    static let ttl: TimeInterval = 3600
    static let maxFiles = 24
    static let maxBytes = 8 * 1_048_576
    private let fm: FileManager
    let root: URL
    private let now: () -> Date
    private(set) var lastReadWasHit = false

    init(root: URL? = nil, fileManager: FileManager = .default, now: @escaping () -> Date = Date.init) {
        fm = fileManager; self.now = now
        self.root = root ?? fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("NativeChatCache-v1", isDirectory: true)
    }
    static func digest(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }
    private func encoded<T: Encodable>(_ value: T) throws -> Data { let e = JSONEncoder(); e.outputFormatting = [.sortedKeys]; return try e.encode(value) }
    private func prepare() throws {
        try fm.createDirectory(at: root, withIntermediateDirectories: true)
        var url = root, values = URLResourceValues(); values.isExcludedFromBackup = true
        try url.setResourceValues(values)
        #if os(iOS)
        try fm.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: root.path)
        #endif
    }
    private func writeProtected(_ data: Data, to file: URL) throws {
        #if os(iOS)
        try data.write(to: file, options: [.atomic, .completeFileProtection])
        #else
        try data.write(to: file, options: .atomic)
        #endif
        var url = file, values = URLResourceValues(); values.isExcludedFromBackup = true
        try url.setResourceValues(values)
    }
    private func scopeFingerprint(origin: String, scope: String) -> String { Self.digest(Data((origin + "\n" + scope).utf8)) }
    private func activate(_ scope: String) throws {
        try prepare()
        let marker = root.appendingPathComponent("active-scope")
        if let previous = try? String(contentsOf: marker, encoding: .utf8), previous != scope { purgeAll(); try prepare() }
        try writeProtected(Data(scope.utf8), to: marker)
    }
    func resolve(raw: [String: Any], configured: URL) -> NativeChatState? {
        lastReadWasHit = false
        guard NativeChatPolicy.canonicalData(raw) != nil, let origin = NativeChatPolicy.origin(configured),
              let scopeKey = raw["scopeKey"] as? String, NativeChatPolicy.matches(scopeKey, "^[a-f0-9]{64}\\z"),
              let conversation = NativeChatPolicy.text(raw["conversationId"], max: 96) else { return nil }
        let scope = scopeFingerprint(origin: origin, scope: scopeKey)
        // Context/revision are transport leases, not part of the screen definition.
        // Rebind them exclusively from the current validated document, never disk.
        guard let live = NativeChatPolicy.parse(raw, configured: configured) else { return nil }
        var definition = raw; definition.removeValue(forKey: "context"); definition.removeValue(forKey: "revision")
        guard let definitionData = NativeChatPolicy.canonicalData(definition) else { return nil }
        let fingerprint = Self.digest(definitionData)
        let key = Self.digest(Data((scope + "\n" + conversation + "\n" + fingerprint).utf8))
        let file = root.appendingPathComponent(key + ".json")
        do {
            try activate(scope)
            cleanup()
            if let values = try? file.resourceValues(forKeys: [.fileSizeKey]), (values.fileSize ?? Int.max) <= 2 * NativeChatPolicy.maximumBytes,
               let bytes = try? Data(contentsOf: file), let entry = try? JSONDecoder().decode(Entry.self, from: bytes),
               entry.schema == 1, entry.scope == scope, entry.fingerprint == fingerprint, entry.expiresAt > now().timeIntervalSince1970,
               entry.expiresAt <= now().addingTimeInterval(Self.ttl).timeIntervalSince1970,
               entry.compiled.scopeKey == scopeKey, entry.compiled.conversationId == conversation,
               let compiledData = try? encoded(entry.compiled), Self.digest(compiledData) == entry.integrity {
                var compiled = entry.compiled; compiled.context = live.context; compiled.revision = live.revision
                // A digest is not authority: reject modified/corrupt compiled definitions.
                guard compiled == live else { return live }
                lastReadWasHit = true
                return compiled
            }
        } catch { /* A locked/protected disk must not block live rendering. */ }
        let state = live
        do {
            let compiledData = try encoded(state)
            let entry = Entry(schema: 1, expiresAt: now().addingTimeInterval(Self.ttl).timeIntervalSince1970, scope: scope,
                              fingerprint: fingerprint, compiled: state, integrity: Self.digest(compiledData))
            try writeProtected(encoded(entry), to: file)
            cleanup()
        } catch { /* Cache failure is nonfatal; never log private state. */ }
        return state
    }
    func purgeAll() { try? fm.removeItem(at: root) }
    func cleanup() {
        guard let files = try? fm.contentsOfDirectory(at: root, includingPropertiesForKeys: [.fileSizeKey, .contentModificationDateKey, .isSymbolicLinkKey]) else { return }
        var valid: [(URL, Int, Date)] = []
        for file in files where file.pathExtension == "json" {
            guard let values = try? file.resourceValues(forKeys: [.fileSizeKey, .contentModificationDateKey, .isSymbolicLinkKey]),
                  values.isSymbolicLink != true, let size = values.fileSize, size <= 2 * NativeChatPolicy.maximumBytes,
                  let data = try? Data(contentsOf: file), let entry = try? JSONDecoder().decode(Entry.self, from: data),
                  entry.schema == 1, entry.expiresAt > now().timeIntervalSince1970,
                  entry.expiresAt <= now().addingTimeInterval(Self.ttl).timeIntervalSince1970 else { try? fm.removeItem(at: file); continue }
            valid.append((file, size, values.contentModificationDate ?? .distantPast))
        }
        valid.sort { $0.2 > $1.2 }
        var retained = 0, bytes = 0
        for (file, size, _) in valid {
            if retained >= Self.maxFiles || bytes + size > Self.maxBytes { try? fm.removeItem(at: file) }
            else { retained += 1; bytes += size }
        }
    }
}
