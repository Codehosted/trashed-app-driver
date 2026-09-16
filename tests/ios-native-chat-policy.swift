import Foundation

@main struct NativeChatPolicyChecks {
    static func main() throws {
        let configured = URL(string: "https://trashed.app/app")!
        let scope = String(repeating: "a", count: 64)
        let raw: [String: Any] = [
            "version": 1, "context": "test-context", "revision": 1, "appearance": "light",
            "scopeKey": scope, "conversationId": "conversation", "title": "Trisha",
            "input": ["value": "", "placeholder": "Message", "disabled": false, "sendActionId": "send", "stopActionId": "stop"],
            "messages": [["id": "message", "role": "assistant", "text": "Line one\nLine two 👩‍💻",
                "components": [["id": "node", "type": "button", "text": "Open", "actionId": "component"]]]],
            "conversations": [], "suggestions": [], "unsupported": [],
            "actions": [["id": "send", "kind": "send", "label": "Send"],
                        ["id": "stop", "kind": "stop", "label": "Stop", "disabled": true],
                        ["id": "component", "kind": "component", "label": "Open"]]
        ]
        var count = 0
        func check(_ value: Bool, _ label: String) {
            precondition(value, label); count += 1; print("PASS \(label)")
        }
        let fixtureURL = URL(fileURLWithPath: "tests/fixtures/native-chat.json")
        let fixture = try JSONSerialization.jsonObject(with: Data(contentsOf: fixtureURL)) as! [String: Any]
        let fixtureState = NativeChatPolicy.parse(fixture, configured: configured)
        check(fixtureState != nil, "shared web/native wire fixture parses")
        check(fixtureState?.messages.last?.components?.first?.children?.count == 4, "shared fixture component tree preserved")
        var actionLimit = raw
        var actions = raw["actions"] as! [[String: Any]]
        for index in 0..<510 { actions.append(["id": "extra-\(index)", "kind": "component", "label": "Extra"]) }
        actionLimit["actions"] = actions
        check(NativeChatPolicy.parse(actionLimit, configured: configured) == nil, "513 actions exceed shared limit")
        actions.removeLast(); actionLimit["actions"] = actions
        check(NativeChatPolicy.parse(actionLimit, configured: configured) != nil, "512 actions accepted")
        let state = NativeChatPolicy.parse(raw, configured: configured)!
        check(state.messages.count == 1, "multiline emoji and generic node parse")
        check(state.event(context: state.context, revision: 1, id: "component") != nil, "offered component event")
        check(state.event(context: state.context, revision: 2, id: "component") == nil, "stale revision blocked")
        check(state.event(context: "other", revision: 1, id: "component") == nil, "foreign context blocked")
        check(state.event(context: state.context, revision: 1, id: "stop") == nil, "disabled action blocked")
        check(state.event(context: state.context, revision: 1, id: "missing") == nil, "unknown action blocked")
        check(NativeChatPolicy.text("\u{0001}", max: 4000) == nil, "control character blocked")
        check(NativeChatPolicy.isAssistant(URL(string: "https://trashed.app/vendor/assistant"), configured: configured), "assistant origin allowed")
        check(!NativeChatPolicy.isAssistant(URL(string: "https://evil.example/vendor/assistant"), configured: configured), "foreign page blocked")
        check(!NativeChatPolicy.isAssistant(URL(string: "https://trashed.app/vendor%2fassistant"), configured: configured), "encoded slash blocked")
        check(NativeChatPolicy.safeImageURL("https://evil.example/a.png", configured: configured) == nil, "foreign image blocked")
        check(NativeChatPolicy.safeImageURL("https://user:password@trashed.app/a.png", configured: configured) == nil, "credential URL blocked")
        var bad = raw; bad["extra"] = true
        check(NativeChatPolicy.parse(bad, configured: configured) == nil, "unknown field blocked")
        bad = raw; bad["revision"] = true
        check(NativeChatPolicy.parse(bad, configured: configured) == nil, "boolean revision blocked")
        bad = raw; bad["messages"] = [["id": "message", "role": "assistant", "text": "", "components": [["id": "node", "type": "button", "actionId": "missing"]]]]
        check(NativeChatPolicy.parse(bad, configured: configured) == nil, "dangling component action blocked")
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("ios-native-chat-test-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        var now = Date()
        let cache = NativeChatCache(root: root, now: { now })
        check(cache.resolve(raw: raw, configured: configured) == state && !cache.lastReadWasHit, "cache miss compiles live state")
        check(cache.resolve(raw: raw, configured: configured) == state && cache.lastReadWasHit, "cache exact payload hit")
        var reloaded = raw; reloaded["context"] = "new-document"; reloaded["revision"] = 7
        let reloadedState = cache.resolve(raw: reloaded, configured: configured)
        check(cache.lastReadWasHit && reloadedState?.context == "new-document" && reloadedState?.revision == 7, "screen cache survives context/revision but rebinds actions to current document")
        let reopened = NativeChatCache(root: root, now: { now })
        check(reopened.resolve(raw: reloaded, configured: configured) == reloadedState && reopened.lastReadWasHit, "protected disk cache survives a new cache instance")
        var screen = raw
        screen["screen"] = ["toolbar": [["id": "screen-title", "type": "inline", "children": [["id": "screen-word", "type": "text", "text": "Hello George"]]]], "composer": [], "accessory": [], "overlay": [["id": "screen-confirm", "type": "button", "text": "Confirm", "actionId": "component"]]]
        check(NativeChatPolicy.parse(screen, configured: configured)?.screen?.overlay.count == 1, "screen chrome and confirmation preserve typed action references")
        screen["screen"] = ["toolbar": [], "composer": [], "accessory": [], "overlay": [["id": "screen-confirm", "type": "button", "actionId": "unknown"]]]
        check(NativeChatPolicy.parse(screen, configured: configured) == nil, "screen rejects dangling confirmation action")
        now = now.addingTimeInterval(NativeChatCache.ttl + 1)
        check(cache.resolve(raw: raw, configured: configured) == state && !cache.lastReadWasHit, "expired cache revalidated")
        var other = raw; other["scopeKey"] = String(repeating: "b", count: 64)
        check(cache.resolve(raw: other, configured: configured) != nil && !cache.lastReadWasHit, "scope switch misses and purges")
        check(cache.resolve(raw: raw, configured: configured) == state && !cache.lastReadWasHit, "previous scope not retained")
        cache.purgeAll()
        check(!FileManager.default.fileExists(atPath: root.path), "cache purge removes disk state")
        let box: [String: Any] = ["x": 0, "y": 0, "width": 440, "height": 80]
        let png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII="
        let raster: [String: Any] = ["base64": png, "width": 1, "height": 1]
        var measuredNode: [String: Any] = ["id": "measured-root", "type": "button", "actionId": "component", "accessibilityLabel": "Open exact icon", "box": box,
            "style": ["fontFamily": "arial", "lineHeight": 20, "letterSpacing": -0.3, "borderWidth": 1, "borderColor": "#123456", "paddingTop": 2, "paddingRight": 3, "paddingBottom": 4, "paddingLeft": 5, "textAlign": "center", "opacity": 0.9],
            "children": [["id": "measured-icon", "type": "image", "box": ["x": 12, "y": 8, "width": 16, "height": 16], "props": ["raster": raster]]]]
        func measuredPayload(_ node: [String: Any]) -> [String: Any] {
            var value = raw
            value["messages"] = [["id": "message", "role": "assistant", "text": "", "presentation": "measured", "components": [node]]]
            value["screen"] = ["toolbar": [], "composer": [], "accessory": [], "overlay": [], "footer": [["id": "footer", "type": "text", "text": "Footer", "box": box]]]
            return value
        }
        let measured = NativeChatPolicy.parse(measuredPayload(measuredNode), configured: configured)
        check(measured?.messages.first?.presentation == "measured", "measured message bypass contract accepted")
        check(measured?.screen?.footer?.first?.box?.width == 440, "footer exact geometry preserved")
        check(measured?.messages.first?.components?.first?.accessibilityLabel == "Open exact icon", "spoken label separate from visual text")
        check(measured?.messages.first?.components?.first?.children?.first?.props?.raster?.width == 1, "PNG raster parsed")
        check(measured?.event(context: "wrong", revision: 1, id: "component") == nil, "measured actions retain context gate")
        let goodNode = measuredNode
        for weight in ["regular", "medium", "semibold", "bold"] {
            var fontNode = goodNode; fontNode["style"] = ["fontFamily": "jakarta", "fontWeight": weight]
            check(NativeChatPolicy.parse(measuredPayload(fontNode), configured: configured) != nil, "bundled Jakarta \(weight) accepted")
        }
        var dateNode = goodNode
        dateNode["type"] = "input"; dateNode["value"] = "2026-09-16"; dateNode["props"] = ["inputType": "date"]
        check(NativeChatPolicy.parse(measuredPayload(dateNode), configured: configured)?.messages.first?.components?.first?.props?.inputType == "date", "measured date input accepted")
        for invalid: [String: Any] in [["x": 0, "y": 0, "width": 16385, "height": 80], ["x": true, "y": 0, "width": 440, "height": 80], ["x": 0, "y": 0, "width": 440, "height": 80, "script": "bad"]] {
            measuredNode["box"] = invalid
            check(NativeChatPolicy.parse(measuredPayload(measuredNode), configured: configured) == nil, "invalid measured geometry rejected")
        }
        measuredNode = goodNode; measuredNode["style"] = ["lineHeight": 81]
        check(NativeChatPolicy.parse(measuredPayload(measuredNode), configured: configured) == nil, "out-of-range line height rejected")
        measuredNode = goodNode; measuredNode["style"] = ["fontFamily": "javascript:alert(1)"]
        check(NativeChatPolicy.parse(measuredPayload(measuredNode), configured: configured) == nil, "unknown font family rejected")
        check(NativeChatPolicy.rasterData(NativeComponentRaster(base64: png, width: 2, height: 1)) == nil, "PNG IHDR dimension mismatch rejected")
        check(NativeChatPolicy.rasterData(NativeComponentRaster(base64: Data("<svg/>".utf8).base64EncodedString(), width: 1, height: 1)) == nil, "SVG raster spoof rejected")
        check(NativeChatPolicy.rasterData(NativeComponentRaster(base64: String(repeating: "A", count: 196609), width: 1, height: 1)) == nil, "oversize raster rejected")
        var missingBox = goodNode; missingBox.removeValue(forKey: "box")
        check(NativeChatPolicy.parse(measuredPayload(missingBox), configured: configured) == nil, "measured message requires boxed root")
        let measuredFixture = URL(fileURLWithPath: "tests/fixtures/native-chat-measured-ios.json")
        if FileManager.default.fileExists(atPath: measuredFixture.path) {
            let value = try JSONSerialization.jsonObject(with: Data(contentsOf: measuredFixture)) as! [String: Any]
            check(NativeChatPolicy.parse(value, configured: configured) != nil, "actual iOS browser measured fixture parses")
        }
        print("\(count) native chat checks passed")
    }
}
