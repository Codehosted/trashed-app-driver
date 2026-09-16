
@MainActor final class DelayedAPI: WorkspaceServing {
    let origin = URL(string: "https://fixture.invalid")!
    var onSessionChange: (() -> Void)?
    var reads: [CheckedContinuation<WorkspaceProfile, Error>] = []
    var writes: [CheckedContinuation<WorkspaceProfile, Error>] = []
    func profile() async throws -> WorkspaceProfile { try await withCheckedThrowingContinuation { reads.append($0) } }
    func save(_ edit: WorkspaceProfileEdit, scope: String) async throws -> WorkspaceProfile { try await withCheckedThrowingContinuation { writes.append($0) } }
    func calls(query: WorkspaceCallsQuery, page: Int, scope: String) async throws -> WorkspaceCallsPage { throw WorkspaceError.invalidResponse }
    func recording(_ call: WorkspaceCall, scope: String) async throws -> (Data, String) { throw WorkspaceError.invalidResponse }
    func cancelPending() {} // Intentionally non-cooperative transport.
    func close() {}
}
@main struct LifecycleTests {
    @MainActor static func check(_ condition: @autoclosure () -> Bool, _ label: String) { precondition(condition(), label) }
    @MainActor static func wait(_ condition: () -> Bool) async {
        for _ in 0..<10000 { if condition() { return }; await Task.yield() }
        fatalError("bounded continuation wait timed out")
    }
    static func profile(_ name: String) -> WorkspaceProfile {
        WorkspaceProfile(user: .init(id: 12, name: name, email: "fixture@example.test", phone: nil, image: nil, roles: ["vendor"], vendor: nil, emailVerified: true), capabilities: .init(calls: true))
    }
    @MainActor static func seed(_ api: DelayedAPI, _ model: WorkspaceModel) async {
        let task = Task { await model.loadProfile() }; await wait { api.reads.count == 1 }
        api.reads.removeFirst().resume(returning: profile("Initial")); await task.value
    }
    @MainActor static func main() async throws {
        // Stale load success and failure after a full suspend/resume must be ignored.
        for fail in [false, true] {
            let api = DelayedAPI()
            let m = WorkspaceModel(api: api)
            let old = Task { await m.loadProfile() }; await wait { api.reads.count == 1 }
            m.suspend()
            let resumed = Task { await m.resume() }; await wait { api.reads.count == 2 }
            api.reads.removeLast().resume(returning: profile("Fresh")); await resumed.value
            if fail { api.reads.removeFirst().resume(throwing: WorkspaceError.expired) }
            else { api.reads.removeFirst().resume(returning: profile("Stale")) }
            await old.value
            check(m.profile?.user.name == "Fresh" && !m.suspended && !m.invalidated && m.error == nil, "late load changed resumed profile")
        }
        // An earlier foreground revalidation cannot undo a second suspend.
        do {
            let api = DelayedAPI()
            let model = WorkspaceModel(api: api); await seed(api, model); model.suspend()
            let old = Task { await model.resume() }; await wait { api.reads.count == 1 }
            model.suspend(); api.reads.removeFirst().resume(returning: profile("Stale resume")); await old.value
            check(model.suspended && model.profile?.user.name == "Initial", "old resume unsuspended screen")
            let latest = Task { await model.resume() }; await wait { api.reads.count == 1 }
            api.reads.removeFirst().resume(returning: profile("Latest")); await latest.value
            check(!model.suspended && model.profile?.user.name == "Latest", "latest resume did not recover")
        }
        // Stale successful save and expired error cannot mutate a new editing lifetime.
        for fail in [false, true] {
            let api = DelayedAPI(); let m = WorkspaceModel(api: api); await seed(api, m)
            let edit = WorkspaceProfileEdit(name: "Edited", email: "fixture@example.test", phone: "")
            let old = Task { await m.save(edit) }; await wait { api.writes.count == 1 }
            m.suspend(); let resumed = Task { await m.resume() }; await wait { api.reads.count == 1 }
            api.reads.removeFirst().resume(returning: profile("Fresh")); await resumed.value
            let newer = Task { await m.save(edit) }; await wait { api.writes.count == 2 }
            if fail { api.writes.removeFirst().resume(throwing: WorkspaceError.expired) }
            else { api.writes.removeFirst().resume(returning: profile("Stale save")) }
            let accepted = await old.value
            check(!accepted && m.saving && !m.invalidated && m.error == nil && m.profile?.user.name == "Fresh", "stale save changed state or cleared newer spinner")
            api.writes.removeFirst().resume(returning: profile("Latest save")); let saved = await newer.value
            check(saved && !m.saving && m.profile?.user.name == "Latest save", "new save not accepted")
        }
        do {
            let api = DelayedAPI(); let m = WorkspaceModel(api: api); var expired = false; m.onExpired = { expired = true }
            let task = Task { await m.loadProfile() }; await wait { api.reads.count == 1 }; m.close()
            api.reads.removeFirst().resume(throwing: WorkspaceError.expired); await task.value
            check(m.profile == nil && !expired && !m.loading && m.error == nil, "closed response reopened auth")
        }
        do {
            let origin = URL(string: "https://fixture.invalid")!, url = URL(string: "https://fixture.invalid/api/user/profile")!
            func snapshot(_ value: String) -> WorkspaceCookieSnapshot {
                WorkspaceCookieSnapshot(cookies: [HTTPCookie(properties: [.name: "next-auth.session-token", .value: value, .domain: "fixture.invalid", .path: "/"])!], origin: origin)
            }
            let authorized = snapshot("account-a"), switched = snapshot("account-b")
            var patches = 0
            do { _ = try switched.headers(for: url, previous: authorized.fingerprint); patches += 1; fatalError("changed cookie accepted before PATCH") }
            catch WorkspaceError.scopeChanged {}
            check(patches == 0, "PATCH escaped before identity check")
            let headers = try authorized.headers(for: url, previous: authorized.fingerprint)
            check(headers["Cookie"]?.contains("account-a") == true && headers["Cookie"]?.contains("account-b") == false, "header differs from validated snapshot")
        }
        do {
            let origin = URL(string: "https://fixture.invalid")!
            for raw in ["about:blank", "https://fixture.invalid/app", "https://fixture.invalid/vendor/profile?view=about"] {
                check(!WorkspaceWebRouting.clearsBypass(url: URL(string: raw)!, origin: origin, bypass: .profile, committed: true), "intermediary/target consumed explicit web fallback")
            }
            let other = URL(string: "https://fixture.invalid/vendor/orders")!
            check(!WorkspaceWebRouting.clearsBypass(url: other, origin: origin, bypass: .profile, committed: false), "provisional URL consumed fallback")
            check(WorkspaceWebRouting.clearsBypass(url: other, origin: origin, bypass: .profile, committed: true), "committed unrelated route retained bypass")
        }
        do {
            let api = DelayedAPI(); let m = WorkspaceModel(api: api); await seed(api,m)
            let save = Task { await m.save(WorkspaceProfileEdit(name:"Fixture",email:"changed@example.test",phone:"")) }; await wait { api.writes.count == 1 }
            api.writes.removeFirst().resume(throwing: WorkspaceError.emailChanged)
            let accepted = await save.value
            check(!accepted && m.invalidated && m.profile == nil && m.error == "Email saved. Sign in again with your new address.", "email update must not claim a failed write or retain old profile")
        }
        print("PASS 8 lifecycle scenarios: load success/error, repeated resume, save success/error, close, cookie snapshot, named web fallback; plus confirmed email reauthentication")
    }
}
