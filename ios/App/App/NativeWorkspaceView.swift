import SwiftUI

// MARK: - Native dock navigation policy
// Same app destinations and symbols as the web-owned navigation, without a JS owner.
enum WorkspaceDockGroup: String, CaseIterable, Identifiable {
    case manage = "vendor-manage", assistant = "vendor-assistant"
    case calls = "vendor-calls", account = "vendor-account"
    var id: String { rawValue }
    var title: String {
        switch self {
        case .manage: return "Manage"
        case .assistant: return "Assistant"
        case .calls: return "Calls"
        case .account: return "Account"
        }
    }
    var symbol: String {
        switch self {
        case .manage: return "square.grid.2x2"
        case .assistant: return "sparkles"
        case .calls: return "phone"
        case .account: return "person.crop.circle"
        }
    }
}

enum WorkspaceDockAction: Equatable {
    case dashboard, rentals, profile, calls, enableNotifications
    case web(String)
}

struct WorkspaceDockEntry: Identifiable {
    let id: String
    let title: String
    let symbol: String
    let action: WorkspaceDockAction
}

enum WorkspaceDockNavigation {
    static func selectedGroup(_ route: WorkspaceRoute) -> WorkspaceDockGroup {
        switch route {
        case .dashboard, .rentals: return .manage
        case .profile: return .account
        case .calls: return .calls
        }
    }

    static func entries(in group: WorkspaceDockGroup, profile: WorkspaceProfile?) -> [WorkspaceDockEntry] {
        guard let profile = profile, profile.user.id > 0 else { return [] }
        let roles = profile.user.roles
        let vendor = (profile.user.vendor?.id ?? 0) > 0
            && roles.contains(where: { ["vendor", "manager", "admin"].contains($0) })
        func allowed(_ feature: String) -> Bool {
            vendor && (profile.user.vendorPermissions == nil || profile.user.vendorPermissions?[feature] == true)
        }
        func web(_ id: String, _ title: String, _ symbol: String, _ path: String) -> WorkspaceDockEntry {
            WorkspaceDockEntry(id: id, title: title + " · Web", symbol: symbol, action: .web(path))
        }
        var entries: [WorkspaceDockEntry] = []
        switch group {
        case .manage:
            if WorkspaceHomeRouting.dashboardEligible(profile) {
                entries.append(.init(id: "vendor-dashboard", title: "Dashboard", symbol: "square.grid.2x2", action: .dashboard))
            }
            if allowed("inventory") {
                entries.append(web("vendor-inventory", "Inventory", "shippingbox", "/vendor/inventory"))
                entries.append(web("vendor-pods", "Pods", "cube.box", "/vendor/pods"))
            }
            if WorkspaceRentalsPolicy.allowed(profile) { entries.append(.init(id: "vendor-rentals", title: "Rentals", symbol: "map", action: .rentals)) }
            if allowed("customers") { entries.append(web("vendor-customers", "Customers", "person.2", "/vendor/customers")) }
            if allowed("driver") {
                // Product entitlements are still rechecked by these web destinations.
                entries.append(web("vendor-dispatch", "Dispatch", "point.topleft.down.curvedto.point.bottomright.up", "/vendor/dispatch"))
                entries.append(web("vendor-driver", "Driver App", "car", "/driver"))
            }
        case .assistant:
            if allowed("aiAssistant") && profile.capabilities.calls {
                entries.append(web("vendor-assistant", "Assistant", "sparkles", "/vendor/assistant"))
            }
        case .calls:
            if allowed("aiAssistant") && profile.capabilities.calls {
                entries.append(.init(id: "vendor-call-history", title: "Calls", symbol: "phone", action: .calls))
                entries.append(web("vendor-call-monitor", "Live calls", "headphones", "/calls/monitor"))
                entries.append(web("vendor-call-settings", "Assistant settings", "slider.horizontal.3", "/vendor/trisha/settings"))
            }
        case .account:
            if allowed("profile") {
                entries.append(.init(id: "vendor-profile", title: "Profile", symbol: "person.crop.circle", action: .profile))
                entries.append(web("vendor-security", "Account & security", "lock.shield", "/vendor/profile?view=account"))
            }
            if roles.contains("admin") { entries.append(web("vendor-admin", "Administration", "gearshape", "/admin")) }
            if allowed("settings") { entries.append(web("vendor-settings", "Settings", "slider.horizontal.3", "/vendor/settings")) }
            entries.append(web("vendor-inbox", "Inbox", "tray", "/vendor/profile?view=inbox"))
            entries.append(web("vendor-support", "Support", "questionmark.circle", "/vendor/support"))
            entries.append(.init(id: "vendor-enable-notifications", title: "Enable notifications", symbol: "bell.badge", action: .enableNotifications))
        }
        return entries
    }
}

// MARK: - Native workspace screen
// Native API-backed workspace. The host owns session lifetime and navigation.
@available(iOS 16.0, *)
@MainActor
struct WorkspaceScreen: View {
    @ObservedObject var model: WorkspaceModel
    let route: WorkspaceRoute
    var isRoot = false
    let openWeb: (String) -> Void
    let close: () -> Void
    @State private var path: [WorkspaceRoute] = []
    @State private var keyboardVisible = false

    var body: some View {
        VStack(spacing: 0) {
        NavigationStack(path: $path) {
            Group {
                switch route {
                case .dashboard:
                    WorkspaceDashboardView(model: model)
                case .rentals:
                    WorkspaceRentalsMapView(model: model, openWeb: openWeb)
                case .profile:
                    WorkspaceProfileView(model: model, openWeb: openWeb)
                case .calls(let query):
                    WorkspaceCallsView(model: model, initialQuery: query)
                }
            }
            .navigationDestination(for: WorkspaceRoute.self) { destination in
                switch destination {
                case .rentals: WorkspaceRentalsMapView(model: model, openWeb: openWeb)
                case .profile: WorkspaceProfileView(model: model, openWeb: openWeb)
                case .calls(let query): WorkspaceCallsView(model: model, initialQuery: query)
                case .dashboard: WorkspaceDashboardView(model: model)
                }
            }
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    if !isRoot { Button("Close", action: close)
                        .fixedSize(horizontal: true, vertical: false)
                        .accessibilityIdentifier("workspace-close")
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    if isRoot {
                        Menu {
                            if model.invalidated {
                                Button("Reopen dashboard") { model.onReopen?() }
                                Button("Sign in again") { model.onExpired?() }
                            } else {
                                if dockEntry(.manage, "vendor-dashboard") != nil {
                                    Button("Dashboard") { guard dockEntry(.manage, "vendor-dashboard") != nil else { return }; path = [] }
                                }
                                if dockEntry(.manage, "vendor-rentals") != nil {
                                    Button("Rentals") { selectDockEntry(.manage, "vendor-rentals") }
                                }
                                if dockEntry(.account, "vendor-profile") != nil {
                                    Button("Profile") { guard dockEntry(.account, "vendor-profile") != nil else { return }; path = [.profile] }
                                }
                                Button("Enable notifications") { selectDockEntry(.account, "vendor-enable-notifications") }
                                if dockEntry(.calls, "vendor-call-history") != nil {
                                    Button("Calls") { guard dockEntry(.calls, "vendor-call-history") != nil else { return }; path = [.calls(WorkspaceCallsQuery())] }
                                }
                                Menu("More destinations · Web") {
                                    ForEach(WorkspaceDockGroup.allCases) { group in
                                        ForEach(WorkspaceDockNavigation.entries(in: group, profile: model.profile)) { entry in
                                            if case .web = entry.action {
                                                Button(entry.title) { selectDockEntry(group, entry.id) }
                                            }
                                        }
                                    }
                                }
                            }
                        } label: { Label("Navigate", systemImage: "line.3.horizontal") }
                        .accessibilityIdentifier("workspace-native-menu")
                    } else if case .calls = route {
                        Menu {
                            Button("Full call workspace · Web") { openWeb("/calls/history") }
                            Button("Live monitoring · Web") { openWeb("/calls/monitor") }
                        } label: { Image(systemName: "ellipsis.circle").frame(width: 44, height: 44) }
                        .accessibilityLabel("More call options")
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        // A sibling consumes real height; NavigationStack safe-area propagation
        // alone allowed the final dashboard footer under the dock on iOS 26.
            if isRoot && !keyboardVisible {
                WorkspaceBottomDock(
                    profile: model.profile,
                    selected: WorkspaceDockNavigation.selectedGroup(path.last ?? route),
                    enabled: !model.invalidated && !model.suspended,
                    select: selectDockEntry
                )
                .fixedSize(horizontal: false, vertical: true)
            }
        }
        .tint(WorkspaceStyle.accent)
        .environment(\.defaultMinListRowHeight, 44)
        .disabled(model.suspended)
        // Renewal clears the profile; a newly verified dashboard must repopulate
        // navigation permissions without ever using the quarantined transport.
        .task(id: model.dashboard?.generatedAt) {
            if isRoot && model.profile == nil { await model.loadProfile() }
        }
        .onChange(of: model.invalidated) { if $0 { path = [] } }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
            keyboardVisible = true
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
            keyboardVisible = false
        }
        .onChange(of: model.requestedRoute) { destination in
            guard let destination = destination else { return }
            path = destination == .dashboard ? [] : [destination]
            model.requestedRoute = nil
        }
    }

    private func dockEntry(_ group: WorkspaceDockGroup, _ id: String) -> WorkspaceDockEntry? {
        guard !model.invalidated, !model.suspended else { return nil }
        return WorkspaceDockNavigation.entries(in: group, profile: model.profile).first { $0.id == id }
    }

    private func selectDockEntry(_ group: WorkspaceDockGroup, _ id: String) {
        // Re-resolve against current permissions: an already-open menu may be stale.
        guard let entry = dockEntry(group, id) else { return }
        switch entry.action {
        case .dashboard: path = []
        case .rentals: path = [.rentals]
        case .profile: path = [.profile]
        case .calls: path = [.calls(WorkspaceCallsQuery())]
        case .enableNotifications: model.onEnableNotifications?()
        case .web(let destination): openWeb(destination)
        }
    }
}

@available(iOS 16.0, *)
enum WorkspaceStyle {
    static let accent = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 190.0 / 255, green: 159.0 / 255, blue: 1, alpha: 1)
            : UIColor(red: 112.0 / 255, green: 51.0 / 255, blue: 1, alpha: 1)
    })
}

@available(iOS 16.0, *)
private struct WorkspaceBottomDock: View {
    let profile: WorkspaceProfile?
    let selected: WorkspaceDockGroup
    let enabled: Bool
    let select: (WorkspaceDockGroup, String) -> Void
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: dynamicTypeSize.isAccessibilitySize ? 2 : 4), spacing: 8) {
            ForEach(WorkspaceDockGroup.allCases) { group in
                let entries = WorkspaceDockNavigation.entries(in: group, profile: profile)
                Menu {
                    ForEach(entries) { entry in
                        Button { select(group, entry.id) } label: {
                            Label(entry.title, systemImage: entry.symbol)
                        }
                        .accessibilityIdentifier("workspace-dock-action-\(entry.id)")
                    }
                } label: {
                    VStack(spacing: 4) {
                        Image(systemName: group.symbol).font(.body.weight(.semibold)).accessibilityHidden(true)
                        Text(group.title).font(.caption.weight(.medium))
                            .fixedSize(horizontal: false, vertical: true)
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .padding(.vertical, 6)
                    .foregroundStyle(selected == group ? WorkspaceStyle.accent : Color.secondary)
                    .background(selected == group ? WorkspaceStyle.accent.opacity(0.12) : Color.clear)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .contentShape(Rectangle())
                }
                .disabled(!enabled || entries.isEmpty)
                .accessibilityLabel(group.title)
                .accessibilityHint("Opens \(group.title) navigation")
                .accessibilityAddTraits(selected == group ? .isSelected : [])
                .accessibilityIdentifier("trashed-native-tab-\(group.rawValue)")
            }
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 12)
        .padding(.top, 8)
        .padding(.bottom, 8)
        .background(Color(uiColor: .systemBackground), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .padding(.horizontal, 12)
        .padding(.top, 8)
        .background(Color(uiColor: .systemGroupedBackground))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("workspace-bottom-dock")
    }
}

@available(iOS 16.0, *)
private struct WorkspaceNotice: View {
    let title: String
    let message: String
    var symbol = "exclamationmark.triangle"

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(title, systemImage: symbol).font(.headline)
            Text(message).font(.subheadline).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 8)
        .accessibilityElement(children: .combine)
    }
}

@available(iOS 16.0, *)
@MainActor
private struct WorkspaceProfileView: View {
    @ObservedObject var model: WorkspaceModel
    let openWeb: (String) -> Void
    @State private var editor: WorkspaceEditorSelection?

    var body: some View {
        List {
            if model.invalidated {
                WorkspaceNotice(title: model.error == WorkspaceError.emailChanged.localizedDescription ? "Email saved" : "Account unavailable", message: model.error ?? "Close this screen and reopen your account.", symbol: "lock")
                Button("Sign in again") { model.onExpired?() }.frame(minHeight: 44)
            } else {
                if let error = model.error {
                    Section {
                        WorkspaceNotice(title: "Could not update profile", message: error)
                        Button("Retry") { Task { await model.loadProfile() } }
                            .frame(minHeight: 44).disabled(model.loading)
                    }
                }
                if let profile = model.profile {
                    profileSections(profile)
                } else if model.loading || model.error == nil {
                    ProgressView("Loading profile…").frame(maxWidth: .infinity, minHeight: 80)
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Your account")
        .accessibilityIdentifier("workspace-profile")
        .refreshable { await model.loadProfile() }
        .task { await model.loadProfile() }
        .sheet(item: $editor) { selection in
            WorkspaceProfileEditor(model: model, selection: selection)
        }
        .onChange(of: model.invalidated) { invalidated in
            if invalidated { editor = nil }
        }
    }

    @ViewBuilder private func profileSections(_ profile: WorkspaceProfile) -> some View {
        Section {
            VStack(alignment: .leading, spacing: 8) {
                Label(profile.user.name?.isEmpty == false ? profile.user.name! : "Your profile", systemImage: "person.crop.circle")
                    .font(.title2.weight(.semibold))
                Text(profile.user.email).foregroundStyle(.secondary).textSelection(.enabled)
                if !profile.user.roles.isEmpty {
                    Text(profile.user.roles.joined(separator: " · ")).font(.subheadline).foregroundStyle(.secondary)
                }
            }.padding(.vertical, 8)
            Button {
                editor = WorkspaceEditorSelection(profile: profile)
            } label: {
                Label("Edit profile", systemImage: "pencil").frame(minHeight: 44)
            }
            .disabled(model.loading || model.saving)
            .accessibilityIdentifier("workspace-edit-profile")
        }
        Section("Personal information") {
            detail("Full name", profile.user.name)
            detail("Email address", profile.user.email)
            detail("Phone number", profile.user.phone)
            if let verified = profile.user.emailVerified {
                detail("Email verification", verified ? "Verified" : "Not verified")
            }
        }
        Section("Workspace") {
            detail("Business", profile.user.vendor?.businessName ?? "No business connected")
            detail("Call history permission", profile.capabilities.calls ? "Allowed by your role; product access is checked when opened" : "Not available for this account")
        }
        Section {
            webRow("Security & login", symbol: "lock.shield", path: "/vendor/profile?view=account")
            webRow("Profile picture", symbol: "person.crop.circle", path: "/vendor/profile?view=about")
            webRow("Inbox", symbol: "tray", path: "/vendor/profile?view=inbox")
            if profile.user.roles.contains("vendor") || profile.user.roles.contains("admin") {
                webRow("Team", symbol: "person.2", path: "/vendor/settings#team")
            }
            webRow("Access", symbol: "key", path: "/vendor/profile?view=access")
            webRow("Preferences", symbol: "slider.horizontal.3", path: "/vendor/profile/preferences")
        } header: {
            Text("More account settings")
        } footer: {
            Text("These settings open in the web workspace. Access is checked by the server.")
        }
    }

    private func detail(_ label: String, _ value: String?) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            Text(value?.isEmpty == false ? value! : "Not added").textSelection(.enabled)
        }.frame(minHeight: 44).accessibilityElement(children: .combine)
    }

    private func webRow(_ title: String, symbol: String, path: String) -> some View {
        Button { openWeb(path) } label: {
            HStack(alignment: .center, spacing: 12) {
                Image(systemName: symbol).frame(width: 24).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 3) {
                    Text(title).foregroundStyle(.primary)
                    Text("Open in web").font(.caption).foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                Image(systemName: "arrow.up.right").accessibilityHidden(true)
            }.frame(minHeight: 44)
        }.accessibilityLabel("\(title), Open in web")
    }
}

private struct WorkspaceEditorSelection: Identifiable {
    let id = UUID()
    let profile: WorkspaceProfile
}

@available(iOS 16.0, *)
@MainActor
private struct WorkspaceProfileEditor: View {
    @ObservedObject var model: WorkspaceModel
    let selection: WorkspaceEditorSelection
    @Environment(\.dismiss) private var dismiss
    @State private var edit: WorkspaceProfileEdit
    @State private var discardConfirmation = false
    @State private var attemptedSave = false
    @FocusState private var focus: Field?
    private enum Field: Hashable { case name, email, phone }

    init(model: WorkspaceModel, selection: WorkspaceEditorSelection) {
        self.model = model
        self.selection = selection
        _edit = State(initialValue: WorkspaceProfileEdit(name: selection.profile.user.name ?? "", email: selection.profile.user.email, phone: selection.profile.user.phone ?? ""))
    }

    private var dirty: Bool {
        edit.name != (selection.profile.user.name ?? "") || edit.email != selection.profile.user.email || edit.phone != (selection.profile.user.phone ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Personal information") {
                    VStack(alignment: .leading, spacing: 6) {
                    fieldLabel("Full name")
                    TextField("Full name", text: $edit.name)
                        .textContentType(.name).textInputAutocapitalization(.words)
                        .focused($focus, equals: .name).submitLabel(.next)
                        .onSubmit { focus = .email }
                        .accessibilityIdentifier("workspace-edit-name")
                        .frame(minHeight: 32)
                    }.padding(.vertical, 4)
                    VStack(alignment: .leading, spacing: 6) {
                    fieldLabel("Email address")
                    TextField("Email address", text: $edit.email)
                        .keyboardType(.emailAddress).textContentType(.emailAddress)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        .focused($focus, equals: .email).submitLabel(.next)
                        .onSubmit { focus = .phone }
                        .accessibilityIdentifier("workspace-edit-email")
                        .frame(minHeight: 32)
                    }.padding(.vertical, 4)
                    VStack(alignment: .leading, spacing: 6) {
                    fieldLabel("Phone number (optional)")
                    TextField("e.g. +1…", text: $edit.phone)
                        .keyboardType(.phonePad).textContentType(.telephoneNumber)
                        .focused($focus, equals: .phone)
                        .accessibilityLabel("Phone number, optional")
                        .accessibilityIdentifier("workspace-edit-phone")
                        .frame(minHeight: 32)
                    }.padding(.vertical, 4)
                }.disabled(model.saving || model.invalidated)
                Section {
                    Text("Use your full phone number, including the country code. Changing your email signs you out on all devices.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                if attemptedSave, let validation = edit.validation {
                    WorkspaceNotice(title: "Check your details", message: validation)
                }
                if attemptedSave, let error = model.error {
                    WorkspaceNotice(title: "Profile not saved", message: error)
                }
                if model.saving {
                    ProgressView("Saving and verifying…").frame(maxWidth: .infinity, minHeight: 44)
                }
                if dirty {
                    Text("You have unsaved changes. Use Cancel to discard them.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Edit profile")
            .navigationBarTitleDisplayMode(.inline)
            .scrollDismissesKeyboard(.interactively)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        if dirty { discardConfirmation = true } else { dismiss() }
                    }.fixedSize(horizontal: true, vertical: false).disabled(model.saving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        attemptedSave = true
                        guard edit.validation == nil else {
                            focus = edit.name.trimmingCharacters(in: .whitespacesAndNewlines).count < 2 ? .name : .email
                            return
                        }
                        focus = nil
                        Task { if await model.save(edit) { dismiss() } }
                    }
                    .fixedSize(horizontal: true, vertical: false)
                    .disabled(!dirty || model.saving || model.invalidated)
                    .accessibilityIdentifier("workspace-save-profile")
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { focus = nil }.frame(minWidth: 44, minHeight: 44)
                }
            }
            .confirmationDialog("Discard unsaved changes?", isPresented: $discardConfirmation, titleVisibility: .visible) {
                Button("Discard changes", role: .destructive) { dismiss() }
                Button("Keep editing", role: .cancel) { }
            }
        }
        .tint(WorkspaceStyle.accent)
        .interactiveDismissDisabled(dirty || model.saving)
    }

    private func fieldLabel(_ title: String) -> some View {
        Text(title).font(.caption).foregroundStyle(.secondary)
    }
}

@available(iOS 16.0, *)
@MainActor
private struct WorkspaceCallsView: View {
    @ObservedObject var model: WorkspaceModel
    @State private var query: WorkspaceCallsQuery
    @State private var expanded: String?
    @State private var transcriptCall: WorkspaceCall?

    init(model: WorkspaceModel, initialQuery: WorkspaceCallsQuery) {
        self.model = model
        _query = State(initialValue: initialQuery)
    }

    var body: some View {
        List {
            if model.invalidated {
                WorkspaceNotice(title: "Call history unavailable", message: model.error ?? "Reopen this screen to check your access.", symbol: "lock")
            } else {
                controls
                if let error = model.error {
                    Section {
                        WorkspaceNotice(title: "Could not load calls", message: error)
                        Button("Retry") { Task { await model.loadCalls(query, refresh: true) } }
                            .frame(minHeight: 44).disabled(model.loading)
                    }
                }
                if model.loading {
                    ProgressView("Loading calls…").frame(maxWidth: .infinity, minHeight: 64)
                }
                if model.pagination.calls.isEmpty && !model.loading && model.error == nil {
                    WorkspaceNotice(title: "No calls found", message: query.search.isEmpty && query.filter == "all" ? "Calls will appear here when they are available." : "Try a different search or filter.", symbol: "phone")
                }
                if !model.pagination.calls.isEmpty {
                    Section {
                        ForEach(model.pagination.calls) { call in
                            WorkspaceCallRow(model: model, call: call, expanded: Binding(
                                get: { expanded == call.id },
                                set: { expanded = $0 ? call.id : nil }
                            ), openTranscript: { transcriptCall = $0 })
                        }
                    } header: {
                        Text("\(model.pagination.calls.count) of \(model.pagination.totalCalls) calls")
                    }
                }
                if let error = model.pageError {
                    WorkspaceNotice(title: "Could not load more calls", message: error)
                }
                if model.pagination.hasMore {
                    Button {
                        Task { await model.loadMore(query) }
                    } label: {
                        HStack {
                            Spacer()
                            if model.paging { ProgressView() }
                            Text(model.paging ? "Loading more…" : model.pageError == nil ? "Load more calls" : "Retry loading more")
                            Spacer()
                        }.frame(minHeight: 44)
                    }
                    .disabled(model.paging || model.loading)
                    .accessibilityIdentifier("workspace-load-more")
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Call history")
        .searchable(text: $query.search, prompt: "Search calls")
        .scrollDismissesKeyboard(.interactively)
        .refreshable { await model.loadCalls(query, refresh: true) }
        .task(id: query) {
            expanded = nil
            await model.loadCalls(query, debounce: true)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            WorkspacePlayer(model: model, audio: model.audio)
        }
        .accessibilityIdentifier("workspace-call-history")
        .fullScreenCover(item: $transcriptCall) { selected in
            WorkspaceTranscriptScreen(model: model, call: selected)
        }
        .onChange(of: model.invalidated) { invalidated in
            if invalidated { transcriptCall = nil }
        }
    }

    private var controls: some View {
        Section("Find calls") {
            Picker("Status", selection: $query.filter) {
                Text("All calls").tag("all")
                Text("Completed").tag("completed")
                Text("Ended").tag("ended")
                Text("Finished").tag("finished")
                Text("Ringing").tag("ringing")
                Text("In progress").tag("in-progress")
                Text("Failed").tag("failed")
            }.frame(minHeight: 44)
            Picker("Sort", selection: $query.sort) {
                Text("Newest first").tag("timestamp-desc")
                Text("Oldest first").tag("timestamp-asc")
                Text("Longest first").tag("duration-desc")
                Text("Shortest first").tag("duration-asc")
                Text("Customer A–Z").tag("customerName-asc")
                Text("Customer Z–A").tag("customerName-desc")
                Text("Status A–Z").tag("status-asc")
                Text("Status Z–A").tag("status-desc")
            }.frame(minHeight: 44)
        }
    }
}

@available(iOS 16.0, *)
@MainActor
private struct WorkspaceCallRow: View {
    @ObservedObject var model: WorkspaceModel
    let call: WorkspaceCall
    @Binding var expanded: Bool
    let openTranscript: (WorkspaceCall) -> Void
    private var turns: [NativeCallTranscript.Turn] { NativeCallTranscript.parse(call.transcript) }

    var body: some View {
        DisclosureGroup(isExpanded: $expanded) {
            VStack(alignment: .leading, spacing: 16) {
                if !call.customerPhone.isEmpty {
                    Label(call.customerPhone, systemImage: "phone").textSelection(.enabled)
                }
                if let score = call.customerSatisfaction, score >= 1 && score <= 10 {
                    Text("Customer satisfaction: \(Int(score))/10").font(.subheadline)
                }
                if call.hasRecording {
                    if WorkspacePolicy.recordingURL(call.recordingUrl, callID: call.callId, origin: model.api.origin) != nil {
                        WorkspaceRecordingButton(model: model, audio: model.audio, call: call)
                    } else {
                        Text("This recording cannot be opened securely.").foregroundStyle(.secondary)
                    }
                } else {
                    Text("No recording available").foregroundStyle(.secondary)
                }
                VStack(alignment: .leading, spacing: 8) {
                    Text("Transcript").font(.headline)
                    if call.transcript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Text("No transcript available").foregroundStyle(.secondary)
                    } else {
                        ForEach(Array(turns.prefix(2))) { turn in
                            WorkspaceTranscriptBubble(turn: turn, preview: true)
                        }
                        Button("Open conversation") { openTranscript(call) }
                            .buttonStyle(.borderless)
                            .frame(minHeight: 44)
                            .accessibilityIdentifier("workspace-open-transcript-\(call.id)")
                        Text("\(turns.count) speaker turns").font(.caption).foregroundStyle(.secondary)
                    }
                }
            }.padding(.vertical, 12)
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                Text(call.customerName.isEmpty ? "Unknown caller" : call.customerName).font(.headline)
                if let date = call.date {
                    Text(date.formatted(date: .abbreviated, time: .shortened)).font(.subheadline).foregroundStyle(.secondary)
                } else {
                    Text(call.timestamp).font(.subheadline).foregroundStyle(.secondary)
                }
                Text("\(call.status.replacingOccurrences(of: "-", with: " ").capitalized) · \(call.durationFormatted)")
                    .font(.caption).foregroundStyle(.secondary)
            }.frame(minHeight: 44, alignment: .leading).padding(.vertical, 6)
        }
        .accessibilityIdentifier("workspace-call-\(call.id)")

    }
}

@available(iOS 16.0, *)
private struct WorkspaceTranscriptBubble: View {
    let turn: NativeCallTranscript.Turn
    var preview = false
    private var caller: Bool { turn.role == .caller }
    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            if caller { Spacer(minLength: 28) }
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    Label(turn.label, systemImage: caller ? "person.fill" : turn.role == .assistant ? "sparkles" : "text.bubble")
                        .font(.caption.weight(.semibold))
                    if let timestamp = turn.timestamp { Text(timestamp).font(.caption.monospacedDigit()) }
                }.foregroundStyle(.secondary)
                Text(verbatim: turn.text.isEmpty ? "No speech captured" : turn.text)
                    .font(.body).lineSpacing(4)
                    .lineLimit(preview ? 3 : nil)
                    .fixedSize(horizontal: false, vertical: true)
                    .textSelection(.enabled)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(caller ? WorkspaceStyle.accent.opacity(0.12) : Color(uiColor: .secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("transcript-turn-\(turn.id)")
            if !caller { Spacer(minLength: 28) }
        }
    }
}

@available(iOS 16.0, *)
@MainActor
private struct WorkspaceTranscriptScreen: View {
    @ObservedObject var model: WorkspaceModel
    let call: WorkspaceCall
    @Environment(\.dismiss) private var dismiss
    private var turns: [NativeCallTranscript.Turn] { NativeCallTranscript.parse(call.transcript) }
    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(call.customerName.isEmpty ? "Unknown caller" : call.customerName).font(.title2.weight(.semibold))
                        Text("\(call.status.capitalized) · \(call.durationFormatted)").font(.subheadline).foregroundStyle(.secondary)
                        Text("Call transcript").font(.caption).foregroundStyle(.secondary)
                        if call.hasRecording { WorkspaceRecordingButton(model: model, audio: model.audio, call: call) }
                    }.padding(.bottom, 8)
                    ForEach(turns) { WorkspaceTranscriptBubble(turn: $0) }
                }.padding(20)
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle("Conversation")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button { dismiss() } label: { Label("Calls", systemImage: "chevron.left") }
                        .accessibilityIdentifier("workspace-transcript-back")
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) { WorkspacePlayer(model: model, audio: model.audio) }
            .accessibilityIdentifier("workspace-transcript-conversation")
        }
        .tint(WorkspaceStyle.accent)
        .disabled(model.suspended)
        .onChange(of: model.invalidated) { invalidated in if invalidated { dismiss() } }
    }
}

@available(iOS 16.0, *)
@MainActor
private struct WorkspaceRecordingButton: View {
    @ObservedObject var model: WorkspaceModel
    @ObservedObject var audio: WorkspaceAudio
    let call: WorkspaceCall
    private var selected: Bool { audio.call?.id == call.id }

    var body: some View {
        Button {
            guard let scope = model.scope else { return }
            audio.toggle(call, api: model.api, scope: scope, failure: model.handle)
        } label: {
            Label(selected && audio.loading ? "Loading recording…" : selected && audio.playing ? "Pause recording" : selected && audio.error != nil ? "Retry recording" : "Play recording",
                  systemImage: selected && audio.playing ? "pause.fill" : "play.fill")
                .frame(minHeight: 44)
        }
        .buttonStyle(.borderless)
        .disabled(model.invalidated || model.scope == nil || (selected && audio.loading))
    }
}

@available(iOS 16.0, *)
@MainActor
private struct WorkspacePlayer: View {
    @ObservedObject var model: WorkspaceModel
    @ObservedObject var audio: WorkspaceAudio
    @State private var seeking = false
    @State private var seekPosition: Double = 0

    var body: some View {
        if let call = audio.call, !model.invalidated {
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .center) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Call recording").font(.caption).foregroundStyle(.secondary)
                        Text(call.customerName.isEmpty ? "Unknown caller" : call.customerName).font(.headline)
                    }
                    Spacer(minLength: 4)
                    Button { audio.stop() } label: {
                        Image(systemName: "xmark").frame(width: 44, height: 44)
                    }.accessibilityLabel("Stop and close recording")
                }
                if let error = audio.error {
                    Text(error).font(.footnote).foregroundStyle(.secondary)
                }
                HStack {
                    WorkspaceRecordingButton(model: model, audio: audio, call: call)
                    Spacer(minLength: 4)
                    if audio.loading { ProgressView().accessibilityLabel("Loading recording") }
                    Text("\(position(audio.elapsed)) / \(position(audio.duration))")
                        .font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                        .accessibilityLabel("\(position(audio.elapsed)) elapsed, \(position(audio.duration)) total")
                }
                Slider(value: Binding(get: { seeking ? seekPosition : min(audio.elapsed, max(audio.duration, 1)) }, set: { seekPosition = $0; if !seeking { audio.seek($0) } }),
                       in: 0...max(audio.duration, 1), onEditingChanged: { editing in
                    if editing { seekPosition = audio.elapsed }
                    else { audio.seek(seekPosition) }
                    seeking = editing
                })
                .frame(minHeight: 44)
                .disabled(audio.duration <= 0 || audio.loading || audio.error != nil)
                .accessibilityLabel("Recording position")
            }
            .padding(.horizontal, 16).padding(.vertical, 8)
            .background(.regularMaterial)
            .accessibilityIdentifier("workspace-shared-player")
            .onChange(of: audio.call?.id) { _ in seeking = false; seekPosition = 0 }
        }
    }

    private func position(_ seconds: Double) -> String {
        let whole = Int(max(0, seconds.isFinite ? seconds : 0))
        return String(format: "%d:%02d", whole / 60, whole % 60)
    }
}
