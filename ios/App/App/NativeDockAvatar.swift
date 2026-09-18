import SwiftUI
import UIKit
import ImageIO
import WebKit

// Only bundled, bounded raster frames are shared. Account pixels are never cached globally.
enum NativeDockBrand {
    struct Frame { let image: UIImage; let duration: TimeInterval }
    static let frames: [Frame] = {
        guard let url = Bundle.main.url(forResource: "trisha-waving", withExtension: "gif", subdirectory: "Brand"),
              let data = try? Data(contentsOf: url), data.count <= 2 * 1024 * 1024,
              let source = CGImageSourceCreateWithData(data as CFData, nil) else { return [] }
        let count = CGImageSourceGetCount(source)
        guard count > 0, count <= 100 else { return [] }
        return (0..<count).compactMap { index in
            guard let properties = CGImageSourceCopyPropertiesAtIndex(source, index, nil) as? [CFString: Any],
                  let width = properties[kCGImagePropertyPixelWidth] as? Int,
                  let height = properties[kCGImagePropertyPixelHeight] as? Int,
                  width > 0, height > 0, width <= 128, height <= 128,
                  let cg = CGImageSourceCreateImageAtIndex(source, index, nil) else { return nil }
            let gif = properties[kCGImagePropertyGIFDictionary] as? [CFString: Any]
            let delay = (gif?[kCGImagePropertyGIFUnclampedDelayTime] as? Double) ?? (gif?[kCGImagePropertyGIFDelayTime] as? Double) ?? 0.15
            return Frame(image: circular(UIImage(cgImage: cg)), duration: max(0.04, min(delay, 1)))
        }
    }()
    static var still: UIImage? {
        Bundle.main.url(forResource: "trisha-waving-still", withExtension: "png", subdirectory: "Brand").flatMap { UIImage(contentsOfFile: $0.path) }.map { circular($0) } ?? frames.first?.image
    }
    static func circular(_ image: UIImage, size: CGFloat = 28) -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: size, height: size)).image { _ in
            UIBezierPath(ovalIn: CGRect(x: 0, y: 0, width: size, height: size)).addClip()
            let scale = max(size / image.size.width, size / image.size.height)
            let width = image.size.width * scale, height = image.size.height * scale
            image.draw(in: CGRect(x: (size - width) / 2, y: (size - height) / 2, width: width, height: height))
        }.withRenderingMode(.alwaysOriginal)
    }
    static func initials(_ name: String?) -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: 28, height: 28)).image { _ in
            UIColor.secondarySystemFill.setFill()
            UIBezierPath(ovalIn: CGRect(x: 0, y: 0, width: 28, height: 28)).fill()
            let text = NativeDockAvatarPolicy.initials(name) as NSString
            let attributes: [NSAttributedString.Key: Any] = [.font: UIFont.systemFont(ofSize: 11, weight: .semibold), .foregroundColor: UIColor.label]
            let size = text.size(withAttributes: attributes)
            text.draw(at: CGPoint(x: (28 - size.width) / 2, y: (28 - size.height) / 2), withAttributes: attributes)
        }.withRenderingMode(.alwaysOriginal)
    }
}

// Replaces the actual item raster every frame; UITabBar freezes animated UIImages.
final class NativeDockAnimator {
    private var timer: Timer?
    private var index = 0
    var render: ((UIImage?) -> Void)?
    var shouldAnimate: (() -> Bool)?
    func start() {
        guard timer == nil, shouldAnimate?() != false, UIApplication.shared.applicationState == .active,
              !UIAccessibility.isReduceMotionEnabled, NativeDockBrand.frames.count > 1 else {
            if timer == nil { render?(NativeDockBrand.still) }; return
        }
        schedule()
    }
    private func schedule() {
        let frames = NativeDockBrand.frames
        guard !frames.isEmpty else { return }
        render?(frames[index].image)
        timer = Timer.scheduledTimer(withTimeInterval: frames[index].duration, repeats: false) { [weak self] _ in
            guard let self = self else { return }
            self.timer = nil
            self.index = (self.index + 1) % frames.count
            self.start()
        }
    }
    func stop() { timer?.invalidate(); timer = nil; index = 0; render?(NativeDockBrand.still) }
    deinit { timer?.invalidate() }
}

private final class DockImageRedirectGuard: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

@available(iOS 16.0, *)
enum NativeDockImageLoader {
    static func load(_ url: URL) async throws -> UIImage {
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil; config.httpShouldSetCookies = false
        config.urlCredentialStorage = nil; config.urlCache = nil
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.timeoutIntervalForRequest = 15; config.timeoutIntervalForResource = 25
        let session = URLSession(configuration: config, delegate: DockImageRedirectGuard(), delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        var request = URLRequest(url: url)
        request.httpShouldHandleCookies = false
        let (bytes, response) = try await session.bytes(for: request)
        let limit = 2 * 1024 * 1024
        guard let http = response as? HTTPURLResponse, http.statusCode == 200,
              response.url == url, response.expectedContentLength <= limit,
              response.mimeType?.hasPrefix("image/") == true else { throw URLError(.badServerResponse) }
        var data = Data()
        for try await byte in bytes {
            try Task.checkCancellation()
            guard data.count < limit else { throw URLError(.dataLengthExceedsMaximum) }
            data.append(byte)
        }
        guard let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? Double,
              let height = properties[kCGImagePropertyPixelHeight] as? Double,
              width > 0, height > 0, width * height <= 16_000_000,
              let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceThumbnailMaxPixelSize: 128, kCGImageSourceCreateThumbnailWithTransform: true] as CFDictionary)
        else { throw URLError(.cannotDecodeContentData) }
        try Task.checkCancellation()
        return UIImage(cgImage: cg)
    }
}

@available(iOS 16.0, *)
@MainActor
final class NativeDockAccountLease {
    private var key: String?
    private var generation = UUID()
    private var api: WorkspaceAPI?
    private var task: Task<Void, Never>?
    private(set) var image: UIImage?
    var changed: (() -> Void)?
    func clear() {
        generation = UUID(); task?.cancel(); task = nil
        api?.close(); api = nil; key = nil; image = nil
    }
    func update(context: String, document: URL, origin: URL, cookies: WKHTTPCookieStore) {
        let next = context + "|" + document.absoluteString + "|" + origin.absoluteString
        guard next != key else { return }
        clear(); key = next; changed?()
        let generation = self.generation
        let api = WorkspaceAPI(origin: origin, cookieStore: cookies)
        self.api = api
        api.onSessionChange = { [weak self] in
            self?.clear(); self?.changed?()
        }
        task = Task { [weak self] in
            do {
                let profile = try await api.profile()
                guard let self = self, self.generation == generation, !Task.isCancelled else { return }
                self.image = NativeDockBrand.initials(profile.user.name); self.changed?()
                guard let url = NativeDockAvatarPolicy.imageURL(profile.user.image, origin: origin) else { return }
                let image = try await NativeDockImageLoader.load(url)
                guard self.generation == generation, !Task.isCancelled else { return }
                self.image = NativeDockBrand.circular(image); self.changed?()
            } catch { /* Missing/failed image retains the authenticated initials. */ }
        }
    }
}

@available(iOS 16.0, *)
struct NativeDockAccountView: View {
    let name: String?
    let rawImage: String?
    let origin: URL
    let identity: String
    let enabled: Bool
    @State private var image: UIImage?
    @State private var loadedKey: String?
    // This view lives in a UIKit-created UIHostingController, not a SwiftUI
    // App Scene. Its environment scenePhase can remain inactive indefinitely.
    @State private var active = false
    private var key: String { identity + "|" + (rawImage ?? "") + "|" + (name ?? "") + "|" + String(enabled && active) }
    var body: some View {
        Image(uiImage: loadedKey == key && enabled && active ? (image ?? NativeDockBrand.initials(name)) : NativeDockBrand.initials(enabled ? name : nil))
            .renderingMode(.original).resizable().frame(width: 28, height: 28)
            .accessibilityHidden(true)
            .onAppear { active = UIApplication.shared.applicationState == .active }
            .onDisappear { active = false; image = nil; loadedKey = nil }
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)) { _ in active = true }
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.willResignActiveNotification)) { _ in
                active = false; image = nil; loadedKey = nil
            }
            .task(id: key) {
                image = nil; loadedKey = nil
                let requestKey = key
                guard enabled, active, let url = NativeDockAvatarPolicy.imageURL(rawImage, origin: origin) else { return }
                guard let result = try? await NativeDockImageLoader.load(url), !Task.isCancelled else { return }
                image = NativeDockBrand.circular(result); loadedKey = requestKey
            }
    }
}

private final class NativeTrishaImageView: UIImageView {
    let animator = NativeDockAnimator()
    var enabled = true { didSet { updateAnimation() } }
    private var observers: [NSObjectProtocol] = []
    init() {
        super.init(frame: .zero)
        contentMode = .scaleAspectFit; isAccessibilityElement = false
        animator.render = { [weak self] in self?.image = $0 }
        animator.shouldAnimate = { [weak self] in self?.window != nil && self?.enabled == true && self?.isHidden == false }
        for name in [UIApplication.didBecomeActiveNotification, UIApplication.willResignActiveNotification, UIAccessibility.reduceMotionStatusDidChangeNotification] {
            observers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] notification in
                if notification.name == UIApplication.willResignActiveNotification { self?.animator.stop() }
                else { self?.updateAnimation() }
            })
        }
        image = NativeDockBrand.still
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }
    override func didMoveToWindow() { super.didMoveToWindow(); updateAnimation() }
    func updateAnimation() {
        if window != nil && enabled && !isHidden && !UIAccessibility.isReduceMotionEnabled { animator.start() }
        else { animator.stop() }
    }
    deinit { observers.forEach(NotificationCenter.default.removeObserver) }
}

struct NativeTrishaDockView: UIViewRepresentable {
    let enabled: Bool
    func makeUIView(context: Context) -> UIImageView { NativeTrishaImageView() }
    func updateUIView(_ uiView: UIImageView, context: Context) { (uiView as? NativeTrishaImageView)?.enabled = enabled }
    static func dismantleUIView(_ uiView: UIImageView, coordinator: ()) { (uiView as? NativeTrishaImageView)?.animator.stop() }
}
