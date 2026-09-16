import SwiftUI
import ImageIO

/// Memory-only, cookie-free image transport; bounded bytes and decoded pixels.
/// Redirects are deliberately rejected instead of turning an allowed src into an arbitrary request.
final class NativeChatImageLoader: NSObject, ObservableObject, URLSessionDataDelegate {
    @Published private(set) var image: UIImage?
    @Published private(set) var failed = false
    private var session: URLSession?
    private var task: URLSessionDataTask?
    private var bytes = Data()
    private var generation = UUID()
    private static let maximumBytes = 2 * 1_048_576

    func load(_ url: URL, configured: URL) {
        cancel()
        guard NativeChatPolicy.safeImageURL(url.absoluteString, configured: configured) != nil else { failed = true; return }
        let config = URLSessionConfiguration.ephemeral
        config.httpShouldSetCookies = false; config.httpCookieStorage = nil
        config.urlCredentialStorage = nil; config.urlCache = nil
        config.timeoutIntervalForRequest = 15; config.timeoutIntervalForResource = 25
        config.httpMaximumConnectionsPerHost = 4
        let session = URLSession(configuration: config, delegate: self, delegateQueue: .main)
        self.session = session
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)
        request.httpShouldHandleCookies = false
        task = session.dataTask(with: request); task?.resume()
    }
    func cancel() {
        task?.cancel(); task = nil; session?.invalidateAndCancel(); session = nil
        generation = UUID(); bytes = Data(); image = nil; failed = false
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didReceive challenge: URLAuthenticationChallenge, completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        if challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust { completionHandler(.performDefaultHandling, nil) }
        else { completionHandler(.cancelAuthenticationChallenge, nil) }
    }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard dataTask === task, let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
              response.mimeType?.hasPrefix("image/") == true, response.expectedContentLength <= Self.maximumBytes else { completionHandler(.cancel); return }
        completionHandler(.allow)
    }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard dataTask === task else { return }
        guard bytes.count + data.count <= Self.maximumBytes else { failed = true; dataTask.cancel(); return }
        bytes.append(data)
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard task === self.task else { return }
        defer { session.finishTasksAndInvalidate(); self.session = nil; self.task = nil; bytes = Data() }
        guard error == nil, let source = CGImageSourceCreateWithData(bytes as CFData, nil),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? Int, let height = properties[kCGImagePropertyPixelHeight] as? Int,
              width > 0, height > 0, width <= 16000, height <= 16000, width * height <= 16_000_000,
              let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceThumbnailMaxPixelSize: 1200, kCGImageSourceCreateThumbnailWithTransform: true] as CFDictionary) else { failed = true; return }
        image = UIImage(cgImage: cg)
    }
}
struct NativeComponentImage: View {
    let url: URL
    let label: String
    let configured: URL
    @StateObject private var loader = NativeChatImageLoader()
    var body: some View {
        Group {
            if let image = loader.image { Image(uiImage: image).resizable().scaledToFit().frame(maxHeight: 240) }
            else if loader.failed { Label(label + " (image unavailable)", systemImage: "photo").font(.caption) }
            else { ProgressView().frame(height: 80) }
        }
        .accessibilityLabel(label)
        .onAppear { loader.load(url, configured: configured) }
        .onChange(of: url) { loader.load($0, configured: configured) }
        .onDisappear { loader.cancel() }
    }
}
