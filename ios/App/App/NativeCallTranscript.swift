import Foundation

/// Presentation-only parsing of the persisted plain transcript. No rewriting or speaker inference.
struct NativeCallTranscript {
    enum Role: String { case caller, assistant, `operator`, unknown }
    struct Turn: Identifiable {
        let id: Int
        let role: Role
        let label: String
        let timestamp: String?
        let text: String
    }
    private static let header = try! NSRegularExpression(pattern: #"^\s*(?:\[([0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?)\]\s*|([0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?)\s+)?(caller|customer|user|assistant|agent|trisha|operator|human)\s*:[ \t]?(.*)$"#, options: [.caseInsensitive])

    static func parse(_ raw: String) -> [Turn] {
        let input = raw.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n")
        guard !input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return [] }
        var result: [Turn] = []
        var role = Role.unknown, label = "Transcript"
        var timestamp: String?
        var lines: [String] = []
        var explicit = false
        func append() {
            let text = lines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
            if explicit || !text.isEmpty { result.append(Turn(id: result.count, role: role, label: label, timestamp: timestamp, text: text)) }
        }
        for line in input.components(separatedBy: "\n") {
            let ns = line as NSString
            if let match = header.firstMatch(in: line, range: NSRange(location: 0, length: ns.length)) {
                append()
                func group(_ n: Int) -> String? { let range = match.range(at: n); return range.location == NSNotFound ? nil : ns.substring(with: range) }
                let speaker = (group(3) ?? "").lowercased()
                switch speaker {
                case "caller", "customer", "user": role = .caller; label = "Caller"
                case "assistant", "agent", "trisha": role = .assistant; label = speaker == "trisha" ? "Trisha" : "Assistant"
                default: role = .operator; label = "Operator"
                }
                timestamp = group(1) ?? group(2)
                lines = [group(4) ?? ""]; explicit = true
            } else { lines.append(line) }
        }
        append()
        return result
    }
}
