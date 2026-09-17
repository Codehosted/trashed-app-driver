import SwiftUI
import AVFoundation

@available(iOS 16.0, *)
@MainActor
final class WorkspaceAudio: ObservableObject {
    @Published private(set) var call: WorkspaceCall?
    @Published private(set) var playing = false
    @Published private(set) var loading = false
    @Published private(set) var elapsed: Double = 0
    @Published private(set) var duration: Double = 0
    @Published private(set) var error: String?
    private var player: AVPlayer?
    private var file: URL?
    private var observer: Any?
    private var status: NSKeyValueObservation?
    private var timeStatus: NSKeyValueObservation?
    private var finished: NSObjectProtocol?
    private var interrupted: NSObjectProtocol?
    private var request: Task<Void, Never>?
    private var revision = UUID()

    func toggle(_ call: WorkspaceCall, api: any WorkspaceServing, scope: String, failure: @escaping (Error) -> Void) {
        if self.call?.id == call.id, let player = player {
            if playing { player.pause() }
            else { if duration > 0 && elapsed >= duration - 0.2 { seek(0) }; player.play() }
            return
        }
        stop()
        self.call = call; loading = true
        let revision = self.revision
        request = Task { [weak self] in
            guard let self = self else { return }
            do {
                let (data, ext) = try await api.recording(call, scope: scope)
                try Task.checkCancellation()
                guard self.revision == revision else { return }
                let file = FileManager.default.temporaryDirectory.appendingPathComponent("native-workspace-\(UUID().uuidString).\(ext)")
                try data.write(to: file, options: [.atomic, .completeFileProtection])
                self.file = file
                try AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
                try AVAudioSession.sharedInstance().setActive(true)
                let item = AVPlayerItem(url: file)
                let player = AVPlayer(playerItem: item)
                self.player = player
                self.status = item.observe(\.status, options: [.initial, .new]) { [weak self] item, _ in
                    Task { @MainActor in
                        guard let self = self, self.revision == revision else { return }
                        switch item.status {
                        case .readyToPlay:
                            let seconds = item.duration.seconds
                            self.duration = seconds.isFinite ? max(0, seconds) : 0
                            self.loading = false
                        case .failed:
                            self.loading = false; self.playing = false
                            self.error = "The recording could not be played. Try again."
                            self.player?.pause()
                            if let observer = self.observer { self.player?.removeTimeObserver(observer) }
                            self.observer = nil; self.player = nil
                        default: break
                        }
                    }
                }
                self.timeStatus = player.observe(\.timeControlStatus, options: [.initial, .new]) { [weak self] player, _ in
                    Task { @MainActor in
                        guard self?.revision == revision else { return }
                        self?.playing = player.timeControlStatus == .playing
                        self?.loading = player.timeControlStatus == .waitingToPlayAtSpecifiedRate
                    }
                }
                self.observer = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.25, preferredTimescale: 600), queue: .main) { [weak self] time in
                    Task { @MainActor in
                        guard self?.revision == revision, time.seconds.isFinite else { return }
                        self?.elapsed = max(0, time.seconds)
                    }
                }
                self.finished = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
                    Task { @MainActor in if self?.revision == revision { self?.playing = false } }
                }
                self.interrupted = NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] _ in
                    Task { @MainActor in if self?.revision == revision { self?.player?.pause() } }
                }
                player.play()
            } catch {
                guard !Task.isCancelled, self.revision == revision else { return }
                self.loading = false; self.error = error.localizedDescription
                failure(error)
            }
        }
    }

    func seek(_ seconds: Double) {
        guard seconds.isFinite else { return }
        player?.seek(to: CMTime(seconds: min(max(0, seconds), duration), preferredTimescale: 600))
    }

    func stop() {
        revision = UUID(); request?.cancel(); request = nil
        player?.pause()
        if let observer = observer { player?.removeTimeObserver(observer) }
        observer = nil; status = nil; timeStatus = nil
        if let finished = finished { NotificationCenter.default.removeObserver(finished) }
        if let interrupted = interrupted { NotificationCenter.default.removeObserver(interrupted) }
        finished = nil; interrupted = nil; player = nil
        if let file = file { try? FileManager.default.removeItem(at: file) }
        file = nil; call = nil; playing = false; loading = false; error = nil; elapsed = 0; duration = 0
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}

@available(iOS 16.0, *)
@MainActor
final class WorkspaceModel: ObservableObject {
    private(set) var api: any WorkspaceServing
    let audio = WorkspaceAudio() // A single player owned above every collapsible row.
    @Published private(set) var profile: WorkspaceProfile?
    @Published private(set) var dashboard: WorkspaceDashboard?
    @Published private(set) var rentals: WorkspaceRentalsMap?
    @Published private(set) var rentalsLoading = false
    @Published private(set) var rentalsError: String?
    private var rentalsID = UUID()
    private var rentalsActive = false
    @Published private(set) var loading = false
    @Published private(set) var saving = false
    @Published private(set) var error: String?
    @Published private(set) var pageError: String?
    @Published private(set) var pagination = WorkspacePagination()
    @Published private(set) var paging = false
    @Published private(set) var invalidated = false
    @Published private(set) var suspended = false
    private var loadID = UUID()
    private var closed = false
    private var lifecycleID = UUID()
    private var profileID = UUID()
    private var saveID = UUID()
    private var dashboardIdentity: WorkspaceDashboard.Scope?
    private var verifiedProfileScope: String?
    private var sessionRenewal: Task<Void, Never>?
    private var renewalAPI: (any WorkspaceServing)?
    private var renewingSession = false
    var onExpired: (() -> Void)?
    var onReopen: (() -> Void)?
    var onSessionRetired: (() -> Void)?
    var onSessionValidated: (() -> Void)?
    var onEnableNotifications: (() -> Void)?
    @Published var notificationError: String?
    @Published var requestedRoute: WorkspaceRoute?
    var scope: String? { profile?.scope(origin: api.origin) }

    init(api: any WorkspaceServing, profile: WorkspaceProfile? = nil) {
        self.api = api
        self.profile = profile
        verifiedProfileScope = profile?.scope(origin: api.origin)
        observeSession()
    }

    private func observeSession() {
        api.onSessionChange = { [weak self] in self?.sessionCookiesChanged() }
    }

    private func sessionCookiesChanged() {
        guard !closed, !invalidated else { return }
        onSessionRetired?()
        guard !renewingSession, !suspended, let expected = dashboardIdentity,
              let replacement = api.renewedSession() else {
            invalidate(WorkspaceError.scopeChanged); return
        }
        beginSessionRenewal(replacement, expected: expected)
    }

    private func beginSessionRenewal(_ replacement: any WorkspaceServing, expected: WorkspaceDashboard.Scope) {
        // Never leave old private data/actions visible while accepting new credentials.
        clearRentals()
        dashboard = nil; profile = nil; pagination.reset(); audio.stop()
        lifecycleID = UUID(); loadID = UUID(); let lifetime = lifecycleID
        loading = true; paging = false; saving = false; error = nil; renewingSession = true
        api.close()
        renewalAPI = replacement // Quarantined: no profile, call, audio or save can use it.
        replacement.onSessionChange = { [weak self] in self?.invalidate(WorkspaceError.scopeChanged) }
        sessionRenewal = Task { [weak self] in
            guard let self = self else { replacement.close(); return }
            defer { if self.lifecycleID == lifetime { self.renewingSession = false; self.loading = false; self.sessionRenewal = nil } }
            do {
                let result = try await replacement.dashboard()
                try Task.checkCancellation()
                guard self.lifecycleID == lifetime, !self.closed, !self.invalidated, !self.suspended else { return }
                guard result.scope.userId == expected.userId, result.scope.vendorId == expected.vendorId else { throw WorkspaceError.scopeChanged }
                let verified = try result.validated()
                self.api = replacement; self.renewalAPI = nil; self.observeSession()
                self.dashboard = verified
                self.onSessionValidated?()
                self.renewingSession = false
                if self.rentalsActive { await self.loadRentals() }
            } catch {
                guard self.lifecycleID == lifetime, !Task.isCancelled, !self.closed, !self.invalidated, !self.suspended else { return }
                // Even a transient validation failure cannot publish candidate credentials.
                self.invalidate(error)
            }
        }
    }

    func close() {
        onSessionRetired?()
        sessionRenewal?.cancel(); sessionRenewal = nil; renewingSession = false
        renewalAPI?.close(); renewalAPI = nil
        closed = true; lifecycleID = UUID(); loadID = UUID(); audio.stop(); api.close()
        loading = false; paging = false; saving = false
        profile = nil; dashboard = nil; pagination.reset()
        clearRentals(); rentalsActive = false
    }

    func suspend() {
        guard !closed, !invalidated else { return }
        sessionRenewal?.cancel(); sessionRenewal = nil; renewingSession = false
        renewalAPI?.cancelPending()
        suspended = true; lifecycleID = UUID(); saving = false
        clearRentals()
        loadID = UUID(); audio.stop(); api.cancelPending()
        loading = false; paging = false
    }

    func resume() async {
        guard !closed, !invalidated, suspended else { return }
        let id = UUID(); lifecycleID = id
        if let candidate = renewalAPI, let expected = dashboardIdentity {
            suspended = false
            beginSessionRenewal(candidate, expected: expected)
            await sessionRenewal?.value
            return
        }
        if dashboardIdentity != nil {
            // Reauthorize the dashboard with one server-owned snapshot on resume.
            suspended = false
            await loadDashboard()
            if rentalsActive { await loadRentals() }
            return
        }
        do {
            let current = try await api.profile()
            guard lifecycleID == id, !Task.isCancelled, !closed, !invalidated else { return }
            try acceptProfile(current); suspended = false
            if rentalsActive { await loadRentals() }
        } catch {
            guard lifecycleID == id, !Task.isCancelled, !closed, !invalidated else { return }
            invalidate(error)
        }
    }

    func invalidate(_ failure: Error) {
        guard !closed, !invalidated else { return }
        onSessionRetired?()
        sessionRenewal?.cancel(); sessionRenewal = nil; renewingSession = false
        renewalAPI?.close(); renewalAPI = nil
        lifecycleID = UUID(); invalidated = true; profile = nil; dashboard = nil; pagination.reset(); audio.stop()
        clearRentals(); rentalsActive = false
        api.cancelPending()
        loadID = UUID(); loading = false; paging = false; saving = false
        error = failure.localizedDescription
        if case WorkspaceError.expired = failure { onExpired?() }
    }

    func handle(_ failure: Error) {
        switch failure {
        case WorkspaceError.expired, WorkspaceError.scopeChanged, WorkspaceError.forbidden, WorkspaceError.emailChanged: invalidate(failure)
        default: break
        }
    }

    func loadProfile() async {
        guard !closed, !invalidated, !suspended, !renewingSession, renewalAPI == nil else { return }
        let lifetime = lifecycleID, id = UUID(); profileID = id
        loading = true; error = nil
        defer { if lifecycleID == lifetime, profileID == id { loading = false } }
        do {
            let profile = try await api.profile()
            try Task.checkCancellation()
            guard lifecycleID == lifetime, profileID == id, !closed, !invalidated, !suspended else { return }
            try acceptProfile(profile)
        } catch {
            guard lifecycleID == lifetime, profileID == id, !Task.isCancelled, !closed, !invalidated, !suspended else { return }
            self.error = error.localizedDescription; handle(error)
        }
    }

    func save(_ edit: WorkspaceProfileEdit) async -> Bool {
        guard let scope = scope, !saving, !closed, !invalidated, !suspended, !renewingSession, renewalAPI == nil else { return false }
        if let validation = edit.validation { error = validation; return false }
        let lifetime = lifecycleID, id = UUID(); saveID = id
        saving = true; error = nil
        defer { if lifecycleID == lifetime, saveID == id { saving = false } }
        do {
            let verified = try await api.save(edit, scope: scope)
            guard lifecycleID == lifetime, saveID == id, !Task.isCancelled, !closed, !invalidated, !suspended else { return false }
            try acceptProfile(verified)
            return true
        } catch {
            guard lifecycleID == lifetime, saveID == id, !Task.isCancelled, !closed, !invalidated, !suspended else { return false }
            self.error = error.localizedDescription; handle(error); return false
        }
    }

    func loadDashboard() async {
        guard !closed, !invalidated, !suspended, !renewingSession else { return }
        let id = UUID(), lifetime = lifecycleID; loadID = id
        loading = true; error = nil // Keep the last validated snapshot during refresh.
        defer { if lifecycleID == lifetime, loadID == id { loading = false } }
        do {
            let result = try await api.dashboard()
            try Task.checkCancellation()
            guard lifecycleID == lifetime, loadID == id, !closed, !invalidated, !suspended else { return }
            if let previous = dashboardIdentity,
               previous.userId != result.scope.userId || previous.vendorId != result.scope.vendorId { throw WorkspaceError.scopeChanged }
            if let current = profile { _ = try result.validated(for: current) }
            dashboard = try result.validated()
            dashboardIdentity = result.scope
        } catch {
            guard !Task.isCancelled, lifecycleID == lifetime, loadID == id, !closed, !invalidated, !suspended else { return }
            self.error = error.localizedDescription; handle(error)
        }
    }

    private func clearRentals() {
        rentalsID = UUID(); rentals = nil; rentalsError = nil; rentalsLoading = false
    }

    func leaveRentals() {
        rentalsActive = false
        clearRentals()
    }

    func loadRentals() async {
        guard !closed, !invalidated, !suspended, !renewingSession, renewalAPI == nil else { return }
        rentalsActive = true
        let lifetime = lifecycleID, id = UUID(); rentalsID = id
        // Never show old customer/address data when a permission recheck is pending.
        rentals = nil; rentalsLoading = true; rentalsError = nil
        defer { if lifecycleID == lifetime, rentalsID == id { rentalsLoading = false } }
        do {
            let current = try await api.profile()
            try Task.checkCancellation()
            guard lifecycleID == lifetime, rentalsID == id, !closed, !invalidated, !suspended else { return }
            try acceptProfile(current)
            guard WorkspaceRentalsPolicy.allowed(current) else { throw WorkspaceError.forbidden }
            let result = try await api.rentals(scope: current.scope(origin: api.origin))
            try Task.checkCancellation()
            guard lifecycleID == lifetime, rentalsID == id, !closed, !invalidated, !suspended else { return }
            rentals = try result.validated(for: current, origin: api.origin)
        } catch {
            guard lifecycleID == lifetime, rentalsID == id, !Task.isCancelled, !closed, !invalidated, !suspended else { return }
            rentalsError = error.localizedDescription; handle(error)
        }
    }

    func openRentalsWeb(_ path: String, open: (String) -> Void) async {
        guard rentalsActive, !closed, !invalidated, !suspended, !renewingSession, renewalAPI == nil,
              path == "/vendor/rentals" || WorkspaceRentalsPolicy.detailPath(path, origin: api.origin) == path else { return }
        let lifetime = lifecycleID, id = rentalsID
        do {
            let current = try await api.profile()
            try Task.checkCancellation()
            guard lifecycleID == lifetime, rentalsID == id, rentalsActive, !closed, !invalidated, !suspended else { return }
            try acceptProfile(current)
            guard WorkspaceRentalsPolicy.allowed(current) else { throw WorkspaceError.forbidden }
            open(path) // Only this deliberate action can navigate the retained web document.
        } catch {
            guard lifecycleID == lifetime, rentalsID == id, !Task.isCancelled, !closed, !invalidated else { return }
            rentalsError = error.localizedDescription; handle(error)
        }
    }

    func loadCalls(_ query: WorkspaceCallsQuery, refresh: Bool = false, debounce: Bool = false) async {
        guard !closed, !invalidated, !suspended, !renewingSession, renewalAPI == nil else { return }
        let id = UUID(); loadID = id
        loading = true; paging = false; error = nil; pageError = nil
        if !refresh { pagination.reset() }
        defer { if loadID == id { loading = false } }
        do {
            if debounce { try await Task.sleep(nanoseconds: 300_000_000) }
            try Task.checkCancellation()
            let current = try await api.profile()
            guard loadID == id, !closed, !invalidated else { return }
            guard current.capabilities.calls else { throw WorkspaceError.forbidden }
            try acceptProfile(current)
            let page = try await api.calls(query: query, page: 1, scope: current.scope(origin: api.origin))
            try Task.checkCancellation()
            guard loadID == id, !closed, !invalidated else { return }
            var result = WorkspacePagination()
            try result.apply(page, requested: 1, generation: result.generation)
            pagination = result
        } catch {
            guard !Task.isCancelled, loadID == id, !closed else { return }
            self.error = error.localizedDescription; handle(error)
        }
    }

    func loadMore(_ query: WorkspaceCallsQuery) async {
        guard !paging, !loading, !closed, !invalidated, !suspended, !renewingSession, renewalAPI == nil, pagination.hasMore, let scope = scope else { return }
        paging = true; pageError = nil
        let id = loadID, generation = pagination.generation, next = pagination.currentPage + 1
        defer { if loadID == id { paging = false } }
        do {
            let page = try await api.calls(query: query, page: next, scope: scope)
            try Task.checkCancellation()
            guard loadID == id, !closed, !invalidated else { return }
            try pagination.apply(page, requested: next, generation: generation)
        } catch {
            guard !Task.isCancelled, loadID == id, !closed else { return }
            pageError = error.localizedDescription; handle(error)
        }
    }

    private func acceptProfile(_ candidate: WorkspaceProfile) throws {
        if let expected = dashboardIdentity {
            guard candidate.user.id == expected.userId, candidate.user.vendor?.id == expected.vendorId else { throw WorkspaceError.scopeChanged }
        }
        let candidateScope = candidate.scope(origin: api.origin)
        if let expected = verifiedProfileScope, candidateScope != expected { throw WorkspaceError.scopeChanged }
        verifiedProfileScope = candidateScope
        profile = candidate
    }
}
