import UIKit
import UniformTypeIdentifiers
import Speech
import AVFoundation

/// System input UI only. No network/auth/upload logic; selected bytes go to the existing web controller.
final class NativeChatInputController: NSObject, UIDocumentPickerDelegate {
    typealias Completion = ([String: Any]?, String?) -> Void
    private var completion: Completion?
    private var current: (() -> Bool)?
    private weak var presented: UIViewController?
    private var engine: AVAudioEngine?
    private var installedAudioTap = false
    private var activatedAudioSession = false
    private var recognition: SFSpeechRecognitionTask?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var transcript = ""
    private var timeout: DispatchWorkItem?
    private var backgroundObserver: NSObjectProtocol?
    private var generation = UUID()
    var busy: Bool { completion != nil }

    func pickFiles(from host: UIViewController, current: @escaping () -> Bool, completion: @escaping Completion) {
        guard !busy, current(), host.presentedViewController == nil else { completion(nil, "Finish the current input first."); return }
        self.completion = completion; self.current = current
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.data], asCopy: true)
        observeBackground()
        picker.allowsMultipleSelection = true; picker.delegate = self; presented = picker
        host.present(picker, animated: true)
    }
    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        guard presented === controller else { return }
        finish(["cancelled": true], nil)
    }
    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard presented === controller, busy else { return }
        guard current?() == true else { cancel(); return }
        guard !urls.isEmpty, urls.count <= 8 else { finish(nil, "Select up to eight files at a time."); return }
        let token = generation
        DispatchQueue.global(qos: .userInitiated).async {
            var files: [[String: Any]] = [], total = 0
            do {
                for url in urls {
                    let access = url.startAccessingSecurityScopedResource(); defer { if access { url.stopAccessingSecurityScopedResource() } }
                    let metadata = try url.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
                    guard metadata.isRegularFile == true, let size = metadata.fileSize, size <= 12 * 1_048_576 else { throw InputError.invalidFile }
                    total += size; guard total <= 24 * 1_048_576 else { throw InputError.tooLarge }
                    let name = url.lastPathComponent
                    guard name.utf16.count <= 255, !name.contains("\\"), !name.unicodeScalars.contains(where: { $0.value < 32 }),
                          ["csv", "txt", "json", "pdf", "docx", "png", "jpg", "jpeg", "webp"].contains(url.pathExtension.lowercased()) else { throw InputError.invalidFile }
                    // Bound reads even if a provider changes size after the metadata check.
                    let handle = try FileHandle(forReadingFrom: url); defer { try? handle.close() }
                    let data = try handle.read(upToCount: 12 * 1_048_576 + 1) ?? Data()
                    guard data.count <= 12 * 1_048_576, data.count == size else { throw InputError.invalidFile }
                    files.append(["name": name, "type": UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream", "base64": data.base64EncodedString()])
                }
                DispatchQueue.main.async { if self.generation == token { self.finish(["files": files], nil) } }
            } catch {
                DispatchQueue.main.async { if self.generation == token { self.finish(nil, "Choose supported files up to 12 MiB each and 24 MiB total.") } }
            }
        }
    }
    func dictate(from host: UIViewController, current: @escaping () -> Bool, completion: @escaping Completion) {
        guard !busy, current(), host.presentedViewController == nil else { completion(nil, "Finish the current input first."); return }
        self.completion = completion; self.current = current
        observeBackground()
        let token = generation
        SFSpeechRecognizer.requestAuthorization { authorization in
            DispatchQueue.main.async {
                guard self.continueInput(token) else { return }
                guard authorization == .authorized else { self.finish(nil, "Allow microphone and speech recognition in Settings to dictate."); return }
                AVAudioSession.sharedInstance().requestRecordPermission { microphone in
                    DispatchQueue.main.async {
                        guard self.continueInput(token) else { return }
                        guard microphone else { self.finish(nil, "Allow microphone and speech recognition in Settings to dictate."); return }
                        self.beginSpeech(host: host)
                    }
                }
            }
        }
    }
    private func continueInput(_ token: UUID) -> Bool {
        guard token == generation, busy else { return false }
        guard current?() == true else { cancel(); return false }
        return true
    }
    private func observeBackground() {
        backgroundObserver = NotificationCenter.default.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in self?.cancel() }
    }
    private func beginSpeech(host: UIViewController) {
        guard host.presentedViewController == nil else { finish(nil, "Finish the current input first."); return }
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US")), recognizer.isAvailable else { finish(nil, "Speech recognition is unavailable on this device."); return }
        let alert = UIAlertController(title: "Dictate to Trisha", message: "Listening… Your transcript will be added to the draft, not sent.", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in self.finish(["cancelled": true], nil) })
        alert.addAction(UIAlertAction(title: "Use transcript", style: .default) { _ in self.finish(["text": self.transcript], nil) })
        presented = alert; host.present(alert, animated: true)
        do {
            let audio = AVAudioSession.sharedInstance(); try audio.setCategory(.record, mode: .measurement, options: .duckOthers); try audio.setActive(true)
            activatedAudioSession = true
            let engine = AVAudioEngine(), request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            self.engine = engine; self.request = request
            let input = engine.inputNode, format = engine.inputNode.outputFormat(forBus: 0)
            guard format.sampleRate > 0, format.channelCount > 0 else { finish(nil, "No microphone is available."); return }
            input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in request.append(buffer) }
            installedAudioTap = true
            let token = generation
            recognition = recognizer.recognitionTask(with: request) { result, error in
                DispatchQueue.main.async {
                    guard self.continueInput(token) else { return }
                    if let result = result {
                        let text = result.bestTranscription.formattedString
                        guard NativeChatPolicy.text(text, max: 4000, empty: true) != nil else { self.finish(nil, "The dictated text is too long. Please record a shorter message."); return }
                        self.transcript = text; alert.message = text.isEmpty ? "Listening…" : text
                        if result.isFinal { self.finish(["text": text], nil) }
                    } else if error != nil { self.finish(nil, "Speech recognition stopped. Please try again.") }
                }
            }
            engine.prepare(); try engine.start()

            let timeout = DispatchWorkItem { [weak self] in self?.finish(nil, "Dictation timed out. Please try a shorter recording.") }
            self.timeout = timeout; DispatchQueue.main.asyncAfter(deadline: .now() + 60, execute: timeout)
        } catch { finish(nil, "The microphone could not be started.") }
    }
    func cancel() { if busy { finish(["cancelled": true], nil) } }
    private func finish(_ result: [String: Any]?, _ error: String?) {
        guard busy else { return }
        let callback = completion, valid = current?() == true
        completion = nil; current = nil; generation = UUID()
        timeout?.cancel(); timeout = nil
        if let observer = backgroundObserver { NotificationCenter.default.removeObserver(observer) }; backgroundObserver = nil
        if let engine = engine { engine.stop(); if installedAudioTap { engine.inputNode.removeTap(onBus: 0) } }
        installedAudioTap = false
        request?.endAudio(); recognition?.cancel(); recognition = nil; request = nil
        if activatedAudioSession { try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation) }
        activatedAudioSession = false
        engine = nil; transcript = ""
        presented?.dismiss(animated: true); presented = nil
        callback?(valid ? result : ["cancelled": true], valid ? error : nil)
    }
    private enum InputError: Error { case invalidFile, tooLarge }
}
