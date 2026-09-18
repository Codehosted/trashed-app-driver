// Foundation-only wire fixtures and accumulator checks; production loop runs in Endpoint.
func rentalJSON(_ id: String) -> [String: Any] {
    ["id": id, "label": "Synthetic rental", "status": "active", "href": "/vendor/rentals/" + id, "lat": 0, "lng": 0]
}
func legacyData(_ map: WorkspaceRentalsMap) throws -> Data {
    try JSONSerialization.data(withJSONObject: ["version": map.version, "generatedAt": map.generatedAt,
        "scope": ["userId": map.scope.userId, "vendorId": map.scope.vendorId],
        "orders": map.orders.map { rentalJSON($0.id) }, "count": map.count,
        "totalRentalCount": map.totalRentalCount, "unmappedCount": map.unmappedCount])
}
func pageData(_ ids: [String], mapped: Int = 2, next: String? = nil, changes: [String: Any] = [:]) throws -> Data {
    var page: [String: Any] = ["version": 2, "generatedAt": "2026-09-17T12:00:00Z",
        "scope": ["userId": 1, "vendorId": 2], "orders": ids.map(rentalJSON), "count": ids.count,
        "mappedCount": mapped, "totalRentalCount": mapped + 1, "unmappedCount": 1,
        "snapshot": String(repeating: "a", count: 64), "nextCursor": next as Any? ?? NSNull()]
    page.merge(changes) { _, new in new }
    return try JSONSerialization.data(withJSONObject: page)
}
@MainActor func paginationChecks() async throws {
    let first = try pageData(["one"], next: "opaque_-1")
    let second = try pageData(["two"], changes: ["generatedAt": "2026-09-17T12:00:01Z"])
    let profile = fixtureProfile(), scope = profile.scope(origin: origin)
    var aggregate = WorkspaceRentalsAccumulator()
    let unpublished = try aggregateAppendIsNil(&aggregate, first)
    check(unpublished, "first page is not published")
    check(aggregate.path == "/api/vendor/rentals/map?pageSize=200&cursor=opaque_-1", "opaque cursor URL")
    let all = try aggregate.append(second, profile: profile, origin: origin)
    check(all?.version == 1 && all?.count == 2 && all?.orders.map(\.id) == ["one", "two"], "complete aggregate adapts to existing model")
    check(rejected { _ = try aggregate.append(second, profile: profile, origin: origin) }, "finished accumulator cannot continue")
    var empty = WorkspaceRentalsAccumulator()
    let emptyResult = try empty.append(pageData([], mapped: 0), profile: profile, origin: origin)
    check(emptyResult?.count == 0 && emptyResult?.unmappedCount == 1, "true unmapped-only empty succeeds")
    let invalidSeconds = try [
        pageData(["two"], changes: ["scope": ["userId": 9, "vendorId": 2]]),
        pageData(["two"], changes: ["scope": ["userId": 1, "vendorId": 9]]),
        pageData(["two"], changes: ["snapshot": String(repeating: "b", count: 64)]),
        pageData(["two"], mapped: 3), pageData(["two"], changes: ["unmappedCount": 2, "totalRentalCount": 4]),
        pageData(["one"]), pageData(["two", "three"]), pageData([]),
        pageData([], next: "new"), pageData(["two"], next: "opaque_-1"),
        pageData(["two"], changes: ["count": 9]), legacyData(snapshot())
    ]
    for bad in invalidSeconds {
        var accumulator = WorkspaceRentalsAccumulator()
        _ = try accumulator.append(first, profile: profile, origin: origin)
        check(rejected { _ = try accumulator.append(bad, profile: profile, origin: origin) }, "mixed, duplicate, nonprogressing or incomplete pages rejected")
    }
    for bad in try [pageData(["one"], next: ""), pageData(["one"], next: String(repeating: "x", count: 257)),
                    pageData(["one"], next: "x&injected=y"), pageData(["one", "one"]),
                    pageData(["one"], mapped: 1, changes: ["snapshot": String(repeating: "A", count: 64)]),
                    pageData(["one"], mapped: 1, changes: ["padding": String(repeating: "x", count: 256 * 1024)])] {
        var accumulator = WorkspaceRentalsAccumulator()
        check(rejected { _ = try accumulator.append(bad, profile: profile, origin: origin) }, "malformed first page rejected")
    }
    // Repeated cursor with positive progress and a still-incomplete total.
    var repeated = WorkspaceRentalsAccumulator()
    _ = try repeated.append(pageData(["one"], mapped: 3, next: "same"), profile: profile, origin: origin)
    check(rejected { _ = try repeated.append(pageData(["two"], mapped: 3, next: "same"), profile: profile, origin: origin) }, "cursor repetition rejected")
    var bounded = WorkspaceRentalsAccumulator(), budgetFailed = false
    for i in 0..<150 {
        let page = try pageData(["r\(i)"], mapped: 151, next: "c\(i)", changes: ["padding": String(repeating: "x", count: 250_000)])
        do { _ = try bounded.append(page, profile: profile, origin: origin) }
        catch WorkspaceError.server(let message) { check(message.contains("Web"), "explicit fallback"); budgetFailed = true; break }
    }
    check(budgetFailed, "aggregate serialized budget is enforced without truncation")
    let endpoint = Endpoint(); endpoint.pageResponses = [first, second]
    let complete = try await endpoint.rentals(scope: scope)
    check(complete.count == 2 && endpoint.paths.count == 2 && endpoint.reads == 3, "production loop checks actor after every page")
    for scenario in ["between", "second", "foreign", "revoked"] {
        let endpoint = Endpoint(); endpoint.pageResponses = [first, second]
        switch scenario {
        case "between": endpoint.cancelOnProfileRead = 2
        case "second": endpoint.cancelOnReadNumber = 2
        case "foreign": endpoint.actors = [profile, profile, fixtureProfile(9)]
        default: endpoint.actors = [profile, profile, fixtureProfile(permissions: ["rentals": false])]
        }
        do { _ = try await endpoint.rentals(scope: scope); fatalError("partial aggregate leaked: \(scenario)") }
        catch is CancellationError { check(scenario == "between" || scenario == "second", "cancellation scenario") }
        catch WorkspaceError.scopeChanged { check(scenario == "foreign" || scenario == "revoked", "scope scenario") }
        if scenario == "between" { check(endpoint.paths.count == 1, "cancel before second page prevents request") }
    }
    let taskEndpoint = Endpoint(); taskEndpoint.pageResponses = [first, second]; taskEndpoint.taskCancelOnReadNumber = 2
    let task = Task { try await taskEndpoint.rentals(scope: scope) }
    do { _ = try await task.value; fatalError("Task cancellation published a partial map") }
    catch is CancellationError { check(taskEndpoint.paths.count == 2, "Task cancelled during second page") }
    print("PASS rentals pagination: scope/hash/totals, IDs/cursors, progress/counts, envelope, cancellation and atomic aggregate")
}
func aggregateAppendIsNil(_ accumulator: inout WorkspaceRentalsAccumulator, _ data: Data) throws -> Bool {
    try accumulator.append(data, profile: fixtureProfile(), origin: origin) == nil
}
