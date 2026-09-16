import Foundation
import CoreFoundation

struct NativeChatAction: Identifiable, Equatable, Codable {
    let id: String
    let kind: String
    let label: String
    var disabled: Bool?
    let destructive: Bool?
    var isDisabled: Bool { disabled ?? false }
}
struct NativeChatAttachment: Identifiable, Equatable, Codable {
    let id: String
    let filename: String
    let label: String
}
struct NativeChatMessage: Identifiable, Equatable, Codable {
    let id: String
    let role: String
    let text: String
    let time: String?
    let attachments: [NativeChatAttachment]?
    let actions: [NativeChatAction]?
    let components: [NativeComponentNode]?
    var presentation: String? = nil
}
struct NativeChatConversation: Identifiable, Equatable, Codable {
    let id: String
    let title: String
    let detail: String
    let selected: Bool
    let pinned: Bool?
}
struct NativeChatSuggestion: Identifiable, Equatable, Codable {
    let id: String
    let title: String
    let prompt: String
    let starred: Bool?
}
struct NativeChatInput: Equatable, Codable {
    var value: String
    let placeholder: String
    let disabled: Bool
    let sendActionId: String
    let stopActionId: String
}
struct NativeChatStatus: Equatable, Codable { let kind: String; let text: String }
struct NativeChatScreen: Equatable, Codable {
    let toolbar: [NativeComponentNode]
    let composer: [NativeComponentNode]
    let accessory: [NativeComponentNode]
    let overlay: [NativeComponentNode]
    var footer: [NativeComponentNode]? = nil
    var nodes: [NativeComponentNode] { toolbar + composer + accessory + overlay + (footer ?? []) }
}
struct NativeChatState: Equatable, Codable {
    let version: Int
    var context: String
    var revision: Int
    let appearance: String
    let scopeKey: String
    let conversationId: String
    let title: String
    let subtitle: String?
    var input: NativeChatInput
    let status: NativeChatStatus?
    let messages: [NativeChatMessage]
    let conversations: [NativeChatConversation]
    let suggestions: [NativeChatSuggestion]
    let actions: [NativeChatAction]
    let unsupported: [String]
    let screen: NativeChatScreen?
    var identity: String { scopeKey + ":" + context + ":" + conversationId }
    var allActions: [NativeChatAction] { actions + messages.flatMap { $0.actions ?? [] } }
    func action(_ id: String) -> NativeChatAction? { allActions.first { $0.id == id } }
    func offers(_ id: String) -> Bool { action(id).map { !$0.isDisabled } ?? false }
    func event(context: String, revision: Int, id: String, value: String? = nil) -> [String: Any]? {
        guard self.context == context, self.revision == revision, offers(id),
              value == nil || NativeChatPolicy.text(value, max: 4000, empty: true) != nil else { return nil }
        var result: [String: Any] = ["context": context, "revision": revision, "id": id]
        if let value = value { result["value"] = value }
        return result
    }
}
struct NativeComponentStyle: Equatable, Codable {
    let foreground: String?
    let background: String?
    let fontSize: Double?
    let fontWeight: String?
    let radius: Double?
    let padding: Double?
    let gap: Double?
    var lineHeight: Double? = nil
    var letterSpacing: Double? = nil
    var borderWidth: Double? = nil
    var borderColor: String? = nil
    var paddingTop: Double? = nil
    var paddingRight: Double? = nil
    var paddingBottom: Double? = nil
    var paddingLeft: Double? = nil
    var textAlign: String? = nil
    var opacity: Double? = nil
    var fontFamily: String? = nil
}
struct NativeComponentBox: Equatable, Codable {
    let x: Double; let y: Double; let width: Double; let height: Double
}
struct NativeComponentRaster: Equatable, Codable {
    let base64: String; let width: Int; let height: Int
}
struct NativeMapPoint: Equatable, Codable { let latitude: Double; let longitude: Double }
struct NativeMapMarker: Identifiable, Equatable, Codable {
    let id: String; let label: String; let latitude: Double; let longitude: Double
}
struct NativeMapLine: Equatable, Codable { let points: [NativeMapPoint] }
struct NativeComponentProps: Equatable, Codable {
    let src: String?
    let placeholder: String?
    let inputType: String?
    let markers: [NativeMapMarker]?
    let lines: [NativeMapLine]?
    var raster: NativeComponentRaster? = nil
}
struct NativeComponentNode: Identifiable, Equatable, Codable {
    let id: String
    let type: String
    let text: String?
    let value: String?
    let actionId: String?
    let disabled: Bool?
    let children: [NativeComponentNode]?
    let props: NativeComponentProps?
    let style: NativeComponentStyle?
    var box: NativeComponentBox? = nil
    var accessibilityLabel: String? = nil
}

enum NativeChatPolicy {
    static let maximumBytes = 1_048_576
    static func matches(_ value: String, _ pattern: String) -> Bool { value.range(of: pattern, options: .regularExpression) != nil }
    static func validID(_ value: String) -> Bool { matches(value, "^[a-z][a-z0-9_-]{0,63}\\z") }
    static func validContext(_ value: String) -> Bool { matches(value, "^[A-Za-z0-9_-]{1,80}\\z") }
    static func text(_ value: Any?, max: Int, empty: Bool = false) -> String? {
        guard let value = value as? String, value.utf16.count <= max,
              empty || !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        // Permit paragraph breaks, tabs and emoji ZWJ. Reject controls, not all Cf characters.
        guard !value.unicodeScalars.contains(where: {
            ($0.value < 32 && ![9, 10, 13].contains($0.value)) || (127...159).contains($0.value)
        }) else { return nil }
        return value
    }
    static func keys(_ raw: [String: Any], _ required: [String], _ optional: [String] = []) -> Bool {
        Set(raw.keys).isSuperset(of: required) && Set(raw.keys).isSubset(of: required + optional)
    }
    static func boundedJSON(_ value: Any, depth: Int = 0, budget: inout Int) -> Bool {
        budget -= 1
        guard depth <= 32, budget >= 0 else { return false }
        if let dict = value as? [String: Any] { return dict.values.allSatisfy { boundedJSON($0, depth: depth + 1, budget: &budget) } }
        if let array = value as? [Any] { return array.allSatisfy { boundedJSON($0, depth: depth + 1, budget: &budget) } }
        return value is String || value is NSNumber || value is NSNull
    }
    static func canonicalData(_ raw: [String: Any]) -> Data? {
        var budget = 100_000
        guard boundedJSON(raw, budget: &budget), JSONSerialization.isValidJSONObject(raw),
              let data = try? JSONSerialization.data(withJSONObject: raw, options: [.sortedKeys]), data.count <= maximumBytes else { return nil }
        return data
    }
    static func origin(_ url: URL?) -> String? {
        guard let url = url, let scheme = url.scheme?.lowercased(), ["http", "https"].contains(scheme),
              let host = url.host?.lowercased(), url.user == nil, url.password == nil else { return nil }
        return "\(scheme)://\(host):\(url.port ?? (scheme == "https" ? 443 : 80))"
    }
    static func isAssistant(_ current: URL?, configured: URL?) -> Bool {
        guard let expected = origin(configured), origin(current) == expected,
              current?.path == "/vendor/assistant", let path = URLComponents(url: current!, resolvingAgainstBaseURL: false)?.percentEncodedPath,
              !path.lowercased().contains("%2f"), !path.lowercased().contains("%5c") else { return false }
        return true
    }
    static func safeImageURL(_ value: String, configured: URL?) -> URL? {
        guard value.utf16.count <= 2048, let url = URL(string: value), url.scheme == "https",
              url.user == nil, url.password == nil, url.fragment == nil,
              let actual = origin(url), actual == origin(configured) || actual == "https://trashed.app:443" else { return nil }
        return url
    }
    static func parse(_ raw: [String: Any], configured: URL? = nil) -> NativeChatState? {
        guard let data = canonicalData(raw),
              keys(raw, ["version", "context", "revision", "appearance", "scopeKey", "conversationId", "title", "input", "messages", "conversations", "suggestions", "actions", "unsupported"], ["subtitle", "status", "screen"]),
              let state = try? JSONDecoder().decode(NativeChatState.self, from: data),
              state.version == 1, validContext(state.context), (1...2_147_483_647).contains(state.revision),
              ["light", "dark"].contains(state.appearance), matches(state.scopeKey, "^[a-f0-9]{64}\\z"),
              text(state.conversationId, max: 96) != nil, text(state.title, max: 100) != nil,
              state.subtitle == nil || text(state.subtitle, max: 120, empty: true) != nil,
              let input = raw["input"] as? [String: Any], keys(input, ["value", "placeholder", "disabled", "sendActionId", "stopActionId"]),
              text(state.input.value, max: 4000, empty: true) != nil, text(state.input.placeholder, max: 160) != nil,
              state.messages.count <= 80, state.conversations.count <= 50, state.suggestions.count <= 24,
              state.actions.count <= 512, state.unsupported.isEmpty else { return nil }
        if let status = state.status {
            guard let r = raw["status"] as? [String: Any], keys(r, ["kind", "text"]),
                  ["loading", "error", "notice"].contains(status.kind), text(status.text, max: 300) != nil else { return nil }
        } else if raw["status"] != nil { return nil }
        if raw["subtitle"] != nil && state.subtitle == nil { return nil }
        var actionIDs = Set<String>()
        func checkAction(_ action: NativeChatAction, _ r: [String: Any]) -> Bool {
            keys(r, ["id", "kind", "label"], ["disabled", "destructive"]) && validID(action.id) && actionIDs.insert(action.id).inserted
                && ["send", "stop", "reset", "suggestion", "conversation", "approve", "deny", "component"].contains(action.kind)
                && text(action.label, max: 80) != nil
                && (r["disabled"] == nil || action.disabled != nil) && (r["destructive"] == nil || action.destructive != nil)
        }
        guard let rawActions = raw["actions"] as? [[String: Any]], zip(state.actions, rawActions).allSatisfy({ checkAction($0, $1) }) else { return nil }
        var messageIDs = Set<String>(), nodeIDs = Set<String>(), nodeCount = 0
        guard let rawMessages = raw["messages"] as? [[String: Any]] else { return nil }
        for (message, r) in zip(state.messages, rawMessages) {
            guard keys(r, ["id", "role", "text"], ["time", "attachments", "actions", "components", "presentation"]), validID(message.id), messageIDs.insert(message.id).inserted,
                  r["presentation"] == nil || message.presentation == "measured",
                  ["user", "assistant"].contains(message.role), text(message.text, max: 8000, empty: true) != nil,
                  r["time"] == nil || text(message.time, max: 64, empty: true) != nil else { return nil }
            if let attachments = message.attachments, let rs = r["attachments"] as? [[String: Any]] {
                var ids = Set<String>()
                guard attachments.count <= 8, zip(attachments, rs).allSatisfy({ a, r in
                    keys(r, ["id", "filename", "label"]) && validID(a.id) && ids.insert(a.id).inserted && text(a.filename, max: 120) != nil && text(a.label, max: 80) != nil
                }) else { return nil }
            } else if r["attachments"] != nil { return nil }
            if let actions = message.actions, let rs = r["actions"] as? [[String: Any]] {
                guard actions.count <= 8, zip(actions, rs).allSatisfy({ checkAction($0, $1) }) else { return nil }
            } else if r["actions"] != nil { return nil }
            if let nodes = message.components, let rs = r["components"] as? [[String: Any]] {
                guard nodes.count <= 100, zip(nodes, rs).allSatisfy({ validateNode($0, raw: $1, depth: 1, ids: &nodeIDs, count: &nodeCount, configured: configured) }) else { return nil }
            } else if r["components"] != nil { return nil }
            if message.presentation == "measured" && (message.components?.isEmpty != false || !(message.components ?? []).allSatisfy({ $0.box != nil })) { return nil }
        }
        if let screen = state.screen, let r = raw["screen"] as? [String: Any] {
            guard keys(r, ["toolbar", "composer", "accessory", "overlay"], ["footer"]) else { return nil }
            for (key, nodes) in [("toolbar", screen.toolbar), ("composer", screen.composer), ("accessory", screen.accessory), ("overlay", screen.overlay), ("footer", screen.footer ?? [])] {
                if key == "footer" && r[key] == nil { continue }
                guard let rs = r[key] as? [[String: Any]], nodes.count <= 100,
                      zip(nodes, rs).allSatisfy({ validateNode($0, raw: $1, depth: 1, ids: &nodeIDs, count: &nodeCount, configured: configured) }) else { return nil }
            }
        } else if raw["screen"] != nil { return nil }
        guard state.action(state.input.sendActionId)?.kind == "send", state.action(state.input.stopActionId)?.kind == "stop" else { return nil }
        func referencesValid(_ node: NativeComponentNode) -> Bool {
            if let actionID = node.actionId, state.action(actionID)?.kind != "component" { return false }
            if ["button", "link", "input"].contains(node.type) && node.actionId == nil { return false }
            return (node.children ?? []).allSatisfy(referencesValid)
        }
        guard state.messages.allSatisfy({ ($0.components ?? []).allSatisfy(referencesValid) }) else { return nil }
        guard (state.screen?.nodes ?? []).allSatisfy(referencesValid) else { return nil }
        var conversations = Set<String>(), suggestions = Set<String>()
        guard let rawConversations = raw["conversations"] as? [[String: Any]], zip(state.conversations, rawConversations).allSatisfy({ c, r in
            keys(r, ["id", "title", "detail", "selected"], ["pinned"]) && validID(c.id) && conversations.insert(c.id).inserted
                && text(c.title, max: 100) != nil && text(c.detail, max: 140, empty: true) != nil
                && (r["pinned"] == nil || c.pinned != nil) && state.action(c.id)?.kind == "conversation"
        }), let rawSuggestions = raw["suggestions"] as? [[String: Any]], zip(state.suggestions, rawSuggestions).allSatisfy({ s, r in
            keys(r, ["id", "title", "prompt"], ["starred"]) && validID(s.id) && suggestions.insert(s.id).inserted
                && text(s.title, max: 90) != nil && text(s.prompt, max: 500) != nil
                && (r["starred"] == nil || s.starred != nil) && state.action(s.id)?.kind == "suggestion"
        }) else { return nil }
        return state
    }
    private static func validateNode(_ n: NativeComponentNode, raw: [String: Any], depth: Int, ids: inout Set<String>, count: inout Int, configured: URL?) -> Bool {
        count += 1
        guard depth <= 12, count <= 1000, keys(raw, ["id", "type"], ["text", "value", "actionId", "disabled", "children", "props", "style", "box", "accessibilityLabel"]),
              validID(n.id), ids.insert(n.id).inserted,
              ["text", "inline", "card", "row", "column", "button", "badge", "image", "input", "list", "link", "map"].contains(n.type),
              raw["text"] == nil || text(n.text, max: 8000, empty: true) != nil,
              raw["value"] == nil || text(n.value, max: 4000, empty: true) != nil,
              raw["actionId"] == nil || (n.actionId.map(validID) ?? false),
              raw["disabled"] == nil || n.disabled != nil else { return false }
        if raw["accessibilityLabel"] != nil && text(n.accessibilityLabel, max: 300, empty: true) == nil { return false }
        if let box = n.box, let r = raw["box"] as? [String: Any] {
            guard keys(r, ["x", "y", "width", "height"]),
                  finiteNumber(r["x"], -8192...8192), finiteNumber(r["y"], -8192...8192),
                  finiteNumber(r["width"], 0...16384), finiteNumber(r["height"], 0...16384),
                  box.width.isFinite else { return false }
            if !(n.children ?? []).allSatisfy({ $0.box != nil }) { return false }
        } else if raw["box"] != nil { return false }
        if let style = n.style, let r = raw["style"] as? [String: Any] {
            guard keys(r, [], ["foreground", "background", "fontSize", "fontWeight", "radius", "padding", "gap", "lineHeight", "letterSpacing", "borderWidth", "borderColor", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "textAlign", "opacity", "fontFamily"]) else { return false }
            for key in ["foreground", "background", "borderColor"] where r[key] != nil {
                guard let s = r[key] as? String, matches(s, "^#[a-fA-F0-9]{6}\\z") else { return false }
            }
            for (key, bounds) in [("fontSize", 8.0...40.0), ("radius", 0.0...40.0), ("padding", 0.0...32.0), ("gap", 0.0...24.0), ("lineHeight", 8.0...80.0), ("letterSpacing", -4.0...12.0), ("borderWidth", 0.0...8.0), ("paddingTop", 0.0...64.0), ("paddingRight", 0.0...64.0), ("paddingBottom", 0.0...64.0), ("paddingLeft", 0.0...64.0), ("opacity", 0.0...1.0)] where r[key] != nil {
                guard let number = r[key] as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(), number.doubleValue.isFinite, bounds.contains(number.doubleValue) else { return false }
            }
            if r["fontWeight"] != nil && !["regular", "medium", "semibold", "bold"].contains(style.fontWeight ?? "") { return false }
            if r["textAlign"] != nil && !["left", "center", "right"].contains(style.textAlign ?? "") { return false }
            if r["fontFamily"] != nil && !["system", "arial", "geist", "jakarta", "mono"].contains(style.fontFamily ?? "") { return false }
        } else if raw["style"] != nil { return false }
        if let props = n.props, let r = raw["props"] as? [String: Any] {
            guard keys(r, [], ["src", "placeholder", "inputType", "markers", "lines", "raster"]),
                  r["src"] == nil || (props.src.flatMap { safeImageURL($0, configured: configured) } != nil),
                  r["placeholder"] == nil || text(props.placeholder, max: 160, empty: true) != nil,
                  r["inputType"] == nil || ["text", "email", "phone", "date", "number", "textarea"].contains(props.inputType ?? "") else { return false }
            if let raster = props.raster, let image = r["raster"] as? [String: Any] {
                guard n.type == "image", keys(image, ["base64", "width", "height"]),
                      finiteNumber(image["width"], 1...512), finiteNumber(image["height"], 1...512), rasterData(raster) != nil else { return false }
            } else if r["raster"] != nil { return false }
            if let markers = props.markers, let rs = r["markers"] as? [[String: Any]] {
                var markerIDs = Set<String>()
                guard markers.count <= 250, zip(markers, rs).allSatisfy({ m, raw in
                    keys(raw, ["id", "label", "latitude", "longitude"]) && text(m.id, max: 100) != nil && markerIDs.insert(m.id).inserted
                        && text(m.label, max: 300, empty: true) != nil && coordinate(m.latitude, m.longitude)
                }) else { return false }
            } else if r["markers"] != nil { return false }
            if let lines = props.lines, let rs = r["lines"] as? [[String: Any]] {
                guard lines.count <= 30 else { return false }
                for (line, raw) in zip(lines, rs) {
                    guard keys(raw, ["points"]), let points = raw["points"] as? [[String: Any]], line.points.count <= 500,
                          zip(line.points, points).allSatisfy({ p, r in keys(r, ["latitude", "longitude"]) && coordinate(p.latitude, p.longitude) }) else { return false }
                }
            } else if r["lines"] != nil { return false }
        } else if raw["props"] != nil { return false }
        if n.type == "image" && n.props?.src == nil && n.props?.raster == nil { return false }
        if n.type == "inline" && !(n.children ?? []).allSatisfy({ ["text", "inline"].contains($0.type) }) { return false }
        if let children = n.children, let rs = raw["children"] as? [[String: Any]] {
            guard children.count <= 100, zip(children, rs).allSatisfy({ validateNode($0, raw: $1, depth: depth + 1, ids: &ids, count: &count, configured: configured) }) else { return false }
        } else if raw["children"] != nil { return false }
        return true
    }
    private static func finiteNumber(_ value: Any?, _ bounds: ClosedRange<Double>) -> Bool {
        guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() else { return false }
        return number.doubleValue.isFinite && bounds.contains(number.doubleValue)
    }
    static func rasterData(_ raster: NativeComponentRaster) -> Data? {
        guard (1...512).contains(raster.width), (1...512).contains(raster.height), raster.base64.utf8.count <= 196608,
              let data = Data(base64Encoded: raster.base64), data.count >= 33 else { return nil }
        let bytes = [UInt8](data)
        guard Array(bytes.prefix(8)) == [137,80,78,71,13,10,26,10],
              Array(bytes[8..<16]) == [0,0,0,13,73,72,68,82] else { return nil }
        func integer(_ offset: Int) -> Int { bytes[offset..<offset+4].reduce(0) { ($0 << 8) | Int($1) } }
        guard integer(16) == raster.width, integer(20) == raster.height else { return nil }
        return data
    }
    private static func coordinate(_ latitude: Double, _ longitude: Double) -> Bool {
        latitude.isFinite && longitude.isFinite && (-90...90).contains(latitude) && (-180...180).contains(longitude)
    }
}
