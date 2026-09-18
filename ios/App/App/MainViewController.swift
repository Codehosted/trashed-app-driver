import UIKit
import SwiftUI
import WebKit
import Capacitor
import GoogleSignIn
import AuthenticationServices
import CryptoKit

// CAPPluginCall drops WKFrameInfo. Validate chat's source before forwarding
// to Capacitor, without changing other plugins' message handling.
private final class NativeChatBridgeSourceGuard: NSObject, WKScriptMessageHandler {
    weak var forward: WKScriptMessageHandler?
    let configured: URL
    init(forward: WKScriptMessageHandler, configured: URL) {
        self.forward = forward; self.configured = configured
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if let body = message.body as? [String: Any],
           ["TrashedChat", "TrashedWorkspacePush"].contains(body["pluginId"] as? String ?? "") {
            let frame = message.frameInfo
            let origin = frame.securityOrigin
            var source = URLComponents()
            source.scheme = origin.protocol
            source.host = origin.host
            if origin.port != 0 { source.port = origin.port }
            guard frame.isMainFrame, let expected = NativeChatPolicy.origin(configured),
                  NativeChatPolicy.origin(source.url) == expected else { return }
        }
        forward?.userContentController(userContentController, didReceive: message)
    }
}

// Observe load outcomes while forwarding every Capacitor navigation policy and
// bridge lifecycle callback. The existing script-message source guard is unchanged.
private final class WorkspaceLoadDelegate: NSObject, WKNavigationDelegate {
    let forward: WKNavigationDelegate
    weak var host: MainViewController?
    init(forward: WKNavigationDelegate, host: MainViewController) { self.forward = forward; self.host = host }
    override func responds(to aSelector: Selector!) -> Bool { super.responds(to: aSelector) || forward.responds(to: aSelector) }
    override func forwardingTarget(for aSelector: Selector!) -> Any? { forward.responds(to: aSelector) ? forward : super.forwardingTarget(for: aSelector) }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        forward.webView?(webView, didFinish: navigation)
        host?.workspaceLoadFinished(navigation)
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        forward.webView?(webView, didFail: navigation, withError: error)
        host?.workspaceLoadFailed(navigation)
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        forward.webView?(webView, didFailProvisionalNavigation: navigation, withError: error)
        host?.workspaceLoadFailed(navigation)
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        forward.webViewWebContentProcessDidTerminate?(webView)
        host?.workspaceLoadFailed(nil)
    }
}

private let driverSessionCookieNames = [
    "next-auth.session-token",
    "__Secure-next-auth.session-token",
    "authjs.session-token",
    "__Secure-authjs.session-token",
]

private struct NativeOnboardingPage {
    let title: String
    let body: String
    let image: String
}

private enum NativeOnboarding {
    static let preferenceKey = "trashed.native.onboarding.version"
    static let version = 1
    static let marker = "TrashedOnboarding/1"
    static let pages = [
        NativeOnboardingPage(title: "Your waste service business in your pocket", body: "Manage orders, customers and your team wherever work takes you.", image: "onboarding_business"),
        NativeOnboardingPage(title: "Real-time customer chat", body: "Keep customers in the loop with direct messages and quick replies.", image: "onboarding_chat"),
        NativeOnboardingPage(title: "Hauler and dispatch", body: "Connect haulers and dispatch with live routes and clear stop details.", image: "onboarding_dispatch"),
    ]

    static func isComplete(_ defaults: UserDefaults = .standard) -> Bool {
        defaults.integer(forKey: preferenceKey) >= version
    }

    static func complete(_ defaults: UserDefaults = .standard) {
        defaults.set(version, forKey: preferenceKey)
    }

    static func completedUserAgent(_ original: String) -> String {
        original.split(whereSeparator: { $0.isWhitespace }).contains(Substring(marker))
            ? original : original + " " + marker
    }
}

// Capacitor starts its first request during superclass initialization. Do not
// load website code (or its permission prompts) until the native intro is done.
private final class OnboardingWebView: WKWebView {
    var appNavigationEnabled = false

    override func load(_ request: URLRequest) -> WKNavigation? {
        guard appNavigationEnabled else { return nil }
        return super.load(request)
    }
}

// Pure routing decision shared with bounded executable lifecycle regression tests.
private enum WorkspaceWebRouting {
    static func clearsBypass(url: URL, origin: URL, bypass: WorkspaceRoute?, committed: Bool) -> Bool {
        committed && NativeWorkspaceHistory.isWorkspaceURL(url, origin: origin)
            && WorkspaceRoute.parse(url, origin: origin) != bypass
    }
}

private struct NativeWorkspaceHistory {
    private var floor: Int?
    private var awaitingWorkspace = false

    mutating func reset() { floor = nil; awaitingWorkspace = false }
    mutating func beginSession() { reset(); awaitingWorkspace = true }

    mutating func update(index: Int, workspace: Bool, committed: Bool) {
        if awaitingWorkspace && workspace && committed && index >= 0 {
            floor = index
            awaitingWorkspace = false
        } else if let floor = floor, index < floor { reset() }
    }

    func canGoBack(index: Int, current: URL?, back: URL?, origin: URL, visible: Bool) -> Bool {
        guard visible, let floor = floor, index > floor else { return false }
        return Self.isWorkspaceURL(current, origin: origin) && Self.isWorkspaceURL(back, origin: origin)
    }

    static func isBackSwipe(x: Double, y: Double) -> Bool { x >= 64 && x > abs(y) * 1.5 }

    static func isBackSwipeStart(x: Double) -> Bool { x >= 0 && x <= 24 }

    static func canBeginBackSwipe(startX: Double, x: Double, y: Double, touches: Int) -> Bool {
        touches == 1 && isBackSwipeStart(x: startX) && x > 0 && x > abs(y) * 1.5
    }

    static func isAuthenticationURL(_ url: URL?) -> Bool {
        guard let path = url?.path else { return false }
        return path == "/app/login" || path == "/partners/login" || path.hasPrefix("/api/auth/")
    }

    static func isSameOriginURL(_ url: URL?, origin: URL) -> Bool {
        guard let url = url, let scheme = origin.scheme, ["http", "https"].contains(scheme),
              let host = origin.host, url.scheme == scheme, url.host?.lowercased() == host.lowercased(),
              url.user == nil, url.password == nil, origin.user == nil, origin.password == nil,
              (url.port ?? (scheme == "https" ? 443 : 80)) == (origin.port ?? (scheme == "https" ? 443 : 80)),
              let path = URLComponents(url: url, resolvingAgainstBaseURL: false)?.percentEncodedPath.removingPercentEncoding,
              !path.contains("\\"), !path.split(separator: "/").contains(where: { $0 == "." || $0 == ".." }) else { return false }
        return true
    }

    static func isWorkspaceURL(_ url: URL?, origin: URL) -> Bool {
        guard isSameOriginURL(url, origin: origin), let url = url,
              let path = URLComponents(url: url, resolvingAgainstBaseURL: false)?.percentEncodedPath.removingPercentEncoding else { return false }
        return ["/vendor", "/driver", "/calls", "/admin"].contains { path == $0 || path.hasPrefix($0 + "/") }
    }
}

private enum DriverTheme: String {
    case dark
    case light
}

private struct DriverAuthConfig {
    let origin: URL

    var host: String {
        origin.host ?? ""
    }

    static func driverPath(theme: DriverTheme) -> String {
        "/app?source=trashed-app&theme=\(theme.rawValue)"
    }

    func driverURL(theme: DriverTheme) -> URL {
        URL(string: Self.driverPath(theme: theme), relativeTo: origin)!.absoluteURL
    }

    var loginURL: URL {
        URL(string: "/api/auth/mobile/login", relativeTo: origin)!.absoluteURL
    }

    var googleConfigURL: URL {
        URL(string: "/api/auth/mobile/google/config", relativeTo: origin)!.absoluteURL
    }

    var googleLoginURL: URL {
        URL(string: "/api/auth/mobile/google", relativeTo: origin)!.absoluteURL
    }

    var appleLoginURL: URL {
        URL(string: "/api/auth/mobile/apple", relativeTo: origin)!.absoluteURL
    }

}

private struct NativeGoogleConfig: Decodable {
    let configured: Bool
    let clientId: String?
}

private struct NativeLoginResponse: Decodable {
    let success: Bool
    let error: String?
}

private struct NativeAppleCredential {
    let identityToken: String
    let nonce: String
}

class MainViewController: CAPBridgeViewController, UIGestureRecognizerDelegate {
    private var nativeLoginController: UIHostingController<NativeDriverLoginView>?
    private var nativeOnboardingController: UIHostingController<NativeAppOnboardingView>?
    private var onboardingReady = false
    private let nativeNavigation = TrashedNavigationPlugin()
    private let nativeChat = TrashedChatPlugin()
    private var nativeChatSourceGuard: NativeChatBridgeSourceGuard?
    private var nativeWebBottom: NSLayoutConstraint?
    private var loginURLObservation: NSKeyValueObservation?
    private var historyObservations: [NSKeyValueObservation] = []
    private var workspaceHistory = NativeWorkspaceHistory()
    private var historyEdgeGesture: UIPanGestureRecognizer?
    private var historyGestureStart: (item: WKBackForwardListItem, url: URL)?
    private var historyBackCheckPending = false
    private static let dismissWebDialog = """
    (() => {
      if (!document.querySelector('[role=dialog][data-state=open], [role=alertdialog][data-state=open]')) return false;
      document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', code:'Escape', bubbles:true, cancelable:true}));
      return true;
    })()
    """
    private var pendingAppleCredential: NativeAppleCredential?
    private var nativeWorkspaceRoot = false
    private var workspaceBootstrap: Task<Void, Never>?
    private var workspaceBootstrapGeneration = UUID()
    private var workspacePushTask: Task<Void, Never>?
    private var workspacePushGeneration = UUID()
    private var nativeWorkspaceController: UIViewController?
    private var nativeWorkspaceFinish: (() -> Void)?
    private var nativeWorkspaceURL: URL?
    private var nativeWorkspaceBypass: WorkspaceRoute?
    private var nativeWorkspaceDismissing = false
    private var directWorkspace: WorkspaceDirectNavigation?
    private var workspaceNavigationGeneration = UUID()
    private var lastWebWorkspaceURL: URL?
    private var workspaceLoadDelegate: WorkspaceLoadDelegate?
    private var workspaceLoadNavigation: WKNavigation?
    private var workspaceLoadGeneration = UUID()
    private var workspaceLoadTimeout: DispatchWorkItem?
    private var workspaceLoadCover: UIView?
    private var workspaceLoadLabel: UILabel?
    private var workspaceLoadSpinner: UIActivityIndicatorView?
    private var workspaceLoadRetry: UIButton?
    private var workspaceLoadTarget: URL?
    #if DEBUG && targetEnvironment(simulator)
    private var workspaceFixtureStore: WKWebsiteDataStore?
    #endif

    override func webView(with frame: CGRect, configuration: WKWebViewConfiguration) -> WKWebView {
        #if DEBUG && targetEnvironment(simulator)
        if workspaceBootstrapFixtureOrigin != nil { configuration.websiteDataStore = .nonPersistent() }
        #endif
        // Runs before web providers mount, including login and fresh documents.
        if let raw = bundledServerURLString(), let origin = URL(string: raw),
           let script = NativeSystemAppearance.script(origin: origin) {
            configuration.userContentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        return OnboardingWebView(frame: frame, configuration: configuration)
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(TrashedFileExportPlugin())
        bridge?.registerPluginInstance(nativeNavigation)
        bridge?.registerPluginInstance(nativeChat)
        if #available(iOS 16.0, *) {
            bridge?.registerPluginInstance(TrashedWorkspacePushPlugin())
            NativeWorkspacePush.shared.prepareLaunchRouting()
        }
        guard let webView = webView else { return }

        if let configured = bridge?.config.serverURL,
           let forward = webView.navigationDelegate as? WKScriptMessageHandler {
            let sourceGuard = NativeChatBridgeSourceGuard(forward: forward, configured: configured)
            webView.configuration.userContentController.removeScriptMessageHandler(forName: "bridge")
            webView.configuration.userContentController.add(sourceGuard, name: "bridge")
            nativeChatSourceGuard = sourceGuard
        }

        if let delegate = webView.navigationDelegate {
            let observer = WorkspaceLoadDelegate(forward: delegate, host: self)
            workspaceLoadDelegate = observer
            webView.navigationDelegate = observer
        }

        // A native boundary protects every website screen and modal, not just
        // driver controls with a particular CSS class. The status bar stays visible.
        let container = UIView(frame: view.bounds)
        container.backgroundColor = .systemBackground
        view = container
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        container.addSubview(webView)
        let bottom = webView.bottomAnchor.constraint(equalTo: container.safeAreaLayoutGuide.bottomAnchor)
        nativeWebBottom = bottom
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: container.safeAreaLayoutGuide.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: container.safeAreaLayoutGuide.trailingAnchor),
            webView.topAnchor.constraint(equalTo: container.safeAreaLayoutGuide.topAnchor),
            bottom,
        ])
        nativeNavigation.attach(to: container)
        nativeChat.attach(to: container)
    }

    // Called synchronously after the plugin validates the live selection. No router
    // event, WebView load, history mutation, or API await precedes the native frame.
    func consumeNativeWorkspaceAction(_ action: String, context: String) -> Bool {
        guard #available(iOS 16.0, *), nativeNavigationAvailable,
              let source = webView?.url, let store = webView?.configuration.websiteDataStore.httpCookieStore else { return false }
        let origin = makeDriverAuthConfig().origin
        guard let entry = WorkspaceDirectNavigation.begin(action: action, sourceURL: source, origin: origin,
            context: context, workspace: NativeWorkspaceHistory.isWorkspaceURL(source, origin: origin),
            loading: webView?.isLoading != false,
            modalBusy: presentedViewController != nil || nativeWorkspaceController != nil || nativeWorkspaceDismissing) else { return false }
        directWorkspace = entry
        presentNativeWorkspace(route: entry.route, url: entry.destinationURL, origin: origin, store: store)
        return true
    }

    func nativeWorkspaceNavigationChanged(context: String?, visible: Bool) {
        workspaceNavigationGeneration = UUID()
        guard let entry = directWorkspace,
              !entry.remainsValid(currentURL: webView?.url, loading: webView?.isLoading != false,
                                  context: context ?? "", visible: visible) else { return }
        dismissNativeWorkspace()
    }

    // Transition named routes to real native screens. Only URL routing is shared;
    // loading, edits, paging and playback are independent of the HTML document.
    private func updateNativeWorkspace(for url: URL?) {
        guard #available(iOS 16.0, *), let url = url else { return }
        #if DEBUG && targetEnvironment(simulator)
        if workspaceFixtureStore != nil { return }
        #endif
        let origin = makeDriverAuthConfig().origin
        if nativeWorkspaceRoot { return } // Blank WebView KVO is not native session authority.
        if let entry = directWorkspace {
            if !entry.remainsValid(currentURL: url, loading: webView?.isLoading != false,
                                   context: entry.context, visible: nativeWorkspaceSessionAvailable) {
                dismissNativeWorkspace()
            }
            return // Unchanged source KVO/resume must not dismiss or route behind the native screen.
        }
        let route = WorkspaceRoute.parse(url, origin: origin)
        // URL KVO also reports about:blank and /app during redirects. Neither
        // consumes an explicit web fallback; only a committed different workspace does.
        if WorkspaceWebRouting.clearsBypass(url: url, origin: origin, bypass: nativeWorkspaceBypass, committed: webView?.isLoading == false) {
            nativeWorkspaceBypass = nil
        }
        if route == nil {
            if webView?.isLoading == false, NativeWorkspaceHistory.isWorkspaceURL(url, origin: origin) { lastWebWorkspaceURL = url }
            dismissNativeWorkspace()
            return
        }
        guard onboardingReady, nativeLoginController == nil, nativeOnboardingController == nil,
              viewIfLoaded?.window != nil else { return }
        if nativeWorkspaceBypass == route { return }
        if nativeWorkspaceDismissing { return }
        if nativeWorkspaceURL == url, nativeWorkspaceController != nil { return }
        if nativeWorkspaceController != nil {
            dismissNativeWorkspace { [weak self] in
                guard let self = self else { return }
                self.updateNativeWorkspace(for: self.webView?.url)
            }
            return
        }
        guard nativeWorkspaceController == nil, presentedViewController == nil,
              let route = route, let store = webView?.configuration.websiteDataStore.httpCookieStore else { return }
        presentNativeWorkspace(route: route, url: url, origin: origin, store: store)
    }

    @available(iOS 16.0, *)
    private func presentNativeWorkspace(route: WorkspaceRoute, url: URL, origin: URL, store: WKHTTPCookieStore, isRoot: Bool = false, profile: WorkspaceProfile? = nil) {
        guard nativeWorkspaceController == nil, presentedViewController == nil else { return }
        clearWorkspaceLoadCover()
        let isRoot = isRoot || route == .dashboard
        let api = WorkspaceAPI(origin: origin, cookieStore: store)
        let controller = WorkspaceHostingController(api: api, route: route, isRoot: isRoot, profile: profile,
            openWeb: { [weak self] path in self?.openWorkspaceWeb(path, origin: origin) },
            close: { [weak self] in if !isRoot { self?.closeNativeWorkspace() } })
        controller.model.onExpired = { [weak self] in
            guard let self = self else { return }
            #if DEBUG && targetEnvironment(simulator)
            if self.workspaceFixtureStore != nil { return }
            #endif
            self.nativeWorkspaceBypass = route
            self.dismissNativeWorkspace { [weak self] in
                guard let self = self else { return }
                self.presentNativeLogin(self.makeDriverAuthConfig())
            }
        }
        if isRoot {
            controller.model.onReopen = { [weak self] in
                self?.dismissNativeWorkspace { [weak self] in
                    guard let self = self else { return }
                    self.bootstrapWorkspace(self.makeDriverAuthConfig())
                }
            }
            controller.model.onSessionRetired = { [weak self] in self?.stopWorkspacePush() }
            controller.model.onSessionValidated = { [weak self, weak controller] in
                guard let controller = controller else { return }
                self?.startWorkspacePush(controller, origin: origin, store: store, prompt: false)
            }
            controller.model.onEnableNotifications = { [weak self, weak controller] in
                guard let controller = controller else { return }
                self?.startWorkspacePush(controller, origin: origin, store: store, prompt: true)
            }
        }
        nativeWorkspaceController = controller
        nativeWorkspaceFinish = { [weak controller] in controller?.finish() }
        nativeWorkspaceURL = url
        historyEdgeGesture?.isEnabled = false
        nativeWorkspaceRoot = isRoot
        if isRoot {
            directWorkspace = nil
            nativeNavigation.reset(); nativeChat.reset()
            webView?.stopLoading(); webView?.isHidden = true
            addChild(controller)
            controller.view.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(controller.view)
            NSLayoutConstraint.activate([
                controller.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
                controller.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
                controller.view.topAnchor.constraint(equalTo: view.topAnchor),
                controller.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            ])
            controller.didMove(toParent: self)
            startWorkspacePush(controller, origin: origin, store: store, prompt: false)
        } else { present(controller, animated: false) }
    }

    private func dismissNativeWorkspace(completion: (() -> Void)? = nil) {
        guard !nativeWorkspaceDismissing else { return }
        guard let controller = nativeWorkspaceController else { completion?(); return }
        nativeWorkspaceDismissing = true
        nativeWorkspaceFinish?(); nativeWorkspaceFinish = nil
        let finish: () -> Void = { [weak self] in
            guard let self = self else { return }
            self.nativeWorkspaceRoot = false
            self.webView?.isHidden = false
            self.nativeWorkspaceController = nil; self.nativeWorkspaceURL = nil
            self.directWorkspace = nil
            self.nativeWorkspaceDismissing = false
            completion?()
            self.updateHistoryGestures()
        }
        if nativeWorkspaceRoot {
            controller.willMove(toParent: nil)
            controller.view.removeFromSuperview()
            controller.removeFromParent()
            finish()
        } else { controller.dismiss(animated: false, completion: finish) }
    }

    private func closeNativeWorkspace() {
        if let entry = directWorkspace {
            // If the source itself was native-capable, do not re-intercept it on dismissal.
            nativeWorkspaceBypass = WorkspaceRoute.parse(entry.sourceURL, origin: makeDriverAuthConfig().origin)
            dismissNativeWorkspace()
            return // Preserve the existing web document and its exact history/scroll state.
        }
        guard let current = nativeWorkspaceURL else { return }
        let origin = makeDriverAuthConfig().origin
        nativeWorkspaceBypass = WorkspaceRoute.parse(current, origin: origin)
        #if DEBUG && targetEnvironment(simulator)
        if workspaceFixtureStore != nil {
            dismissNativeWorkspace()
            return
        }
        #endif
        let returnURL = lastWebWorkspaceURL ?? URL(string: "/app?source=trashed-app", relativeTo: origin)!.absoluteURL
        let sourceURL = webView?.url
        dismissNativeWorkspace { [weak self] in
            guard let self = self, self.webView?.url == sourceURL else { return }
            self.webView?.load(URLRequest(url: returnURL))
        }
    }

    private func openWorkspaceWeb(_ path: String, origin: URL) {
        guard !nativeWorkspaceDismissing, nativeWorkspaceSessionAvailable else { return }
        if let entry = directWorkspace,
           !entry.remainsValid(currentURL: webView?.url, loading: webView?.isLoading != false,
                               context: entry.context, visible: nativeWorkspaceSessionAvailable) { return }
        guard let url = URL(string: path, relativeTo: origin)?.absoluteURL,
              NativeWorkspaceHistory.isWorkspaceURL(url, origin: origin),
              !WorkspaceHomeRouting.isHomeTarget(url, origin: origin) else { return }
        // A deliberate web fallback must not immediately reopen the native overview.
        nativeWorkspaceBypass = WorkspaceRoute.parse(url, origin: origin)
        #if DEBUG && targetEnvironment(simulator)
        if workspaceFixtureStore != nil {
            let alert = UIAlertController(title: "Web destination", message: "Local fixture only: \(path)", preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "OK", style: .default))
            nativeWorkspaceController?.present(alert, animated: false)
            return
        }
        #endif
        // The native root deliberately covers a stopped/blank WebView. Check
        // handoff readiness BEFORE destroying the only visible screen; the
        // post-dismiss guard alone can otherwise reject and expose that blank.
        if nativeWorkspaceRoot {
            guard webView?.isLoading == false, viewIfLoaded?.window != nil else { return }
        }
        let sourceURL = webView?.url
        let generation = workspaceNavigationGeneration
        showWorkspaceLoadCover(target: url)
        dismissNativeWorkspace { [weak self] in
            guard let self = self else { return }
            guard self.webView?.url == sourceURL, self.nativeNavigationAvailable,
                  self.workspaceNavigationGeneration == generation else {
                self.workspaceLoadFailed(nil); return
            }
            self.startWorkspaceWebLoad(url)
        }
    }

    private func showWorkspaceLoadCover(target: URL) {
        clearWorkspaceLoadCover()
        workspaceLoadTarget = target
        let cover = UIView(); cover.backgroundColor = .systemBackground
        cover.accessibilityIdentifier = "workspace-load-recovery"
        cover.translatesAutoresizingMaskIntoConstraints = false
        let stack = UIStackView(); stack.axis = .vertical; stack.spacing = 20; stack.alignment = .center
        stack.translatesAutoresizingMaskIntoConstraints = false
        let spinner = UIActivityIndicatorView(style: .large); spinner.startAnimating()
        let label = UILabel(); label.text = "Opening screen…"; label.font = .preferredFont(forTextStyle: .headline)
        label.numberOfLines = 0; label.textAlignment = .center; label.adjustsFontForContentSizeCategory = true
        let retry = UIButton(type: .system); retry.setTitle("Retry", for: .normal); retry.isHidden = true
        retry.accessibilityIdentifier = "workspace-load-retry"
        retry.addTarget(self, action: #selector(retryWorkspaceLoad), for: .touchUpInside)
        let home = UIButton(type: .system); home.setTitle("Return to dashboard", for: .normal)
        home.accessibilityIdentifier = "workspace-load-home"
        home.addTarget(self, action: #selector(returnFromWorkspaceLoad), for: .touchUpInside)
        for child in [spinner, label, retry, home] { stack.addArrangedSubview(child) }
        cover.addSubview(stack); view.addSubview(cover)
        NSLayoutConstraint.activate([
            cover.leadingAnchor.constraint(equalTo: view.leadingAnchor), cover.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            cover.topAnchor.constraint(equalTo: view.topAnchor), cover.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            stack.centerYAnchor.constraint(equalTo: cover.safeAreaLayoutGuide.centerYAnchor),
            stack.leadingAnchor.constraint(equalTo: cover.safeAreaLayoutGuide.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(equalTo: cover.safeAreaLayoutGuide.trailingAnchor, constant: -24),
            retry.heightAnchor.constraint(greaterThanOrEqualToConstant: 44), home.heightAnchor.constraint(greaterThanOrEqualToConstant: 44)
        ])
        workspaceLoadCover = cover; workspaceLoadLabel = label; workspaceLoadSpinner = spinner; workspaceLoadRetry = retry
    }

    private func startWorkspaceWebLoad(_ url: URL) {
        let generation = workspaceLoadGeneration
        workspaceLoadNavigation = webView?.load(URLRequest(url: url))
        guard workspaceLoadNavigation != nil else { workspaceLoadFailed(nil); return }
        let timeout = DispatchWorkItem { [weak self] in
            guard let self = self, self.workspaceLoadGeneration == generation else { return }
            self.workspaceLoadFailed(nil)
            self.webView?.stopLoading()
        }
        workspaceLoadTimeout = timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + 20, execute: timeout)
    }

    fileprivate func workspaceLoadFinished(_ navigation: WKNavigation?) {
        guard workspaceLoadCover != nil, let navigation = navigation,
              navigation === workspaceLoadNavigation else { return }
        clearWorkspaceLoadCover()
    }

    fileprivate func workspaceLoadFailed(_ navigation: WKNavigation?) {
        guard workspaceLoadCover != nil,
              navigation == nil || navigation === workspaceLoadNavigation else { return }
        workspaceLoadTimeout?.cancel(); workspaceLoadTimeout = nil
        workspaceLoadNavigation = nil
        workspaceLoadSpinner?.stopAnimating()
        workspaceLoadLabel?.text = "Unable to open this screen. Check your connection and try again."
        workspaceLoadRetry?.isHidden = false
    }

    private func clearWorkspaceLoadCover() {
        workspaceLoadGeneration = UUID()
        workspaceLoadTimeout?.cancel(); workspaceLoadTimeout = nil
        workspaceLoadNavigation = nil; workspaceLoadTarget = nil
        workspaceLoadCover?.removeFromSuperview(); workspaceLoadCover = nil
        workspaceLoadLabel = nil; workspaceLoadSpinner = nil; workspaceLoadRetry = nil
    }

    @objc private func retryWorkspaceLoad() {
        guard let url = workspaceLoadTarget, onboardingReady,
              nativeLoginController == nil, nativeOnboardingController == nil,
              NativeWorkspaceHistory.isWorkspaceURL(url, origin: makeDriverAuthConfig().origin) else { return }
        if WorkspaceHomeRouting.isHomeTarget(url, origin: makeDriverAuthConfig().origin) {
            returnFromWorkspaceLoad(); return
        }
        webView?.stopLoading()
        showWorkspaceLoadCover(target: url)
        startWorkspaceWebLoad(url)
    }

    @objc private func returnFromWorkspaceLoad() {
        guard onboardingReady, nativeLoginController == nil, nativeOnboardingController == nil else { return }
        let config = makeDriverAuthConfig()
        webView?.stopLoading()
        // The profile request is asynchronous too. Keep a native surface until
        // bootstrap presents a dashboard/login or finishes a role fallback load.
        showWorkspaceLoadCover(target: URL(string: "/vendor/dashboard", relativeTo: config.origin)!.absoluteURL)
        nativeNavigation.reset(); nativeChat.reset()
        loadDriverApp(config)
    }

    @available(iOS 16.0, *)
    func prepareNativePushLogout() async throws {
        guard let store = webView?.configuration.websiteDataStore.httpCookieStore else { throw WorkspaceError.expired }
        stopWorkspacePush()
        let origin = makeDriverAuthConfig().origin
        let api = WorkspaceAPI(origin: origin, cookieStore: store)
        defer { api.close() }
        let profile = try await api.profile()
        try await NativeWorkspacePush.shared.prepareLogout(profile: profile, origin: origin, cookieStore: store)
    }

    @available(iOS 16.0, *)
    private func stopWorkspacePush() {
        workspacePushGeneration = UUID()
        workspacePushTask?.cancel(); workspacePushTask = nil
        NativeWorkspacePush.shared.stop()
    }

    @available(iOS 16.0, *)
    private func startWorkspacePush(_ controller: WorkspaceHostingController, origin: URL, store: WKHTTPCookieStore, prompt: Bool) {
        workspacePushGeneration = UUID()
        workspacePushTask?.cancel(); workspacePushTask = nil
        let generation = workspacePushGeneration
        NativeWorkspacePush.shared.onError = { [weak controller] message in controller?.model.notificationError = message }
        workspacePushTask = Task { [weak self, weak controller] in
            guard let self = self, let controller = controller else { return }
            if controller.model.profile == nil { await controller.model.loadProfile() }
            guard !Task.isCancelled, self.workspacePushGeneration == generation,
                  self.nativeWorkspaceController === controller, !controller.model.invalidated,
                  let profile = controller.model.profile else { return }
            do {
                try await NativeWorkspacePush.shared.start(profile: profile, origin: origin, cookieStore: store,
                    allowPermissionPrompt: prompt, onOpen: { [weak self, weak controller] url in
                        guard let self = self, let controller = controller,
                              self.nativeWorkspaceController === controller else { return }
                        if let route = WorkspaceRoute.parse(url, origin: origin) { controller.openNativeRoute(route) }
                        else { self.openWorkspaceWeb(url.path, origin: origin) }
                    })
                guard !Task.isCancelled, self.workspacePushGeneration == generation else { return }
                controller.model.notificationError = nil
            } catch {
                guard !Task.isCancelled, self.workspacePushGeneration == generation else { return }
                controller.model.notificationError = (error as? WorkspaceError)?.errorDescription ?? "Could not connect notifications. Use Enable notifications to retry."
            }
        }
    }

    // Cancel the navigation before WebKit requests dashboard HTML, including target=_blank.
    func interceptWorkspaceHome(_ url: URL) -> Bool {
        guard #available(iOS 16.0, *),
              WorkspaceHomeRouting.isHomeTarget(url, origin: makeDriverAuthConfig().origin) else { return false }
        guard onboardingReady, nativeLoginController == nil, nativeOnboardingController == nil else { return true }
        if nativeWorkspaceRoot { return true }
        dismissNativeWorkspace { [weak self] in
            guard let self = self else { return }
            self.bootstrapWorkspace(self.makeDriverAuthConfig())
        }
        return true
    }

    @available(iOS 16.0, *)
    private func bootstrapWorkspace(_ config: DriverAuthConfig) {
        guard let store = webView?.configuration.websiteDataStore.httpCookieStore else { return }
        workspaceBootstrap?.cancel()
        let generation = UUID(); workspaceBootstrapGeneration = generation
        webView?.stopLoading()
        workspaceBootstrap = Task { [weak self] in
            guard let self = self else { return }
            let api = WorkspaceAPI(origin: config.origin, cookieStore: store)
            defer { api.close() }
            do {
                let profile = try await api.profile()
                try Task.checkCancellation()
                guard self.workspaceBootstrapGeneration == generation, self.onboardingReady,
                      self.nativeLoginController == nil, self.nativeOnboardingController == nil else { return }
                if WorkspaceHomeRouting.dashboardEligible(profile) {
                    let url = URL(string: "/vendor/dashboard", relativeTo: config.origin)!.absoluteURL
                    self.presentNativeWorkspace(route: .dashboard, url: url, origin: config.origin, store: store, isRoot: true, profile: profile)
                } else {
                    let path = WorkspaceHomeRouting.fallbackPath(profile)
                    self.stopWorkspacePush()
                    let url = URL(string: path, relativeTo: config.origin)!.absoluteURL
                    self.webView?.isHidden = false
                    if self.workspaceLoadCover != nil {
                        self.showWorkspaceLoadCover(target: url)
                        self.startWorkspaceWebLoad(url)
                    } else { self.webView?.load(URLRequest(url: url)) }
                }
            } catch {
                guard !Task.isCancelled, self.workspaceBootstrapGeneration == generation else { return }
                if case WorkspaceError.expired = error { self.presentNativeLogin(config); return }
                if self.workspaceLoadCover != nil { self.workspaceLoadFailed(nil); return }
                let alert = UIAlertController(title: "Unable to open workspace", message: error.localizedDescription, preferredStyle: .alert)
                alert.addAction(UIAlertAction(title: "Retry", style: .default) { [weak self] _ in self?.bootstrapWorkspace(config) })
                alert.addAction(UIAlertAction(title: "Sign in again", style: .cancel) { [weak self] _ in self?.presentNativeLogin(config) })
                self.present(alert, animated: false)
            }
        }
    }

    #if DEBUG && targetEnvironment(simulator)
    // Exercise the normal authenticated bootstrap against a local HTTP fixture.
    private func startWorkspaceBootstrapIfRequested() -> Bool {
        guard #available(iOS 16.0, *), let origin = workspaceBootstrapFixtureOrigin,
              let webView = webView as? OnboardingWebView else { return false }
        onboardingReady = true; webView.appNavigationEnabled = true
        let cookie = HTTPCookie(properties: [.name: "next-auth.session-token", .value: "local-ui-fixture", .domain: "127.0.0.1", .path: "/"])!
        webView.configuration.websiteDataStore.httpCookieStore.setCookie(cookie) { [weak self] in
            DispatchQueue.main.async { self?.loadDriverApp(DriverAuthConfig(origin: origin)) }
        }
        return true
    }

    private var workspaceBootstrapFixtureOrigin: URL? {
        guard let raw = ProcessInfo.processInfo.environment["TRASHED_WORKSPACE_BOOTSTRAP_ORIGIN"],
              let url = URL(string: raw), url.scheme == "http", url.host == "127.0.0.1", url.port != nil,
              url.user == nil, url.password == nil, url.query == nil, url.fragment == nil,
              url.path.isEmpty || url.path == "/" else { return nil }
        return url
    }

    // Explicit, loopback-only UI test harness. No production cookies/data or release bypass.
    private func startWorkspaceFixtureIfRequested() -> Bool {
        guard #available(iOS 16.0, *),
              let raw = ProcessInfo.processInfo.environment["TRASHED_WORKSPACE_FIXTURE_ORIGIN"],
              let origin = URL(string: raw), origin.scheme == "http", origin.host == "127.0.0.1",
              origin.user == nil, origin.password == nil, origin.port != nil,
              let path = ProcessInfo.processInfo.environment["TRASHED_WORKSPACE_FIXTURE_PATH"],
              let url = URL(string: path, relativeTo: origin)?.absoluteURL,
              let route = WorkspaceRoute.parse(url, origin: origin) else { return false }
        let store = WKWebsiteDataStore.nonPersistent()
        workspaceFixtureStore = store
        let cookie = HTTPCookie(properties: [.name: "next-auth.session-token", .value: "local-ui-fixture", .domain: "127.0.0.1", .path: "/"])!
        store.httpCookieStore.setCookie(cookie) { [weak self] in
            DispatchQueue.main.async {
                self?.presentNativeWorkspace(route: route, url: url, origin: origin, store: store.httpCookieStore)
            }
        }
        return true
    }
    #endif

    // Full-screen UIKit presentations may detach the presenting view from its window.
    // That is not logout and must not invalidate an already-presented native screen.
    private var nativeWorkspaceSessionAvailable: Bool {
        onboardingReady && nativeOnboardingController == nil && nativeLoginController == nil
            && (nativeWorkspaceRoot || webView?.isLoading == false)
    }

    var nativeNavigationAvailable: Bool {
        onboardingReady && nativeOnboardingController == nil && nativeLoginController == nil
            && !nativeWorkspaceRoot && webView?.isLoading == false && viewIfLoaded?.window != nil
    }

    var nativeChatAvailable: Bool {
        nativeNavigationAvailable && nativeChatSourceGuard != nil
    }

    func setNativeNavigationHeight(_ height: CGFloat) {
        nativeWebBottom?.constant = -height
        view.backgroundColor = .systemBackground
    }

    override func instanceDescriptor() -> InstanceDescriptor {
        let descriptor = super.instanceDescriptor()
        let serverURL = descriptor.serverURL ?? bundledServerURLString() ?? "https://trashed.app/app?source=trashed-app"
        descriptor.serverURL = driverURLString(from: serverURL, theme: currentDriverTheme)
        // Android needs a separate start path for its strict bridge origin. Here
        // serverURL already includes /app and theme; do not append it twice.
        descriptor.appStartPath = nil
        return descriptor
    }

    private func bundledServerURLString() -> String? {
        guard
            let configURL = Bundle.main.url(forResource: "capacitor.config", withExtension: "json"),
            let data = try? Data(contentsOf: configURL),
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let server = json["server"] as? [String: Any],
            let serverURL = server["url"] as? String
        else {
            return nil
        }

        return serverURL
    }

    private func driverURLString(from serverURL: String, theme: DriverTheme) -> String {
        guard
            let url = URL(string: serverURL),
            var components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        else {
            return serverURL
        }

        components.path = "/app"
        components.queryItems = [
            URLQueryItem(name: "source", value: "trashed-app"),
            URLQueryItem(name: "theme", value: theme.rawValue),
        ]
        return components.url?.absoluteString ?? serverURL
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        overrideUserInterfaceStyle = .unspecified
        NotificationCenter.default.addObserver(self, selector: #selector(publishSystemAppearance), name: UIApplication.didBecomeActiveNotification, object: nil)
        #if DEBUG && targetEnvironment(simulator)
        if startWorkspaceFixtureIfRequested() { return }
        #endif
        // Hide the native browser toolbar — this is a full-screen app shell, not a browser
        webView?.scrollView.bounces = false
        navigationController?.setNavigationBarHidden(true, animated: false)
        navigationController?.setToolbarHidden(true, animated: false)
        if let webView = webView {
            webView.allowsBackForwardNavigationGestures = false
            let edge = UIPanGestureRecognizer(target: self, action: #selector(handleHistoryEdge(_:)))
            edge.maximumNumberOfTouches = 1
            edge.delegate = self
            edge.isEnabled = false
            view.addGestureRecognizer(edge)
            // Center/vertical gestures fail our edge gate and keep normal WebView scrolling.
            webView.scrollView.panGestureRecognizer.require(toFail: edge)
            historyEdgeGesture = edge
            historyObservations = [
                webView.observe(\.canGoBack, options: [.new]) { [weak self] _, _ in self?.updateHistoryGestures() },
                webView.observe(\.isLoading, options: [.new]) { [weak self] webView, _ in
                    if webView.isLoading { self?.nativeNavigation.reset(); self?.nativeChat.reset(purge: !NativeChatPolicy.isAssistant(webView.url, configured: self?.bridge?.config.serverURL)) }
                    else { self?.nativeNavigation.refresh(); self?.publishSystemAppearance() }
                    self?.updateHistoryGestures()
                },
            ]
        }
        loginURLObservation = webView?.observe(\.url, options: [.new]) { [weak self] webView, _ in
            guard let self = self else { return }
            guard let url = webView.url else { self.nativeNavigation.reset(); self.nativeChat.reset(); return }
            self.updateHistoryGestures()
            if !NativeNavigationPolicy.isWorkspace(url, configured: self.bridge?.config.serverURL) { self.nativeNavigation.reset(); self.nativeChat.reset() }
            if url.path != "/vendor/assistant" { self.nativeChat.reset() }
            guard self.onboardingReady else { return }
            let config = self.makeDriverAuthConfig()
            guard url.scheme == config.origin.scheme,
                  url.host == config.origin.host,
                  url.port == config.origin.port,
                  url.path == "/partners/login" ||
                  url.path == "/app/login" || url.path == "/api/auth/signin"
            else { return }

            // Expired sessions and sign-out must return to the same native login
            // options as a fresh install, not the website's separate OAuth screen.
            webView.stopLoading()
            self.presentNativeLogin(config)
        }
        #if DEBUG && targetEnvironment(simulator)
        if startWorkspaceBootstrapIfRequested() { return }
        #endif
        // This local blank page supplies the original WebKit UA without a network request.
        webView?.loadHTMLString("<html><body></body></html>", baseURL: nil)
        if NativeOnboarding.isComplete() {
            prepareCompletedOnboarding { [weak self] error in
                guard let self = self else { return }
                if error == nil { self.showNativeLoginIfNeeded() }
                else { self.presentNativeOnboarding() }
            }
        } else {
            presentNativeOnboarding()
        }
    }

    override var prefersStatusBarHidden: Bool {
        return false
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        return currentDriverTheme == .light ? .darkContent : .lightContent
    }

    override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)

        if previousTraitCollection?.userInterfaceStyle != traitCollection.userInterfaceStyle {
            setNeedsStatusBarAppearanceUpdate()
            publishSystemAppearance()
        }
    }

    @objc private func publishSystemAppearance() {
        // Native UIKit/SwiftUI surfaces inherit dynamic traits automatically. This
        // signal repaints the existing safe web document; never reload or reset it.
        guard let webView = webView, !webView.isLoading, let url = webView.url,
              WorkspacePolicy.sameOrigin(url, makeDriverAuthConfig().origin),
              let script = NativeSystemAppearance.script(origin: makeDriverAuthConfig().origin) else { return }
        webView.evaluateJavaScript(script, completionHandler: nil)
    }

    private var currentDriverTheme: DriverTheme {
        traitCollection.userInterfaceStyle == .dark ? .dark : .light
    }

    private func updateHistoryGestures() {
        // Read the finalized history list after the URL/loading KVO notification (including pushState/popstate).
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let webView = self.webView else { return }
            let origin = self.makeDriverAuthConfig().origin
            let visible = self.onboardingReady && self.nativeOnboardingController == nil && self.nativeLoginController == nil
            let history = webView.backForwardList
            if NativeWorkspaceHistory.isAuthenticationURL(webView.url) { self.workspaceHistory.beginSession() }
            self.workspaceHistory.update(index: history.backList.count,
                workspace: visible && NativeWorkspaceHistory.isWorkspaceURL(webView.url, origin: origin), committed: !webView.isLoading)
            if !visible { self.dismissNativeWorkspace() }
            self.updateNativeWorkspace(for: webView.url)
            self.historyEdgeGesture?.isEnabled = visible && self.nativeWorkspaceController == nil && !webView.isLoading
                && NativeWorkspaceHistory.isSameOriginURL(webView.url, origin: origin)
                && !NativeWorkspaceHistory.isAuthenticationURL(webView.url)
        }
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool {
        guard gestureRecognizer === historyEdgeGesture, let webView = webView,
              otherGestureRecognizer.view?.isDescendant(of: webView) == true else { return false }
        // WebKit's DOM touch/scroll-lock recognizers must not swallow an admitted
        // native edge Back. Ordinary manipulation gestures keep their precedence.
        return !(otherGestureRecognizer is UIPanGestureRecognizer
            || otherGestureRecognizer is UIPinchGestureRecognizer
            || otherGestureRecognizer is UIRotationGestureRecognizer
            || otherGestureRecognizer is UITapGestureRecognizer
            || otherGestureRecognizer is UILongPressGestureRecognizer)
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        guard gestureRecognizer === historyEdgeGesture else { return true }
        return touch.type == .direct && NativeWorkspaceHistory.isBackSwipeStart(x: Double(touch.location(in: view).x))
    }

    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        guard gestureRecognizer === historyEdgeGesture, let pan = gestureRecognizer as? UIPanGestureRecognizer else { return true }
        let delta = pan.translation(in: view)
        let startX = pan.location(in: view).x - delta.x
        return NativeWorkspaceHistory.canBeginBackSwipe(startX: Double(startX), x: Double(delta.x),
            y: Double(delta.y), touches: pan.numberOfTouches)
    }

    @objc private func handleHistoryEdge(_ gesture: UIPanGestureRecognizer) {
        guard let webView = webView else { return }
        let history = webView.backForwardList
        if gesture.state == .began {
            if let item = history.currentItem, let url = webView.url { historyGestureStart = (item, url) }
            return
        }
        guard gesture.state == .ended else {
            if gesture.state == .cancelled || gesture.state == .failed { historyGestureStart = nil }
            return
        }
        defer { historyGestureStart = nil }
        let delta = gesture.translation(in: view)
        guard let start = historyGestureStart, !historyBackCheckPending,
              NativeWorkspaceHistory.isBackSwipe(x: Double(delta.x), y: Double(delta.y)),
              history.currentItem === start.item, webView.url == start.url else { return }
        if nativeNavigation.dismissSheet() { return }
        let target = history.backItem
        historyBackCheckPending = true
        webView.evaluateJavaScript(Self.dismissWebDialog) { [weak self] result, error in
            guard let self = self else { return }
            self.historyBackCheckPending = false
            // The script may finish after navigation, session expiry, or a native overlay appears.
            let visible = self.onboardingReady && self.nativeOnboardingController == nil && self.nativeLoginController == nil
            guard error == nil, result as? Bool == false, visible, !webView.isLoading,
                  webView.url == start.url, history.currentItem === start.item,
                  let target = target, history.backItem === target,
                  self.workspaceHistory.canGoBack(index: history.backList.count, current: webView.url,
                    back: target.url, origin: self.makeDriverAuthConfig().origin, visible: visible) else { return }
            webView.go(to: target) // Exact validated item; standard swipe skipping is deliberately disabled.
        }
    }

    private func presentNativeOnboarding() {
        nativeNavigation.reset()
        nativeChat.reset()
        workspaceHistory.reset()
        webView?.allowsBackForwardNavigationGestures = false
        historyEdgeGesture?.isEnabled = false
        guard nativeOnboardingController == nil else { return }
        let intro = NativeAppOnboardingView { [weak self] completion in
            NativeOnboarding.complete()
            self?.prepareCompletedOnboarding { error in
                completion(error)
                guard error == nil, let self = self else { return }
                self.nativeOnboardingController?.willMove(toParent: nil)
                self.nativeOnboardingController?.view.removeFromSuperview()
                self.nativeOnboardingController?.removeFromParent()
                self.nativeOnboardingController = nil
                self.showNativeLoginIfNeeded()
            }
        }
        let controller = UIHostingController(rootView: intro)
        addChild(controller)
        controller.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(controller.view)
        NSLayoutConstraint.activate([
            controller.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            controller.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            controller.view.topAnchor.constraint(equalTo: view.topAnchor),
            controller.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        controller.didMove(toParent: self)
        nativeOnboardingController = controller
    }

    private func prepareCompletedOnboarding(completion: @escaping (String?) -> Void) {
        guard NativeOnboarding.isComplete(), let webView = webView as? OnboardingWebView else {
            completion("Unable to prepare the app. Please try again.")
            return
        }
        webView.evaluateJavaScript("navigator.userAgent") { [weak self] result, _ in
            guard let self = self, let original = result as? String, !original.isEmpty else {
                completion("Unable to prepare the app. Please try again.")
                return
            }
            // Preserve the entire system/configured UA. This token affects walkthrough UI only.
            webView.customUserAgent = NativeOnboarding.completedUserAgent(original)
            self.onboardingReady = true
            webView.appNavigationEnabled = true
            completion(nil)
        }
    }

    private func showNativeLoginIfNeeded() {
        guard onboardingReady, let webView = webView else { return }
        let config = makeDriverAuthConfig()

        webView.stopLoading()
        let placeholderBackground = currentDriverTheme == .light ? "#f8fafc" : "#020617"
        webView.loadHTMLString("<html><body style='background:\(placeholderBackground)'></body></html>", baseURL: config.origin)
        presentNativeLogin(config)

        webView.configuration.websiteDataStore.httpCookieStore.getAllCookies { [weak self] cookies in
            DispatchQueue.main.async {
                guard let self = self, self.onboardingReady, self.nativeOnboardingController == nil else { return }
                if self.hasSessionCookie(in: cookies, for: config) {
                    self.removeNativeLogin()
                    self.loadDriverApp(config)
                }
            }
        }
    }

    private func makeDriverAuthConfig() -> DriverAuthConfig {
        #if DEBUG && targetEnvironment(simulator)
        if let origin = workspaceBootstrapFixtureOrigin { return DriverAuthConfig(origin: origin) }
        #endif
        let fallbackOrigin = URL(string: "https://trashed.app")!
        guard
            let serverURL = bridge?.config.serverURL,
            var components = URLComponents(url: serverURL, resolvingAgainstBaseURL: false),
            components.scheme != nil,
            components.host != nil
        else {
            return DriverAuthConfig(origin: fallbackOrigin)
        }

        components.path = ""
        components.query = nil
        components.fragment = nil
        return DriverAuthConfig(origin: components.url ?? fallbackOrigin)
    }

    private func presentNativeLogin(_ config: DriverAuthConfig) {
        guard onboardingReady, nativeOnboardingController == nil else { return }
        clearWorkspaceLoadCover()
        if #available(iOS 16.0, *) { stopWorkspacePush() }
        workspaceBootstrapGeneration = UUID()
        workspaceBootstrap?.cancel(); workspaceBootstrap = nil
        dismissNativeWorkspace()
        nativeNavigation.reset()
        nativeChat.reset()
        workspaceHistory.reset()
        webView?.allowsBackForwardNavigationGestures = false
        historyEdgeGesture?.isEnabled = false
        pendingAppleCredential = nil
        removeNativeLogin()

        // Keep the WebView session alive underneath the native sign-in view.
        webView?.isHidden = false

        let loginView = NativeDriverLoginView(
            signIn: { [weak self] email, password, completion in
                self?.signIn(email: email, password: password, config: config, completion: completion)
            },
            signInWithGoogle: { [weak self] completion in
                self?.signInWithGoogle(config: config, completion: completion)
            },
            signInWithApple: { [weak self] credential, completion in
                self?.signInWithApple(credential: credential, config: config, completion: completion)
            },
            cancelAppleLink: { [weak self] in
                self?.pendingAppleCredential = nil
            }
        )
        let hostingController = UIHostingController(rootView: loginView)

        addChild(hostingController)
        hostingController.view.translatesAutoresizingMaskIntoConstraints = false
        hostingController.view.backgroundColor = .clear
        view.addSubview(hostingController.view)
        NSLayoutConstraint.activate([
            hostingController.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            hostingController.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            hostingController.view.topAnchor.constraint(equalTo: view.topAnchor),
            hostingController.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        hostingController.didMove(toParent: self)
        nativeLoginController = hostingController
    }

    private func removeNativeLogin() {
        guard let nativeLoginController = nativeLoginController else { return }
        nativeLoginController.willMove(toParent: nil)
        nativeLoginController.view.removeFromSuperview()
        nativeLoginController.removeFromParent()
        self.nativeLoginController = nil
    }

    private func loadDriverApp(_ config: DriverAuthConfig) {
        guard onboardingReady, nativeOnboardingController == nil else { return }
        workspaceHistory.beginSession()
        webView?.allowsBackForwardNavigationGestures = false
        historyEdgeGesture?.isEnabled = false
        if #available(iOS 16.0, *) {
            bootstrapWorkspace(config)
        } else {
            webView?.isHidden = false
            webView?.load(URLRequest(url: config.driverURL(theme: currentDriverTheme)))
        }
    }

    private func signIn(
        email: String,
        password: String,
        config: DriverAuthConfig,
        completion: @escaping (String?) -> Void
    ) {
        let loginURL = pendingAppleCredential == nil ? config.loginURL : config.appleLoginURL
        var request = URLRequest(url: loginURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        do {
            var body = [
                "email": email,
                "password": password,
            ]
            if let apple = pendingAppleCredential {
                body["identityToken"] = apple.identityToken
                body["nonce"] = apple.nonce
            }
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        } catch {
            completion("Could not prepare the sign-in request.")
            return
        }

        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            let finish: (String?) -> Void = { message in
                DispatchQueue.main.async {
                    completion(message)
                }
            }

            if let error = error {
                finish(error.localizedDescription)
                return
            }

            guard let self = self, let httpResponse = response as? HTTPURLResponse else {
                finish("The sign-in server did not respond.")
                return
            }

            if !(200..<300).contains(httpResponse.statusCode) {
                finish(self.mobileLoginError(from: data) ?? "Invalid email or password.")
                return
            }

            let responseCookies = self.cookies(from: httpResponse, for: loginURL)
            let sessionCookies = self.expandedSessionCookies(from: responseCookies, for: config)
            if sessionCookies.isEmpty {
                finish("The sign-in server did not return a mobile session.")
                return
            }

            DispatchQueue.main.async {
                guard let cookieStore = self.webView?.configuration.websiteDataStore.httpCookieStore else {
                    completion("The app WebView is not ready.")
                    return
                }

                self.installCookies(sessionCookies, in: cookieStore) {
                    self.pendingAppleCredential = nil
                    self.removeNativeLogin()
                    self.loadDriverApp(config)
                    completion(nil)
                }
            }
        }.resume()
    }

    private func signInWithApple(
        credential: NativeAppleCredential,
        config: DriverAuthConfig,
        completion: @escaping (String?, Bool) -> Void
    ) {
        pendingAppleCredential = nil
        var request = URLRequest(url: config.appleLoginURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "identityToken": credential.identityToken,
            "nonce": credential.nonce,
        ])

        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            DispatchQueue.main.async {
                guard let self = self else { return }
                guard error == nil, let response = response as? HTTPURLResponse else {
                    completion("Could not reach Apple sign-in. Please try again.", false)
                    return
                }
                let json = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
                if response.statusCode == 409, json?["requiresAccountLink"] as? Bool == true {
                    self.pendingAppleCredential = credential
                    completion(nil, true)
                    return
                }
                guard (200..<300).contains(response.statusCode) else {
                    completion(self.mobileLoginError(from: data) ?? "Apple sign-in is unavailable. Please try again later.", false)
                    return
                }
                let cookies = self.expandedSessionCookies(from: self.cookies(from: response, for: config.appleLoginURL), for: config)
                guard self.hasSessionCookie(in: cookies, for: config),
                      let store = self.webView?.configuration.websiteDataStore.httpCookieStore else {
                    completion("The sign-in server did not return a mobile session.", false)
                    return
                }
                self.installCookies(cookies, in: store) {
                    self.removeNativeLogin()
                    self.loadDriverApp(config)
                    completion(nil, false)
                }
            }
        }.resume()
    }

    private func signInWithGoogle(config: DriverAuthConfig, completion: @escaping (String?) -> Void) {
        URLSession.shared.dataTask(with: config.googleConfigURL) { [weak self] data, _, error in
            let finish: (String?) -> Void = { message in
                DispatchQueue.main.async {
                    completion(message)
                }
            }

            if let error = error {
                finish(error.localizedDescription)
                return
            }

            guard
                let self = self,
                let data = data,
                let googleConfig = try? JSONDecoder().decode(NativeGoogleConfig.self, from: data),
                googleConfig.configured,
                let clientId = googleConfig.clientId,
                !clientId.isEmpty
            else {
                finish("Google sign-in is not configured for this app build.")
                return
            }

            DispatchQueue.main.async {
                let gidConfig = GIDConfiguration(clientID: clientId)
                GIDSignIn.sharedInstance.configuration = gidConfig

                GIDSignIn.sharedInstance.signIn(withPresenting: self) { [weak self] result, error in
                    if let error = error {
                        completion(error.localizedDescription)
                        return
                    }

                    guard let idToken = result?.user.idToken?.tokenString else {
                        completion("Google sign-in did not return an ID token.")
                        return
                    }

                    self?.finishGoogleSignIn(idToken: idToken, config: config, completion: completion)
                }
            }
        }.resume()
    }

    private func finishGoogleSignIn(idToken: String, config: DriverAuthConfig, completion: @escaping (String?) -> Void) {
        var request = URLRequest(url: config.googleLoginURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "idToken": idToken,
            ])
        } catch {
            completion("Could not prepare the Google sign-in request.")
            return
        }

        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            let finish: (String?) -> Void = { message in
                DispatchQueue.main.async {
                    completion(message)
                }
            }

            if let error = error {
                finish(error.localizedDescription)
                return
            }

            guard let self = self, let httpResponse = response as? HTTPURLResponse else {
                finish("The sign-in server did not respond.")
                return
            }

            if !(200..<300).contains(httpResponse.statusCode) {
                finish(self.mobileLoginError(from: data) ?? "Google sign-in failed.")
                return
            }

            let responseCookies = self.cookies(from: httpResponse, for: config.googleLoginURL)
            let sessionCookies = self.expandedSessionCookies(from: responseCookies, for: config)
            if sessionCookies.isEmpty {
                finish("The sign-in server did not return a mobile session.")
                return
            }

            DispatchQueue.main.async {
                guard let cookieStore = self.webView?.configuration.websiteDataStore.httpCookieStore else {
                    completion("The app WebView is not ready.")
                    return
                }

                self.installCookies(sessionCookies, in: cookieStore) {
                    self.removeNativeLogin()
                    self.loadDriverApp(config)
                    completion(nil)
                }
            }
        }.resume()
    }

    private func cookies(from response: HTTPURLResponse, for url: URL) -> [HTTPCookie] {
        let headers = response.allHeaderFields.reduce(into: [String: String]()) { result, item in
            guard let key = item.key as? String, let value = item.value as? String else { return }
            result[key] = value
        }
        return HTTPCookie.cookies(withResponseHeaderFields: headers, for: url)
    }

    private func expandedSessionCookies(from cookies: [HTTPCookie], for config: DriverAuthConfig) -> [HTTPCookie] {
        guard let sourceCookie = cookies.first(where: { driverSessionCookieNames.contains($0.name) }) else {
            return cookies
        }

        let domain = sourceCookie.domain.isEmpty ? config.host : sourceCookie.domain
        let path = sourceCookie.path.isEmpty ? "/" : sourceCookie.path
        let expires = sourceCookie.expiresDate ?? Date(timeIntervalSinceNow: 30 * 24 * 60 * 60)
        var expandedCookies = cookies

        for name in driverSessionCookieNames {
            if expandedCookies.contains(where: { $0.name == name && $0.domain == domain }) {
                continue
            }

            var properties: [HTTPCookiePropertyKey: Any] = [
                .domain: domain,
                .path: path,
                .name: name,
                .value: sourceCookie.value,
                .expires: expires,
            ]

            if sourceCookie.isSecure || name.hasPrefix("__Secure-") || config.origin.scheme == "https" {
                properties[.secure] = "TRUE"
            }
            if sourceCookie.isHTTPOnly {
                properties[HTTPCookiePropertyKey("HttpOnly")] = "TRUE"
            }

            if let cookie = HTTPCookie(properties: properties) {
                expandedCookies.append(cookie)
            }
        }

        return expandedCookies
    }

    private func installCookies(_ cookies: [HTTPCookie], in cookieStore: WKHTTPCookieStore, completion: @escaping () -> Void) {
        guard !cookies.isEmpty else {
            completion()
            return
        }

        let group = DispatchGroup()
        for cookie in cookies {
            group.enter()
            cookieStore.setCookie(cookie) {
                group.leave()
            }
        }
        group.notify(queue: .main, execute: completion)
    }

    private func hasSessionCookie(in cookies: [HTTPCookie], for config: DriverAuthConfig) -> Bool {
        let now = Date()
        return cookies.contains { cookie in
            driverSessionCookieNames.contains(cookie.name)
                && !cookie.value.isEmpty
                && (cookie.expiresDate == nil || cookie.expiresDate! > now)
                && cookieMatches(cookie, host: config.host)
        }
    }

    private func cookieMatches(_ cookie: HTTPCookie, host: String) -> Bool {
        let normalizedHost = host.lowercased()
        let domain = cookie.domain.trimmingCharacters(in: CharacterSet(charactersIn: ".")).lowercased()

        return domain == normalizedHost || normalizedHost.hasSuffix("." + domain)
    }

    private func mobileLoginError(from data: Data?) -> String? {
        guard
            let data = data,
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let message = json["error"] as? String,
            !message.isEmpty
        else {
            return nil
        }

        return message
    }

}

private struct NativeAppOnboardingView: View {
    let finish: (@escaping (String?) -> Void) -> Void
    @Environment(\.colorScheme) private var colorScheme
    @State private var step = 0
    @State private var preparing = false
    @State private var errorMessage: String?

    // Match the website's flat primary; never inherit a system-green action.
    private let primary = Color(red: 112 / 255, green: 51 / 255, blue: 1)
    private var foreground: Color { colorScheme == .dark ? .white : Color(red: 0.13, green: 0.10, blue: 0.17) }
    private var background: Color { colorScheme == .dark ? Color(red: 0.08, green: 0.07, blue: 0.10) : Color(red: 0.98, green: 0.98, blue: 0.99) }
    private var muted: Color { colorScheme == .dark ? Color(red: 0.75, green: 0.72, blue: 0.80) : Color(red: 0.38, green: 0.35, blue: 0.43) }
    private var surface: Color { colorScheme == .dark ? Color(red: 0.16, green: 0.13, blue: 0.20) : Color(red: 0.94, green: 0.92, blue: 0.98) }

    var body: some View {
        GeometryReader { geometry in
            VStack(spacing: 0) {
                HStack(spacing: 8) {
                    Image("onboarding_symbol")
                        .renderingMode(.template)
                        .resizable()
                        .scaledToFit()
                        .frame(width: 28, height: 28)
                        .foregroundColor(primary)
                        .accessibilityHidden(true)
                    Image("onboarding_wordmark")
                        .renderingMode(.template)
                        .resizable()
                        .scaledToFit()
                        .frame(width: 120, height: 28)
                        .foregroundColor(foreground)
                        .accessibilityLabel("Trashed")
                        .accessibilityIdentifier("native-onboarding-brand")
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.bottom, 20)
                ScrollView {
                    pageContent(heroHeight: min(300, max(140, geometry.size.height * 0.38)))
                        .padding(.bottom, 20)
                }
                .id(step)
                actions
            }
            .padding(.horizontal, 24)
            .padding(.top, 20)
            .padding(.bottom, 12)
            .frame(maxWidth: 640)
            .frame(maxWidth: .infinity)
        }
        .foregroundColor(foreground)
        .background(background.edgesIgnoringSafeArea(.all))
    }

    private func pageContent(heroHeight: CGFloat) -> some View {
        let page = NativeOnboarding.pages[step]
        return VStack(alignment: .leading, spacing: 14) {
            Image(page.image)
                .resizable()
                .scaledToFit()
                .frame(maxWidth: .infinity)
                .frame(height: heroHeight)
                .accessibilityHidden(true)
                .accessibilityIdentifier("native-onboarding-hero")
            Text(page.title)
                .font(.title.bold())
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("native-onboarding-title")
            Text(page.body)
                .font(.body)
                .foregroundColor(muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var actions: some View {
        VStack(spacing: 8) {
            HStack {
                Button {
                    if step == 0 { complete() } else { step -= 1 }
                } label: {
                    Text(step == 0 ? "Skip" : "Back")
                        .font(.subheadline.weight(.semibold))
                        .frame(minWidth: 64, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(preparing)
                .accessibilityIdentifier("native-onboarding-back")
                Spacer()
                HStack(spacing: 6) {
                    ForEach(NativeOnboarding.pages.indices) { index in
                        Capsule().fill(index == step ? primary : surface)
                            .frame(width: index == step ? 24 : 8, height: 8)
                    }
                }
                .accessibilityHidden(true)
                Spacer()
                Text("\(step + 1) of \(NativeOnboarding.pages.count)")
                    .font(.caption)
                    .foregroundColor(muted)
                    .accessibilityIdentifier("native-onboarding-progress")
            }
            if let errorMessage {
                Text(errorMessage).font(.subheadline).foregroundColor(.red)
            }
            Button {
                if step == NativeOnboarding.pages.count - 1 { complete() } else { step += 1 }
            } label: {
                Text(preparing ? "Preparing..." : step == NativeOnboarding.pages.count - 1 ? "Get started" : "Next")
                    .font(.headline)
                    .padding(.horizontal, 18)
                    .frame(maxWidth: .infinity, minHeight: 54)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .background(primary)
            .foregroundColor(.white)
            .cornerRadius(14)
            .disabled(preparing)
            .accessibilityIdentifier("native-onboarding-next")
        }
    }

    private func complete() {
        preparing = true
        errorMessage = nil
        finish { error in
            preparing = false
            errorMessage = error
        }
    }
}

private struct NativeDriverLoginView: View {
    let signIn: (_ email: String, _ password: String, _ completion: @escaping (String?) -> Void) -> Void
    let signInWithGoogle: (_ completion: @escaping (String?) -> Void) -> Void
    let signInWithApple: (_ credential: NativeAppleCredential, _ completion: @escaping (String?, Bool) -> Void) -> Void
    let cancelAppleLink: () -> Void

    @Environment(\.colorScheme) private var colorScheme
    @State private var email = ""
    @State private var password = ""
    @State private var errorMessage: String?
    @State private var isSubmitting = false
    @State private var isGoogleSubmitting = false
    @State private var isAppleSubmitting = false
    @State private var appleNonce: String?
    @State private var appleLinkPending = false

    private let primary = Color(red: 112 / 255, green: 51 / 255, blue: 1)

    private var canSubmit: Bool {
        !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !password.isEmpty && !isSubmitting && !isGoogleSubmitting && !isAppleSubmitting
    }

    private var isLightMode: Bool {
        colorScheme == .light
    }

    private var logoColor: Color {
        isLightMode ? Color(red: 0.13, green: 0.10, blue: 0.17) : .white
    }

    private var primaryTextColor: Color {
        isLightMode ? Color(red: 0.13, green: 0.10, blue: 0.17) : .white
    }

    private var secondaryTextColor: Color {
        isLightMode ? Color(red: 0.38, green: 0.35, blue: 0.43) : .white.opacity(0.68)
    }

    private var mutedTextColor: Color {
        isLightMode ? Color(red: 0.38, green: 0.35, blue: 0.43) : .white.opacity(0.52)
    }

    private var labelTextColor: Color {
        isLightMode ? Color(red: 0.13, green: 0.10, blue: 0.17) : .white.opacity(0.82)
    }

    private var dividerColor: Color {
        isLightMode ? Color(red: 0.85, green: 0.82, blue: 0.88) : .white.opacity(0.16)
    }

    private var disabledButtonColor: Color {
        isLightMode ? Color(red: 0.90, green: 0.88, blue: 0.93) : .white.opacity(0.16)
    }

    private var errorTextColor: Color {
        isLightMode ? Color(red: 0.72, green: 0.11, blue: 0.11) : Color(red: 1.0, green: 0.62, blue: 0.62)
    }

    private var errorBackgroundColor: Color {
        isLightMode ? Color(red: 1.0, green: 0.89, blue: 0.89) : Color(red: 0.45, green: 0.06, blue: 0.08).opacity(0.35)
    }

    private var footnoteTextColor: Color {
        isLightMode ? Color(red: 0.38, green: 0.35, blue: 0.43) : .white.opacity(0.48)
    }

    private var cardStrokeColor: Color {
        isLightMode ? Color(red: 0.89, green: 0.86, blue: 0.92) : .white.opacity(0.12)
    }

    private var logoImage: Image {
        let image = UIImage(named: "trashed-logo-mark") ?? Self.bundledLogoImage()
        return image.map { Image(uiImage: $0) } ?? Image("trashed-logo-mark")
    }

    private static func bundledLogoImage() -> UIImage? {
        guard let path = Bundle.main.path(forResource: "trashed-logo-mark@3x", ofType: "png") else {
            return nil
        }

        return UIImage(contentsOfFile: path)
    }

    var body: some View {
        ZStack {
            DriverLoginMapBackground(isLightMode: isLightMode)

            ScrollView {
                VStack(spacing: 22) {
                    VStack(spacing: 10) {
                        logoImage
                            .renderingMode(.template)
                            .resizable()
                            .scaledToFit()
                            .foregroundColor(logoColor)
                            .frame(width: 104, height: 82)
                            .accessibilityHidden(true)

                        Text("Trashed")
                            .font(.system(size: 16, weight: .semibold, design: .rounded))
                            .foregroundColor(secondaryTextColor)
                    }

                    VStack(spacing: 8) {
                        Text("Sign in to Trashed")
                            .font(.system(size: 30, weight: .bold, design: .rounded))
                            .foregroundColor(primaryTextColor)
                        Text("Manage your waste services business on-the-go with AI features")
                            .font(.system(size: 15, weight: .regular))
                            .foregroundColor(secondaryTextColor)
                            .multilineTextAlignment(.center)
                    }

                    VStack(spacing: 16) {
                        SignInWithAppleButton(.continue, onRequest: { request in
                            errorMessage = nil
                            isAppleSubmitting = true
                            let nonce = UUID().uuidString
                            appleNonce = nonce
                            request.requestedScopes = [.email]
                            request.nonce = SHA256.hash(data: Data(nonce.utf8)).map { String(format: "%02x", $0) }.joined()
                            request.state = nonce
                        }, onCompletion: completeAppleAuthorization)
                        .signInWithAppleButtonStyle(isLightMode ? .black : .white)
                        .frame(height: 50)
                        .cornerRadius(14)
                        .disabled(isSubmitting || isGoogleSubmitting || isAppleSubmitting || appleLinkPending)
                        .accessibilityIdentifier("native-driver-apple-sign-in")

                        Button(action: submitGoogle) {
                            HStack(spacing: 10) {
                                if isGoogleSubmitting {
                                    ProgressView()
                                        .progressViewStyle(CircularProgressViewStyle(tint: primaryTextColor))
                                }
                                Text("G")
                                    .font(.system(size: 17, weight: .bold, design: .rounded))
                                Text(isGoogleSubmitting ? "Signing in with Google..." : "Continue with Google")
                                    .font(.system(size: 17, weight: .medium))
                            }
                            .padding(.horizontal, 14)
                            .frame(maxWidth: .infinity, minHeight: 50)
                            .background(cardBackground)
                            .foregroundColor(primaryTextColor)
                            .cornerRadius(14)
                            .overlay(RoundedRectangle(cornerRadius: 14).stroke(dividerColor, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                        .disabled(isSubmitting || isGoogleSubmitting || isAppleSubmitting || appleLinkPending)
                        .accessibilityIdentifier("native-driver-google-sign-in")

                        if appleLinkPending {
                            Text("One-time setup: sign in with your existing Trashed email and password below to link Apple. Your Apple email can stay private. No new account will be created.")
                                .font(.system(size: 13))
                                .foregroundColor(secondaryTextColor)
                                .accessibilityIdentifier("native-driver-apple-link-notice")
                            Button("Cancel linking Apple") {
                                cancelAppleLink()
                                appleLinkPending = false
                                errorMessage = nil
                            }
                            .disabled(isSubmitting)
                            .accessibilityIdentifier("native-driver-apple-link-cancel")
                        }

                        HStack {
                            Rectangle().fill(dividerColor).frame(height: 1)
                            Text("or sign in with email")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundColor(mutedTextColor)
                            Rectangle().fill(dividerColor).frame(height: 1)
                        }

                        VStack(alignment: .leading, spacing: 8) {
                            Text("Email Address")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(labelTextColor)
                            TextField("name@example.com", text: $email)
                                .keyboardType(.emailAddress)
                                .autocapitalization(.none)
                                .disableAutocorrection(true)
                                .textContentType(.username)
                                .padding(14)
                                .background(fieldBackground)
                                .foregroundColor(primaryTextColor)
                                .accentColor(primary)
                                .accessibilityIdentifier("native-driver-email")
                        }

                        VStack(alignment: .leading, spacing: 8) {
                            Text("Password")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(labelTextColor)
                            SecureField("Enter your password", text: $password)
                                .textContentType(.password)
                                .padding(14)
                                .background(fieldBackground)
                                .foregroundColor(primaryTextColor)
                                .accentColor(primary)
                                .accessibilityIdentifier("native-driver-password")
                        }

                        if let errorMessage = errorMessage {
                            Text(errorMessage)
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(errorTextColor)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(12)
                                .background(errorBackgroundColor)
                                .cornerRadius(12)
                                .accessibilityIdentifier("native-driver-login-error")
                        }

                        Button(action: submit) {
                            HStack(spacing: 10) {
                                if isSubmitting {
                                    ProgressView()
                                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                }
                                Text(isSubmitting ? "Signing In..." : "Sign In")
                                    .font(.system(size: 17, weight: .medium))
                            }
                            .padding(.horizontal, 14)
                            .frame(maxWidth: .infinity, minHeight: 50)
                            .background(canSubmit ? primary : disabledButtonColor)
                            .foregroundColor(canSubmit ? .white : secondaryTextColor)
                            .cornerRadius(14)
                        }
                        .buttonStyle(.plain)
                        .disabled(!canSubmit)
                        .accessibilityIdentifier("native-driver-sign-in")
                    }
                    .padding(20)
                    .background(cardBackground)
                    .cornerRadius(28)
                    .overlay(
                        RoundedRectangle(cornerRadius: 28)
                            .stroke(cardStrokeColor, lineWidth: 1)
                    )

                    Text("Need access? Ask your account administrator to add you. By signing in, you agree to the Trashed Terms and Privacy Policy.")
                        .font(.system(size: 12))
                        .foregroundColor(footnoteTextColor)
                        .multilineTextAlignment(.center)
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 42)
                .frame(maxWidth: 460)
            }
        }
    }

    private var fieldBackground: some View {
        RoundedRectangle(cornerRadius: 14)
            .fill(isLightMode ? Color(red: 0.98, green: 0.97, blue: 0.99) : Color(red: 0.16, green: 0.13, blue: 0.20))
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(isLightMode ? Color(red: 0.85, green: 0.82, blue: 0.88) : Color.white.opacity(0.14), lineWidth: 1)
            )
    }

    private var cardBackground: Color {
        isLightMode ? .white : Color(red: 0.12, green: 0.10, blue: 0.15)
    }

    private func submit() {
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard canSubmit else { return }

        errorMessage = nil
        isSubmitting = true
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)

        signIn(normalizedEmail, password) { message in
            isSubmitting = false
            errorMessage = message
        }
    }

    private func submitGoogle() {
        guard !isSubmitting && !isGoogleSubmitting && !isAppleSubmitting && !appleLinkPending else { return }

        errorMessage = nil
        isGoogleSubmitting = true
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)

        signInWithGoogle { message in
            isGoogleSubmitting = false
            errorMessage = message
        }
    }

    private func completeAppleAuthorization(_ result: Result<ASAuthorization, Error>) {
        guard let nonce = appleNonce else {
            isAppleSubmitting = false
            return
        }
        appleNonce = nil
        switch result {
        case .failure(let error):
            isAppleSubmitting = false
            if (error as? ASAuthorizationError)?.code != .canceled {
                errorMessage = "Apple sign-in failed. Please try again."
            }
        case .success(let authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  credential.state == nonce,
                  let data = credential.identityToken,
                  let identityToken = String(data: data, encoding: .utf8) else {
                isAppleSubmitting = false
                errorMessage = "Apple did not return a valid sign-in credential."
                return
            }
            signInWithApple(NativeAppleCredential(identityToken: identityToken, nonce: nonce)) { message, needsLink in
                isAppleSubmitting = false
                appleLinkPending = needsLink
                errorMessage = message
            }
        }
    }
}

private struct DriverLoginMapBackground: View {
    let isLightMode: Bool

    private static let roads = [
        DriverLoginMapRoad(id: 0, width: 1.45, thickness: 18, x: -0.18, y: -0.32, rotation: -27, opacity: 0.20),
        DriverLoginMapRoad(id: 1, width: 1.30, thickness: 12, x: 0.28, y: -0.18, rotation: 18, opacity: 0.16),
        DriverLoginMapRoad(id: 2, width: 1.18, thickness: 14, x: -0.22, y: 0.08, rotation: 31, opacity: 0.14),
        DriverLoginMapRoad(id: 3, width: 1.50, thickness: 10, x: 0.18, y: 0.30, rotation: -15, opacity: 0.14),
        DriverLoginMapRoad(id: 4, width: 1.05, thickness: 8, x: -0.28, y: 0.44, rotation: 8, opacity: 0.12),
    ]

    private var baseColor: Color {
        isLightMode ? Color(red: 0.98, green: 0.98, blue: 0.99) : Color(red: 0.08, green: 0.07, blue: 0.10)
    }

    private var tileRoadColor: Color {
        isLightMode ? Color(red: 0.72, green: 0.68, blue: 0.76) : Color(red: 0.16, green: 0.13, blue: 0.20)
    }

    private var routeGlowColor: Color {
        Color(red: 112 / 255, green: 51 / 255, blue: 1)
    }

    private var routeSurfaceColor: Color {
        isLightMode ? Color(red: 0.86, green: 0.82, blue: 0.91) : Color(red: 0.25, green: 0.20, blue: 0.29)
    }

    private var routeCenterColor: Color {
        isLightMode ? .white : Color(red: 112 / 255, green: 51 / 255, blue: 1)
    }

    var body: some View {
        GeometryReader { proxy in
            let size = proxy.size

            ZStack {
                baseColor

                ForEach(Self.roads) { road in
                    RoundedRectangle(cornerRadius: road.thickness / 2, style: .continuous)
                        .fill(tileRoadColor.opacity(road.opacity))
                        .frame(width: size.width * road.width, height: road.thickness)
                        .rotationEffect(.degrees(road.rotation))
                        .offset(x: size.width * road.x, y: size.height * road.y)
                }

                routePath(in: size)
                    .stroke(routeGlowColor.opacity(isLightMode ? 0.16 : 0.24), style: StrokeStyle(lineWidth: 28, lineCap: .round, lineJoin: .round))
                    .blur(radius: 8)

                routePath(in: size)
                    .stroke(routeSurfaceColor.opacity(isLightMode ? 0.72 : 0.86), style: StrokeStyle(lineWidth: 13, lineCap: .round, lineJoin: .round))

                routePath(in: size)
                    .stroke(routeCenterColor.opacity(isLightMode ? 0.72 : 0.92), style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round, dash: isLightMode ? [8, 8] : []))

                mapFogOverlay
            }
        }
        .edgesIgnoringSafeArea(.all)
    }

    private var mapFogOverlay: some View {
        ZStack {
            VStack(spacing: 0) {
                LinearGradient(gradient: Gradient(colors: [baseColor, baseColor.opacity(0)]), startPoint: .top, endPoint: .bottom)
                    .frame(height: 210)
                Spacer()
                LinearGradient(gradient: Gradient(colors: [baseColor.opacity(0), baseColor]), startPoint: .top, endPoint: .bottom)
                    .frame(height: 180)
            }

            HStack(spacing: 0) {
                LinearGradient(gradient: Gradient(colors: [baseColor, baseColor.opacity(0)]), startPoint: .leading, endPoint: .trailing)
                    .frame(width: 96)
                Spacer()
                LinearGradient(gradient: Gradient(colors: [baseColor.opacity(0), baseColor]), startPoint: .leading, endPoint: .trailing)
                    .frame(width: 96)
            }
        }
    }

    private func routePath(in size: CGSize) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: -size.width * 0.16, y: size.height * 0.64))
        path.addCurve(
            to: CGPoint(x: size.width * 0.30, y: size.height * 0.55),
            control1: CGPoint(x: size.width * 0.04, y: size.height * 0.58),
            control2: CGPoint(x: size.width * 0.14, y: size.height * 0.68)
        )
        path.addLine(to: CGPoint(x: size.width * 0.56, y: size.height * 0.42))
        path.addCurve(
            to: CGPoint(x: size.width * 1.16, y: size.height * 0.32),
            control1: CGPoint(x: size.width * 0.74, y: size.height * 0.28),
            control2: CGPoint(x: size.width * 0.92, y: size.height * 0.46)
        )
        return path
    }
}

private struct DriverLoginMapRoad: Identifiable {
    let id: Int
    let width: CGFloat
    let thickness: CGFloat
    let x: CGFloat
    let y: CGFloat
    let rotation: Double
    let opacity: Double
}
