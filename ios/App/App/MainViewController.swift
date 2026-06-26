import UIKit
import SwiftUI
import WebKit
import Capacitor

private let driverSessionCookieNames = [
    "next-auth.session-token",
    "__Secure-next-auth.session-token",
    "authjs.session-token",
    "__Secure-authjs.session-token",
]

private struct DriverAuthConfig {
    let origin: URL

    var host: String {
        origin.host ?? ""
    }

    var driverURL: URL {
        URL(string: "/driver?source=trashed-driver-app", relativeTo: origin)!.absoluteURL
    }

    var loginURL: URL {
        URL(string: "/api/auth/mobile/login", relativeTo: origin)!.absoluteURL
    }

    var webLoginURL: URL {
        URL(string: "/app/login?callbackUrl=%2Fdriver", relativeTo: origin)!.absoluteURL
    }
}

class MainViewController: CAPBridgeViewController {
    private var nativeLoginController: UIHostingController<NativeDriverLoginView>?

    override func instanceDescriptor() -> InstanceDescriptor {
        let descriptor = super.instanceDescriptor()
        let serverURL = descriptor.serverURL ?? bundledServerURLString() ?? "https://trashed.app/driver?source=trashed-driver-app"
        descriptor.serverURL = appLoginURLString(from: serverURL)
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

    private func appLoginURLString(from serverURL: String) -> String {
        guard
            let url = URL(string: serverURL),
            var components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        else {
            return serverURL
        }

        components.path = "/app/login"
        components.query = "callbackUrl=%2Fdriver"
        return components.url?.absoluteString ?? serverURL
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        // Hide the native browser toolbar — this is a full-screen app shell, not a browser
        webView?.scrollView.bounces = false
        navigationController?.setNavigationBarHidden(true, animated: false)
        navigationController?.setToolbarHidden(true, animated: false)
        showNativeLoginIfNeeded()
    }

    override var prefersStatusBarHidden: Bool {
        return false
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        return .lightContent
    }

    private func showNativeLoginIfNeeded() {
        guard let webView = webView else { return }
        let config = makeDriverAuthConfig()

        webView.stopLoading()
        webView.loadHTMLString("<html><body style='background:#020617'></body></html>", baseURL: config.origin)
        presentNativeLogin(config)

        webView.configuration.websiteDataStore.httpCookieStore.getAllCookies { [weak self] cookies in
            DispatchQueue.main.async {
                guard let self = self else { return }
                if self.hasSessionCookie(in: cookies, for: config) {
                    self.removeNativeLogin()
                    self.loadDriverApp(config)
                }
            }
        }
    }

    private func makeDriverAuthConfig() -> DriverAuthConfig {
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
        removeNativeLogin()

        // CAPBridgeViewController's root view is the WKWebView. Hiding the WebView
        // also hides native child views, so keep it visible and cover it instead.
        webView?.isHidden = false

        let loginView = NativeDriverLoginView(
            signIn: { [weak self] email, password, completion in
                self?.signIn(email: email, password: password, config: config, completion: completion)
            },
            openWebSignIn: { [weak self] in
                self?.openWebSignIn(config)
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

    private func openWebSignIn(_ config: DriverAuthConfig) {
        removeNativeLogin()
        webView?.isHidden = false
        webView?.load(URLRequest(url: config.webLoginURL))
    }

    private func loadDriverApp(_ config: DriverAuthConfig) {
        webView?.isHidden = false
        webView?.load(URLRequest(url: config.driverURL))
    }

    private func signIn(
        email: String,
        password: String,
        config: DriverAuthConfig,
        completion: @escaping (String?) -> Void
    ) {
        var request = URLRequest(url: config.loginURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "email": email,
                "password": password,
            ])
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

            let responseCookies = self.cookies(from: httpResponse, for: config.loginURL)
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

private struct NativeDriverLoginView: View {
    let signIn: (_ email: String, _ password: String, _ completion: @escaping (String?) -> Void) -> Void
    let openWebSignIn: () -> Void

    @State private var email = ""
    @State private var password = ""
    @State private var errorMessage: String?
    @State private var isSubmitting = false

    private var canSubmit: Bool {
        !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !password.isEmpty && !isSubmitting
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
            LinearGradient(
                gradient: Gradient(colors: [
                    Color(red: 0.02, green: 0.04, blue: 0.09),
                    Color(red: 0.06, green: 0.10, blue: 0.20),
                ]),
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .edgesIgnoringSafeArea(.all)

            ScrollView {
                VStack(spacing: 22) {
                    VStack(spacing: 10) {
                        logoImage
                            .resizable()
                            .scaledToFit()
                            .frame(width: 88, height: 70)
                            .padding(.horizontal, 18)
                            .padding(.vertical, 16)
                            .background(Color.white.opacity(0.10))
                            .cornerRadius(24)
                            .overlay(
                                RoundedRectangle(cornerRadius: 24)
                                    .stroke(Color.white.opacity(0.16), lineWidth: 1)
                            )
                            .accessibilityHidden(true)

                        Text("Trashed Driver")
                            .font(.system(size: 16, weight: .semibold, design: .rounded))
                            .foregroundColor(.white.opacity(0.78))
                    }

                    VStack(spacing: 8) {
                        Text("Driver Sign In")
                            .font(.system(size: 30, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                        Text("Sign in to open your route, stops, and dispatch messages.")
                            .font(.system(size: 15, weight: .regular))
                            .foregroundColor(.white.opacity(0.68))
                            .multilineTextAlignment(.center)
                    }

                    VStack(spacing: 16) {
                        Button(action: openWebSignIn) {
                            HStack(spacing: 10) {
                                Text("G")
                                    .font(.system(size: 17, weight: .bold, design: .rounded))
                                Text("Continue with Google")
                                    .font(.system(size: 15, weight: .semibold))
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(Color.white)
                            .foregroundColor(Color(red: 0.08, green: 0.10, blue: 0.16))
                            .cornerRadius(14)
                        }
                        .accessibilityIdentifier("native-driver-google-sign-in")

                        HStack {
                            Rectangle().fill(Color.white.opacity(0.16)).frame(height: 1)
                            Text("or sign in with email")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundColor(.white.opacity(0.52))
                            Rectangle().fill(Color.white.opacity(0.16)).frame(height: 1)
                        }

                        VStack(alignment: .leading, spacing: 8) {
                            Text("Email Address")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(.white.opacity(0.82))
                            TextField("name@example.com", text: $email)
                                .keyboardType(.emailAddress)
                                .autocapitalization(.none)
                                .disableAutocorrection(true)
                                .textContentType(.username)
                                .padding(14)
                                .background(fieldBackground)
                                .foregroundColor(.white)
                                .accessibilityIdentifier("native-driver-email")
                        }

                        VStack(alignment: .leading, spacing: 8) {
                            Text("Password")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(.white.opacity(0.82))
                            SecureField("Enter your password", text: $password)
                                .textContentType(.password)
                                .padding(14)
                                .background(fieldBackground)
                                .foregroundColor(.white)
                                .accessibilityIdentifier("native-driver-password")
                        }

                        if let errorMessage = errorMessage {
                            Text(errorMessage)
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(Color(red: 1.0, green: 0.62, blue: 0.62))
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(12)
                                .background(Color(red: 0.45, green: 0.06, blue: 0.08).opacity(0.35))
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
                                    .font(.system(size: 16, weight: .bold))
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 15)
                            .background(canSubmit ? Color(red: 0.12, green: 0.74, blue: 0.45) : Color.white.opacity(0.16))
                            .foregroundColor(.white)
                            .cornerRadius(14)
                        }
                        .disabled(!canSubmit)
                        .accessibilityIdentifier("native-driver-sign-in")
                    }
                    .padding(20)
                    .background(cardBackground)
                    .cornerRadius(28)
                    .overlay(
                        RoundedRectangle(cornerRadius: 28)
                            .stroke(Color.white.opacity(0.12), lineWidth: 1)
                    )
                    .shadow(color: Color.black.opacity(0.28), radius: 24, x: 0, y: 18)

                    Text("Need driver access? Ask your dispatcher or account admin to add you. By signing in, you agree to the Trashed Terms and Privacy Policy.")
                        .font(.system(size: 12))
                        .foregroundColor(.white.opacity(0.48))
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
            .fill(Color.white.opacity(0.08))
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(Color.white.opacity(0.14), lineWidth: 1)
            )
    }

    private var cardBackground: some View {
        LinearGradient(
            gradient: Gradient(colors: [Color.white.opacity(0.16), Color.white.opacity(0.08)]),
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    private func submit() {
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedEmail.isEmpty && !password.isEmpty else { return }

        errorMessage = nil
        isSubmitting = true
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)

        signIn(normalizedEmail, password) { message in
            isSubmitting = false
            errorMessage = message
        }
    }
}
