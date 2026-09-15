import Foundation
import CoreFoundation
import WebKit
import UIKit
import Capacitor

enum TextExportPolicy {
    static let maxBytes = 5 * 1024 * 1024

    static func validationError(filename: String?, content: String?) -> String? {
        guard let filename = filename, filename.utf8.count <= 120, !filename.contains(".."),
              filename.range(of: "^[A-Za-z0-9][A-Za-z0-9 ._-]*\\.txt\\z", options: .regularExpression) != nil else {
            return "INVALID_FILENAME"
        }
        guard let content = content else { return "INVALID_CONTENT" }
        return content.utf8.count > maxBytes ? "TOO_LARGE" : nil
    }

    static func isTrustedOrigin(_ current: URL?, _ configured: URL?) -> Bool {
        guard let current = current, let configured = configured, let host = configured.host,
              let scheme = configured.scheme, ["http", "https"].contains(scheme) else { return false }
        return current.scheme == scheme && current.host?.lowercased() == host.lowercased()
            && current.user == nil && configured.user == nil
            && (current.port ?? (scheme == "https" ? 443 : 80)) == (configured.port ?? (scheme == "https" ? 443 : 80))
    }
}

enum ByteExportPolicy {
    static let maxChunk = 64 * 1024
    static let maxBytes = 256 * 1024 * 1024

    static func integer(_ value: Any?) -> Int? {
        guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() else { return nil }
        let value = number.doubleValue
        guard value.isFinite, value >= 0, value <= Double(maxBytes), value.rounded(.towardZero) == value else { return nil }
        return Int(value)
    }

    static func metadataError(filename: String?, mimeType: String?) -> String? {
        let ext: String
        switch mimeType { case "audio/mpeg": ext = "mp3"; case "audio/wav": ext = "wav"; default: return "INVALID_MIME" }
        guard let filename = filename, filename.utf8.count <= 120, !filename.contains(".."),
              filename.range(of: "^[A-Za-z0-9][A-Za-z0-9 ._-]*\\." + ext + "\\z", options: .regularExpression) != nil else { return "INVALID_FILENAME" }
        return nil
    }

    static func decode(_ value: String?) -> Data? {
        guard let value = value, !value.isEmpty, value.utf8.count <= ((maxChunk + 2) / 3) * 4,
              let bytes = Data(base64Encoded: value), !bytes.isEmpty, bytes.count <= maxChunk,
              bytes.base64EncodedString() == value else { return nil }
        return bytes
    }
}

private final class ByteExportSpool {
    let id = UUID().uuidString
    let directory: URL
    let file: URL
    let expectedBytes: Int?
    var offset = 0
    private var output: FileHandle?

    init(root: URL, filename: String, expectedBytes: Int?) throws {
        self.expectedBytes = expectedBytes
        directory = root.appendingPathComponent(id, isDirectory: true)
        file = directory.appendingPathComponent(filename)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        do {
            try Data().write(to: file, options: [.atomic, .completeFileProtection])
            output = try FileHandle(forWritingTo: file)
        } catch { try? FileManager.default.removeItem(at: directory); throw error }
    }

    func append(offset at: Int, bytes: Data) throws {
        guard let output = output, at == offset else { throw SinkError.invalidOffset }
        guard !bytes.isEmpty, bytes.count <= ByteExportPolicy.maxChunk else { throw SinkError.invalidChunk }
        guard offset + bytes.count <= ByteExportPolicy.maxBytes,
              expectedBytes == nil || offset + bytes.count <= expectedBytes! else { throw SinkError.tooLarge }
        try output.write(contentsOf: bytes)
        offset += bytes.count
    }

    func seal() throws {
        guard output != nil, offset > 0, expectedBytes == nil || offset == expectedBytes! else { throw SinkError.incomplete }
        try output?.close()
        output = nil
    }

    func cleanup() {
        try? output?.close()
        output = nil
        try? FileManager.default.removeItem(at: directory)
    }

    deinit { cleanup() }
    enum SinkError: String, Error { case invalidOffset = "INVALID_OFFSET", invalidChunk = "INVALID_CHUNK", tooLarge = "TOO_LARGE", incomplete = "INCOMPLETE" }
}

@objc(TrashedFileExportPlugin)
public class TrashedFileExportPlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate, UIAdaptivePresentationControllerDelegate {
    public let identifier = "TrashedFileExportPlugin"
    public let jsName = "TrashedFileExport"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "saveText", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "begin", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finish", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
    ]
    private var pendingCall: CAPPluginCall?
    private var spool: ByteExportSpool?
    private var byteSourceURL: URL?
    private var idleTimeout: DispatchWorkItem?
    private weak var activePicker: UIDocumentPickerViewController?
    private var exportDirectory: URL?
    private let exportRoot = FileManager.default.temporaryDirectory.appendingPathComponent("TrashedTextExports", isDirectory: true)

    override public func load() {
        // Only our private export subtree, never a caller-supplied path or other app files.
        try? FileManager.default.removeItem(at: exportRoot)
    }

    @objc func saveText(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard TextExportPolicy.isTrustedOrigin(self.webView?.url, self.bridge?.config.serverURL) else {
                call.reject("Open the Trashed app before exporting.", "UNTRUSTED_ORIGIN")
                return
            }
            guard let presenter = self.bridge?.viewController, presenter.viewIfLoaded?.window != nil,
                  UIApplication.shared.applicationState == .active else {
                call.reject("The file picker cannot be opened right now.", "UNAVAILABLE")
                return
            }
            guard self.pendingCall == nil, self.spool == nil, presenter.presentedViewController == nil else {
                call.reject("Finish the current file export first.", "BUSY")
                return
            }
            let filename = call.getString("filename"), content = call.getString("content")
            let error = TextExportPolicy.validationError(filename: filename, content: content)
            guard error == nil, Set(call.jsObjectRepresentation.keys) == Set(["filename", "content"]),
                  let filename = filename, let content = content else {
                call.reject("Use a valid .txt filename and text up to 5 MiB.", error ?? "INVALID_OPTIONS")
                return
            }
            self.pendingCall = call
            let directory = self.exportRoot.appendingPathComponent(UUID().uuidString, isDirectory: true)
            self.exportDirectory = directory
            do {
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                let file = directory.appendingPathComponent(filename)
                try Data(content.utf8).write(to: file, options: [.atomic, .completeFileProtection])
                let picker = UIDocumentPickerViewController(forExporting: [file], asCopy: true)
                self.activePicker = picker
                picker.delegate = self
                presenter.present(picker, animated: true)
                picker.presentationController?.delegate = self
            } catch {
                self.finish(status: nil, error: "The file could not be prepared. Please try again.")
            }
        }
    }

    @objc func begin(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.authorized(call) else { return }
            guard self.spool == nil, self.pendingCall == nil else { call.reject("Finish the current export first.", "BUSY"); return }
            let options = call.jsObjectRepresentation
            let allowed = Set(["filename", "mimeType", "expectedBytes"])
            let keys = Set(options.keys)
            let expected = ByteExportPolicy.integer(options["expectedBytes"])
            guard keys.isSubset(of: allowed), keys.isSuperset(of: ["filename", "mimeType"]),
                  !keys.contains("expectedBytes") || (expected != nil && expected! > 0) else {
                call.reject("Invalid export options.", "INVALID_OPTIONS"); return
            }
            if let error = ByteExportPolicy.metadataError(filename: call.getString("filename"), mimeType: call.getString("mimeType")) {
                call.reject("Use a valid MP3 or WAV filename and media type.", error); return
            }
            do {
                let spool = try ByteExportSpool(root: self.exportRoot, filename: call.getString("filename")!, expectedBytes: expected)
                self.spool = spool
                self.byteSourceURL = self.webView?.url
                self.touchSpool()
                call.resolve(["exportId": spool.id])
            } catch { call.reject("The export could not be prepared.", "SAVE_FAILED") }
        }
    }

    @objc func write(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.authorized(call) else { return }
            guard let spool = self.spool, call.getString("exportId") == spool.id else { call.reject("Export is no longer active.", "INVALID_EXPORT"); return }
            guard self.pendingCall == nil else { call.reject("The file picker is already open.", "BUSY"); return }
            guard Set(call.jsObjectRepresentation.keys) == Set(["exportId", "offset", "base64"]),
                  let offset = ByteExportPolicy.integer(call.jsObjectRepresentation["offset"]),
                  let bytes = ByteExportPolicy.decode(call.getString("base64")) else {
                self.clearSpool(); call.reject("Invalid export chunk.", "INVALID_CHUNK"); return
            }
            do {
                try spool.append(offset: offset, bytes: bytes)
                self.touchSpool()
                call.resolve(["offset": spool.offset])
            } catch {
                self.clearSpool()
                call.reject("The export chunk could not be saved.", (error as? ByteExportSpool.SinkError)?.rawValue ?? "SAVE_FAILED")
            }
        }
    }

    @objc func finish(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.authorized(call) else { return }
            guard Set(call.jsObjectRepresentation.keys) == Set(["exportId"]), let spool = self.spool,
                  call.getString("exportId") == spool.id else { call.reject("Export is no longer active.", "INVALID_EXPORT"); return }
            guard self.pendingCall == nil else { call.reject("The file picker is already open.", "BUSY"); return }
            guard let presenter = self.bridge?.viewController, presenter.viewIfLoaded?.window != nil,
                  UIApplication.shared.applicationState == .active, presenter.presentedViewController == nil else {
                self.clearSpool(); call.reject("The file picker cannot be opened right now.", "UNAVAILABLE"); return
            }
            do { try spool.seal() }
            catch {
                self.clearSpool()
                call.reject("The export is incomplete or could not be saved.", (error as? ByteExportSpool.SinkError)?.rawValue ?? "SAVE_FAILED"); return
            }
            self.idleTimeout?.cancel()
            self.pendingCall = call
            let picker = UIDocumentPickerViewController(forExporting: [spool.file], asCopy: true)
            self.activePicker = picker
            picker.delegate = self
            presenter.present(picker, animated: true)
            picker.presentationController?.delegate = self
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.authorized(call) else { return }
            guard Set(call.jsObjectRepresentation.keys) == Set(["exportId"]), let id = call.getString("exportId") else {
                call.reject("Invalid export options.", "INVALID_OPTIONS"); return
            }
            guard self.spool?.id == id else { call.resolve(); return }
            self.cancelSpool { call.resolve() }
        }
    }

    private func authorized(_ call: CAPPluginCall) -> Bool {
        guard TextExportPolicy.isTrustedOrigin(webView?.url, bridge?.config.serverURL) else {
            call.reject("Open the Trashed app before exporting.", "UNTRUSTED_ORIGIN"); return false
        }
        if spool != nil && byteSourceURL != webView?.url { cancelSpool() }
        return true
    }

    private func touchSpool() {
        idleTimeout?.cancel()
        let id = spool?.id
        let timeout = DispatchWorkItem { [weak self] in
            guard let self = self, self.spool?.id == id, self.pendingCall == nil else { return }
            self.clearSpool()
        }
        idleTimeout = timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + 60, execute: timeout)
    }

    private func clearSpool() {
        idleTimeout?.cancel()
        idleTimeout = nil
        spool?.cleanup()
        spool = nil
        byteSourceURL = nil
    }

    private func cancelSpool(completion: @escaping () -> Void = {}) {
        guard spool != nil else { completion(); return }
        let id = spool?.id
        if let picker = activePicker {
            // Keep the operation locked until this picker has actually disappeared.
            picker.dismiss(animated: true) { [weak self] in
                if self?.spool?.id == id && self?.activePicker === picker {
                    self?.finish(status: "cancelled", error: nil)
                }
                completion()
            }
        } else { clearSpool(); completion() }
    }

    override public func shouldOverrideLoad(_ navigationAction: WKNavigationAction) -> NSNumber? {
        if navigationAction.targetFrame?.isMainFrame == true { cancelSpool() }
        return nil // Preserve Capacitor's navigation policy.
    }

    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard controller === activePicker else { return }
        finish(status: urls.isEmpty ? "cancelled" : "saved", error: nil)
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        guard controller === activePicker else { return }
        finish(status: "cancelled", error: nil)
    }

    public func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        guard presentationController.presentedViewController === activePicker else { return }
        finish(status: "cancelled", error: nil)
    }

    private func finish(status: String?, error: String?) {
        guard let call = pendingCall else { return }
        pendingCall = nil
        activePicker = nil
        if let directory = exportDirectory { try? FileManager.default.removeItem(at: directory) }
        exportDirectory = nil
        clearSpool()
        if let error = error { call.reject(error, "SAVE_FAILED") }
        else { call.resolve(["status": status ?? "cancelled"]) }
    }
}
