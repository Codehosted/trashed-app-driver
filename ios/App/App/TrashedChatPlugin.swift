import SwiftUI
import WebKit
import Capacitor

@objc(TrashedChatPlugin)
public class TrashedChatPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TrashedChatPlugin"
    public let jsName = "TrashedChat"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pickFiles", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "dictate", returnType: CAPPluginReturnPromise),
    ]
    private var state: NativeChatState?
    private var presentation: NativeChatPresentation?
    private var hosting: UIHostingController<NativeChatRootView>?
    private weak var container: UIView?
    private let cache = NativeChatCache()
    private let worker = DispatchQueue(label: "app.trashed.native-chat-cache", qos: .userInitiated)
    private var generation = UUID()
    private var pendingContexts = Set<String>()
    private let nativeInput = NativeChatInputController()
    private var inputTicket: (context: String, revision: Int, id: String, expires: Date)?

    @objc func pickFiles(_ call: CAPPluginCall) { systemInput(call, speech: false) }
    @objc func dictate(_ call: CAPPluginCall) { systemInput(call, speech: true) }
    private func systemInput(_ call: CAPPluginCall, speech: Bool) {
        DispatchQueue.main.async {
            guard self.available, !self.nativeInput.busy, let state = self.state, let ticket = self.inputTicket,
                  NativeChatPolicy.keys(call.jsObjectRepresentation, ["context", "revision", "id"]),
                  call.getString("context") == ticket.context, call.getInt("revision") == ticket.revision,
                  call.getString("id") == ticket.id, ticket.expires > Date(),
                  state.context == ticket.context, state.revision >= ticket.revision,
                  let host = self.bridge?.viewController else { call.reject("Tap a current chat input control first.", "STALE_ACTION"); return }
            self.inputTicket = nil
            let identity = state.identity, generation = self.generation
            let current = { [weak self] in self?.generation == generation && self?.state?.identity == identity && self?.available == true }
            let complete: NativeChatInputController.Completion = { result, error in
                if let error = error { call.reject(error, "INPUT_FAILED") } else { call.resolve(result ?? ["cancelled": true]) }
            }
            if speech { self.nativeInput.dictate(from: host, current: current, completion: complete) }
            else { self.nativeInput.pickFiles(from: host, current: current, completion: complete) }
        }
    }

    func attach(to container: UIView) { self.container = container }

    private var available: Bool {
        (bridge?.viewController as? MainViewController)?.nativeChatAvailable == true
            && NativeChatPolicy.isAssistant(webView?.url, configured: bridge?.config.serverURL)
    }

    @objc func setState(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.available, let configured = self.bridge?.config.serverURL else {
                call.reject("Chat is unavailable on this screen.", "UNAVAILABLE"); return
            }
            let raw = call.jsObjectRepresentation
            guard let context = raw["context"] as? String, NativeChatPolicy.validContext(context) else {
                call.reject("Invalid chat state.", "INVALID_STATE"); return
            }
            let generation = self.generation
            self.pendingContexts.insert(context)
            self.worker.async {
                let next = self.cache.resolve(raw: raw, configured: configured)
                DispatchQueue.main.async {
                    guard generation == self.generation, self.available,
                          configured == self.bridge?.config.serverURL else {
                        call.reject("Chat screen changed.", "UNAVAILABLE"); return
                    }
                    self.pendingContexts.remove(context)
                    guard let next = next else {
                        call.reject("Invalid chat state.", "INVALID_STATE"); return
                    }
                    if let current = self.state, current.context == next.context, next.revision <= current.revision {
                        call.reject("Chat state is stale.", "STALE_STATE"); return
                    }
                    self.state = next
                    guard self.render(next, configured: configured) else {
                        self.reset(notify: false)
                        call.reject("Chat view is unavailable.", "UNAVAILABLE"); return
                    }
                    call.resolve(["context": next.context, "revision": next.revision])
                }
            }
        }
    }

    @objc func clear(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard NativeChatPolicy.keys(call.jsObjectRepresentation, ["context"]),
                  let context = call.jsObjectRepresentation["context"] as? String,
                  NativeChatPolicy.validContext(context) else {
                call.reject("Invalid chat context.", "INVALID_STATE"); return
            }
            if self.state?.context == context || self.pendingContexts.contains(context) { self.reset(notify: false, purge: false) }
            call.resolve()
        }
    }

    override public func shouldOverrideLoad(_ navigationAction: WKNavigationAction) -> NSNumber? {
        if navigationAction.targetFrame?.isMainFrame == true {
            reset(purge: !NativeChatPolicy.isAssistant(navigationAction.request.url, configured: bridge?.config.serverURL))
        }
        return nil
    }

    func reset(notify: Bool = true, purge: Bool = true) {
        nativeInput.cancel(); inputTicket = nil
        generation = UUID()
        pendingContexts.removeAll()
        let old = state
        state = nil
        hosting?.view.endEditing(true)
        hosting?.willMove(toParent: nil)
        hosting?.view.removeFromSuperview()
        hosting?.removeFromParent()
        hosting = nil
        presentation = nil
        if purge { worker.async { self.cache.purgeAll() } }
        if notify, let old = old { notifyListeners("reset", data: ["context": old.context], retainUntilConsumed: false) }
    }

    private func render(_ state: NativeChatState, configured: URL) -> Bool {
        if let presentation = presentation { presentation.state = state; return true }
        guard let container = container, let webView = webView,
              let host = bridge?.viewController as? MainViewController else { return false }
        let presentation = NativeChatPresentation(state)
        let view = NativeChatRootView(presentation: presentation, configured: configured,
            onAction: { [weak self] snapshot, id, value in self?.emit(snapshot: snapshot, id: id, value: value) },
            onDraft: { [weak self] snapshot, value in self?.emitDraft(snapshot: snapshot, value: value) })
        let controller = UIHostingController(rootView: view)
        controller.view.translatesAutoresizingMaskIntoConstraints = false
        controller.view.backgroundColor = .systemBackground
        host.addChild(controller)
        // Leave the native navigation bar above chat, and follow its reserved height.
        container.insertSubview(controller.view, aboveSubview: webView)
        NSLayoutConstraint.activate([
            controller.view.leadingAnchor.constraint(equalTo: webView.leadingAnchor),
            controller.view.trailingAnchor.constraint(equalTo: webView.trailingAnchor),
            controller.view.topAnchor.constraint(equalTo: webView.topAnchor),
            controller.view.bottomAnchor.constraint(equalTo: webView.bottomAnchor),
        ])
        controller.didMove(toParent: host)
        self.presentation = presentation
        hosting = controller
        return true
    }

    private func emit(snapshot: NativeChatState, id: String, value: String?) {
        guard available, let state = state, state.identity == snapshot.identity,
              let event = state.event(context: snapshot.context, revision: snapshot.revision, id: id, value: value),
              id != state.input.sendActionId || !state.input.disabled else { return }
        inputTicket = (state.context, state.revision, id, Date().addingTimeInterval(3))
        notifyListeners("action", data: event, retainUntilConsumed: false)
    }

    private func emitDraft(snapshot: NativeChatState, value: String) {
        // A draft is not a send: an empty composer may have a disabled Send action.
        guard available, let state = state, state.identity == snapshot.identity,
              state.context == snapshot.context, state.revision == snapshot.revision,
              !state.input.disabled, NativeChatPolicy.text(value, max: 4000, empty: true) != nil else { return }
        notifyListeners("draft", data: ["context": state.context, "revision": state.revision,
                        "id": state.input.sendActionId, "value": value], retainUntilConsumed: false)
    }
}
