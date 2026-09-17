// Compiled with the production WorkspaceModel and contracts by the .test.mjs runner.
func check(_ value: @autoclosure () -> Bool, _ label: String) { if !value() { fatalError(label) } }
func fixtureProfile(_ user: Int = 1, vendor: Int = 2, roles: [String] = ["vendor"], permissions: [String: Bool]? = nil) -> WorkspaceProfile {
    .init(user: .init(id: user, name: "Synthetic", email: "synthetic@example.invalid", phone: nil, image: nil, roles: roles, vendor: .init(id: vendor, businessName: "Synthetic"), emailVerified: true, vendorPermissions: permissions), capabilities: .init(calls: false))
}
let origin = URL(string: "https://fixture.invalid")!
func order(_ id: String = "rental-1", lat: Double = 42.3314, lng: Double = -83.0458, href: String = "/vendor/rentals/1", status: String = "active") -> WorkspaceRental {
    .init(id: id, label: "20 yard rental", status: status, address: "100 Synthetic Ave", customerName: "Ada Fixture", confirmationCode: "DEMO-1", href: href, deliveryDate: "2026-09-17T12:00:00Z", lat: lat, lng: lng)
}
func snapshot(_ orders: [WorkspaceRental] = [order()], user: Int = 1, vendor: Int = 2, count: Int? = nil, total: Int? = nil, unmapped: Int = 1, version: Int = 1, generatedAt: String = "2026-09-17T12:00:00Z") -> WorkspaceRentalsMap {
    .init(version: version, generatedAt: generatedAt, scope: .init(userId: user, vendorId: vendor), orders: orders, count: count ?? orders.count, totalRentalCount: total ?? (orders.count + unmapped), unmappedCount: unmapped)
}
func dashboard() -> WorkspaceDashboard {
    .init(version: 1, generatedAt: "2026-09-17T12:00:00Z", scope: .init(userId: 1, vendorId: 2), businessName: "Synthetic", currency: "USD", revenue: .init(today: 0, thisWeek: 0, thisMonth: 0, thisQuarter: 0, thisYear: 0, monthlyGrowthPercent: nil), monthlyRevenue: [], rentals: .init(total: 2, active: 1, pending: 1, completed: 0), inventory: .init(total: 0, available: 0, rented: 0, maintenance: 0), customers: .init(total: 0), inventoryByType: [])
}
func rejected(_ body: () throws -> Void) -> Bool { do { try body(); return false } catch { return true } }

@MainActor final class API: WorkspaceServing {
    let origin = URL(string: "https://fixture.invalid")!
    var onSessionChange: (() -> Void)?
    var actor = fixtureProfile()
    var response = snapshot()
    var failure: Error?
    var successor: API?
    var rentalReads = 0
    var profileReads = 0
    var closed = false
    var delay = false
    var delayProfile = false
    var delayDashboard = false
    var pending: CheckedContinuation<WorkspaceRentalsMap, Error>?
    var pendingProfile: CheckedContinuation<WorkspaceProfile, Error>?
    var pendingDashboard: CheckedContinuation<WorkspaceDashboard, Error>?
    func profile() async throws -> WorkspaceProfile {
        profileReads += 1
        if delayProfile { return try await withCheckedThrowingContinuation { pendingProfile = $0 } }
        return actor
    }
    func rentals(scope: String) async throws -> WorkspaceRentalsMap {
        check(scope == actor.scope(origin: origin), "request carries the verified scope")
        rentalReads += 1
        if delay { return try await withCheckedThrowingContinuation { pending = $0 } }
        if let failure = failure { throw failure }
        return response
    }
    func dashboard() async throws -> WorkspaceDashboard {
        if delayDashboard { return try await withCheckedThrowingContinuation { pendingDashboard = $0 } }
        return makeDashboard()
    }
    func save(_ edit: WorkspaceProfileEdit, scope: String) async throws -> WorkspaceProfile { actor }
    func calls(query: WorkspaceCallsQuery, page: Int, scope: String) async throws -> WorkspaceCallsPage { throw WorkspaceError.invalidResponse }
    func recording(_ call: WorkspaceCall, scope: String) async throws -> (Data, String) { throw WorkspaceError.invalidResponse }
    func cancelPending() {} // Intentionally ignores cancellation: production generations must reject late results.
    func close() { closed = true; onSessionChange = nil }
    func renewedSession() -> (any WorkspaceServing)? { successor }
}
func makeDashboard() -> WorkspaceDashboard { dashboard() }
@MainActor func wait(_ predicate: () -> Bool) async {
    for _ in 0..<20000 { if predicate() { return }; await Task.yield() }
    fatalError("Timed out waiting for deterministic continuation")
}

@main struct Run {
    @MainActor static func main() async throws {
        let valid = try snapshot().validated(for: fixtureProfile(), origin: origin)
        check(valid.orders.map(\.id) == ["rental-1"], "stable server IDs retained")
        check(valid.filtered(search: "  ada  ", status: nil).count == 1, "native search case/whitespace")
        check(valid.filtered(search: "Synthetic Ave", status: "active").count == 1, "native address/status intersection")
        check(valid.filtered(search: "Ada", status: "pending").isEmpty, "native filter")
        check(trySnapshotEmpty(), "valid empty distinct from errors")
        let zero = try snapshot([order(lat: 0, lng: 0)]).validated(for: fixtureProfile(), origin: origin)
        check(zero.count == 1, "zero coordinates are mapped")
        for bad in [snapshot(user: 3), snapshot(vendor: 3), snapshot(count: 2), snapshot(total: 0), snapshot(unmapped: -1), snapshot(version: 2), snapshot(generatedAt: "not a date"), snapshot([order(), order()]), snapshot([order(lat: .nan)]), snapshot([order(lng: .infinity)]), snapshot([order(lat: 91)]), snapshot([order(lng: -181)]), snapshot([order("")]), snapshot([order(href: "https://evil.invalid/vendor/rentals/1")])] {
            check(rejected { _ = try bad.validated(for: fixtureProfile(), origin: origin) }, "malformed or foreign snapshot fails, not empty")
        }
        for p in [fixtureProfile(roles: ["driver"]), fixtureProfile(roles: ["customer"]), fixtureProfile(permissions: [:]), fixtureProfile(permissions: ["rentals": false]), fixtureProfile(vendor: 0)] {
            check(!WorkspaceRentalsPolicy.allowed(p), "missing capability denies")
        }
        check(WorkspaceRentalsPolicy.allowed(fixtureProfile(roles: ["manager"], permissions: ["rentals": true])), "manager explicit rentals allowed")
        for path in ["/vendor/rentals/1", "/vendor/rentals/", "/vendor/rentals-old", "/vendor/%72entals", "/vendor/rentals/1?view=map"] {
            check(WorkspaceRoute.parse(URL(string: path, relativeTo: origin)!.absoluteURL, origin: origin) == nil, "only exact Rentals path native")
        }
        check(WorkspaceRoute.parse(URL(string: "/vendor/rentals?view=list", relativeTo: origin)!.absoluteURL, origin: origin) == .rentals, "queries cannot redirect the native destination")
        for path in ["//evil.invalid/vendor/rentals/1", "/vendor/rentals/%2F1", "/vendor/rentals/../profile", "/vendor/rentals/1?next=https://evil.invalid", "/vendor/rentals/1#x", "/vendor/rentals/1/other"] {
            check(WorkspaceRentalsPolicy.detailPath(path, origin: origin) == nil, "unsafe details rejected")
        }
        let json = #"{"id":"source-42","label":"Example","status":"active","href":"/vendor/rentals/42","lat":0,"lng":0,"totalPrice":19.95}"#
        let decoded = try JSONDecoder().decode(WorkspaceRental.self, from: Data(json.utf8))
        check(decoded.totalPrice == .number(19.95), "numeric price decodes")
        let textPrice = try JSONDecoder().decode(WorkspaceRental.self, from: Data(json.replacingOccurrences(of: "19.95", with: "\"19.95\"").utf8))
        check(textPrice.totalPrice == .text("19.95"), "text price decodes")
        print("PASS rentals DTO, permission, exact route, stable IDs, search/status, bounds and detail URL contracts")

        // Execute the production endpoint and scope checks with only HTTP reads
        // substituted. Existing WebKit cookie tests cover the underlying transport.
        let endpoint = Endpoint(), scope = fixtureProfile().scope(origin: origin)
        let transportValue = try await endpoint.rentals(scope: scope)
        check(transportValue.count == 1 && endpoint.reads == 2 && endpoint.paths == ["/api/vendor/rentals/map"], "one map endpoint with before/after authorization")
        for scenario in ["denied-before", "denied-after", "foreign-profile", "foreign-map", "cancel", "closed", "server"] {
            let endpoint = Endpoint()
            switch scenario {
            case "denied-before": endpoint.actors = [fixtureProfile(permissions: ["rentals": false])]
            case "denied-after": endpoint.actors[1] = fixtureProfile(permissions: ["rentals": false])
            case "foreign-profile": endpoint.actors[1] = fixtureProfile(9)
            case "foreign-map": endpoint.response = snapshot(user: 9)
            case "cancel": endpoint.cancelOnRead = true
            case "closed": endpoint.invalidated = true
            default: endpoint.failure = WorkspaceError.server("Synthetic 503")
            }
            do { _ = try await endpoint.rentals(scope: endpoint.actors[0].scope(origin: origin)); fatalError("endpoint accepted \(scenario)") }
            catch WorkspaceError.forbidden { check(scenario.hasPrefix("denied"), "unexpected permission rejection") }
            catch WorkspaceError.scopeChanged { check(scenario.hasPrefix("foreign") || scenario == "denied-after", "unexpected scope rejection: \(scenario)") }
            catch is CancellationError { check(["cancel", "closed"].contains(scenario), "unexpected cancellation") }
            catch WorkspaceError.server { check(scenario == "server", "unexpected server failure") }
            if scenario == "denied-before" { check(endpoint.paths.isEmpty, "denial prevents map HTTP") }
        }
        print("PASS rentals endpoint: before/after authorization, foreign scope, cancellation and server errors")

        let api = API()
        let loaded = WorkspaceModel(api: api)
        await loaded.loadRentals()
        check(loaded.rentals?.count == 1 && loaded.rentalsError == nil, "API snapshot published")
        api.failure = WorkspaceError.server("Synthetic 503")
        await loaded.loadRentals()
        check(loaded.rentals == nil && loaded.rentalsError != nil && !loaded.invalidated, "server failure is visible, never successful empty")
        api.failure = nil; await loaded.loadRentals()
        check(loaded.rentals?.count == 1, "retry recovers")
        var web: [String] = []
        await loaded.openRentalsWeb("/vendor/rentals/1") { web.append($0) }
        await loaded.openRentalsWeb("/vendor/rentals") { web.append($0) }
        await loaded.openRentalsWeb("/vendor/profile") { web.append($0) }
        check(web == ["/vendor/rentals/1", "/vendor/rentals"], "only deliberate finite web actions")
        api.actor = fixtureProfile(permissions: ["rentals": false])
        await loaded.openRentalsWeb("/vendor/rentals/1") { web.append($0) }
        check(loaded.invalidated && loaded.rentals == nil && web.count == 2, "stale menu/details recheck permissions")
        for foreign in [snapshot(user: 9), snapshot(vendor: 9)] {
            let api = API(); api.response = foreign
            let model = WorkspaceModel(api: api); await model.loadRentals()
            check(model.invalidated && model.rentals == nil, "foreign DTO never exposed")
        }
        let denied = API(); denied.actor = fixtureProfile(permissions: ["rentals": false])
        let forbidden = WorkspaceModel(api: denied); await forbidden.loadRentals()
        check(forbidden.invalidated && denied.rentalReads == 0, "permission denied before data request")
        for failure in [WorkspaceError.expired, .forbidden, .scopeChanged] {
            let api = API(); api.failure = failure
            let model = WorkspaceModel(api: api); await model.loadRentals()
            check(model.invalidated && model.rentals == nil, "auth failure invalidates")
        }
        for action in ["close", "invalidate", "suspend", "leave"] {
            let api = API(); api.delay = true
            let model = WorkspaceModel(api: api)
            let task = Task { await model.loadRentals() }
            await wait { api.pending != nil }
            switch action {
            case "close": model.close()
            case "invalidate": model.invalidate(WorkspaceError.scopeChanged)
            case "suspend": model.suspend()
            default: model.leaveRentals()
            }
            api.pending!.resume(returning: snapshot()); await task.value
            check(model.rentals == nil && !model.rentalsLoading, "stale completion rejected after \(action)")
        }
        let staleAPI = API()
        let opening = WorkspaceModel(api: staleAPI); await opening.loadRentals()
        staleAPI.delayProfile = true
        let openTask = Task { await opening.openRentalsWeb("/vendor/rentals/1") { web.append($0) } }
        await wait { staleAPI.pendingProfile != nil }; opening.close()
        staleAPI.pendingProfile!.resume(returning: fixtureProfile()); await openTask.value
        check(web.count == 2, "late explicit-web authorization cannot escape a closed host")
        let resumeAPI = API(); let resumed = WorkspaceModel(api: resumeAPI)
        await resumed.loadRentals(); resumed.suspend()
        check(resumed.rentals == nil, "background hides rentals")
        await resumed.resume()
        check(resumed.rentals?.count == 1 && resumeAPI.rentalReads == 2, "resume reauthorizes and refetches")
        let racingAPI = API(); racingAPI.delay = true
        let racing = WorkspaceModel(api: racingAPI)
        let obsoleteLoad = Task { await racing.loadRentals() }
        await wait { racingAPI.pending != nil }
        racingAPI.delay = false; racingAPI.response = snapshot([order("newest")])
        await racing.loadRentals()
        racingAPI.pending!.resume(returning: snapshot(user: 99)); await obsoleteLoad.value
        check(!racing.invalidated && racing.rentals?.orders.first?.id == "newest", "obsolete foreign response cannot replace or revoke latest snapshot")
        racingAPI.actor = fixtureProfile(9)
        await racing.loadRentals()
        check(racing.invalidated && racing.rentals == nil && racingAPI.rentalReads == 2, "account switch clears data before another rental request")
        let old = API(), next = API(); next.delayDashboard = true; old.successor = next
        let renewing = WorkspaceModel(api: old); await renewing.loadDashboard(); await renewing.loadRentals()
        old.onSessionChange?()
        check(renewing.rentals == nil && renewing.profile == nil, "renewal clears private snapshot synchronously")
        await wait { next.pendingDashboard != nil }
        check(renewing.api === old && next.rentalReads == 0, "candidate transport quarantined")
        next.pendingDashboard!.resume(returning: dashboard())
        await wait { renewing.rentals != nil || renewing.invalidated }
        check(!renewing.invalidated && renewing.rentals?.count == 1 && next.rentalReads == 1, "renewal reauthorizes rentals before republishing")
        renewing.close(); check(renewing.rentals == nil, "close erases published rentals")
        print("PASS rentals model: API error/retry, wrong scope, revocation, close/suspend/leave races, explicit web leases, resume and renewal")
    }
    static func trySnapshotEmpty() -> Bool {
        (try? snapshot([], unmapped: 0).validated(for: fixtureProfile(), origin: origin).count) == 0
    }
}
