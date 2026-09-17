import SwiftUI
import Charts

/// API-owned data with local interaction state. Appearance redraws never re-fetch,
/// recreate the model, clear the selected month, or dismiss another native screen.
@available(iOS 16.0, *)
@MainActor
struct WorkspaceDashboardView: View {
    @ObservedObject var model: WorkspaceModel
    @State private var period = Period.month
    @State private var selectedMonth: String?
    @State private var showsRows = false
    private enum Period: String, CaseIterable, Identifiable {
        case month = "Month", year = "Year"
        var id: String { rawValue }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if model.invalidated {
                    notice("Dashboard unavailable", model.error ?? "Reopen the dashboard to check your workspace.", symbol: "lock")
                    if let reopen = model.onReopen {
                        Button("Reopen dashboard", action: reopen)
                            .frame(minHeight: 44).accessibilityIdentifier("dashboard-reopen")
                    }
                } else {
                    if let notificationError = model.notificationError {
                        notice("Notifications", notificationError, symbol: "bell.badge")
                    }
                    if let error = model.error {
                        notice("Could not refresh dashboard", error, symbol: "exclamationmark.triangle")
                        Button("Retry") { Task { await model.loadDashboard() } }
                            .disabled(model.loading).frame(minHeight: 44)
                            .accessibilityIdentifier("dashboard-retry")
                    }
                    if let snapshot = model.dashboard {
                        header(snapshot)
                        revenue(snapshot)
                        metrics(snapshot)
                        inventory(snapshot)
                        Text("Revenue in \(snapshot.currency). Pull down to refresh.")
                            .font(.footnote).foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("dashboard-scroll-end")
                    } else if model.loading || model.error == nil {
                        ProgressView("Loading dashboard…")
                            .frame(maxWidth: .infinity, minHeight: 160)
                            .accessibilityIdentifier("dashboard-loading")
                    }
                }
            }.padding(20)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle("Dashboard")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("workspace-dashboard")
        .refreshable { await model.loadDashboard() }
        .task { if model.dashboard == nil { await model.loadDashboard() } }
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button { Task { await model.loadDashboard() } } label: { Image(systemName: "arrow.clockwise") }
                    .accessibilityLabel("Refresh dashboard").accessibilityIdentifier("dashboard-refresh")
                    .disabled(model.loading || model.invalidated)
            }
        }
    }

    private func header(_ data: WorkspaceDashboard) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(data.businessName.isEmpty ? "Your business" : data.businessName)
                .font(.title2.weight(.semibold)).accessibilityAddTraits(.isHeader)
            Text("Business overview").font(.subheadline).foregroundStyle(.secondary)
            if model.loading { ProgressView("Refreshing…").font(.caption) }
        }
    }

    private func revenue(_ data: WorkspaceDashboard) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .firstTextBaseline) {
                Text("Revenue").font(.headline)
                Spacer()
                Text(data.currency).font(.caption).foregroundStyle(.secondary)
            }
            Picker("Revenue period", selection: $period) {
                ForEach(Period.allCases) { Text($0.rawValue).tag($0) }
            }.pickerStyle(.segmented).accessibilityIdentifier("dashboard-period")
            VStack(alignment: .leading, spacing: 4) {
                Text(money(period == .month ? data.revenue.thisMonth : data.revenue.thisYear))
                    .font(.largeTitle.weight(.semibold)).monospacedDigit()
                    .minimumScaleFactor(0.65).lineLimit(1)
                    .accessibilityIdentifier("dashboard-revenue-amount")
                Text(period == .month ? "This month" : "This year").font(.subheadline).foregroundStyle(.secondary)
                if period == .month, let growth = data.revenue.monthlyGrowthPercent {
                    Text("\(growth.formatted(.number.precision(.fractionLength(1))))% vs previous month")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }.accessibilityElement(children: .combine)
            Divider()
            Text("Monthly revenue").font(.subheadline.weight(.semibold))
            if data.monthlyRevenue.isEmpty {
                notice("No monthly revenue data", "Monthly totals will appear when available.", symbol: "chart.bar")
            } else {
                chart(data.monthlyRevenue)
                if let chosen = data.monthlyRevenue.first(where: { $0.month == selectedMonth }) {
                    Text("\(chosen.month): \(money(chosen.revenue))")
                        .font(.subheadline.weight(.medium)).monospacedDigit()
                        .accessibilityIdentifier("dashboard-selected-month")
                } else {
                    Text("Tap a bar to inspect a month.").font(.caption).foregroundStyle(.secondary)
                }
                if data.monthlyRevenue.allSatisfy({ $0.revenue == 0 }) {
                    Text("No revenue recorded in these months.").font(.footnote).foregroundStyle(.secondary)
                }
                DisclosureGroup("Monthly revenue data", isExpanded: $showsRows) {
                    VStack(spacing: 0) {
                        ForEach(data.monthlyRevenue) { month in
                            Button { selectedMonth = month.month } label: {
                                HStack {
                                    Text(month.month)
                                    Spacer(minLength: 8)
                                    Text(money(month.revenue)).monospacedDigit()
                                    if selectedMonth == month.month { Image(systemName: "checkmark").accessibilityHidden(true) }
                                }.frame(minHeight: 44).contentShape(Rectangle())
                            }
                            .buttonStyle(.borderless)
                            .accessibilityLabel("\(month.month), \(money(month.revenue))")
                            .accessibilityAddTraits(selectedMonth == month.month ? .isSelected : [])
                            .accessibilityIdentifier("dashboard-month-\(month.month)")
                        }
                    }
                }.accessibilityIdentifier("dashboard-monthly-data")
            }
        }.dashboardCard()
    }

    private func chart(_ months: [WorkspaceDashboard.Month]) -> some View {
        Chart(months) { month in
            BarMark(x: .value("Month", month.month), y: .value("Revenue", month.revenue))
                .foregroundStyle(WorkspaceStyle.accent.opacity(selectedMonth == nil || selectedMonth == month.month ? 1 : 0.35))
                .cornerRadius(4)
                .accessibilityLabel(month.month)
                .accessibilityValue(money(month.revenue))
        }
        .chartYScale(domain: min(0, months.map(\.revenue).min() ?? 0)...max(1, months.map(\.revenue).max() ?? 1))
        .chartXAxis {
            AxisMarks(values: months.map(\.month)) { value in
                AxisValueLabel {
                    if let label = value.as(String.self) { Text(shortMonth(label)).font(.caption2) }
                }
            }
        }
        .chartOverlay { proxy in
            GeometryReader { geometry in
                Rectangle().fill(.clear).contentShape(Rectangle())
                    .onTapGesture { location in
                        let frame = geometry[proxy.plotAreaFrame]
                        guard frame.contains(location) else { return }
                        if let month: String = proxy.value(atX: location.x - frame.minX), months.contains(where: { $0.month == month }) {
                            selectedMonth = month
                        }
                    }
                    .accessibilityHidden(true)
            }
        }
        .frame(height: 210)
        .accessibilityIdentifier("dashboard-revenue-chart")
    }

    private func metrics(_ data: WorkspaceDashboard) -> some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 145), alignment: .leading)], spacing: 12) {
            metric("Rentals", value: data.rentals.total, detail: "\(data.rentals.active) active · \(data.rentals.pending) pending", symbol: "truck.box")
            metric("Customers", value: data.customers.total, detail: "Total customers", symbol: "person.2")
            metric("Available", value: data.inventory.available, detail: "of \(data.inventory.total) inventory", symbol: "shippingbox")
            metric("Completed", value: data.rentals.completed, detail: "Completed rentals", symbol: "checkmark.circle")
        }
    }

    private func metric(_ title: String, value: Int, detail: String, symbol: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(title, systemImage: symbol).font(.subheadline).foregroundStyle(.secondary)
            Text(value.formatted()).font(.title.weight(.semibold)).monospacedDigit()
            Text(detail).font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .dashboardCard().accessibilityElement(children: .combine)
    }

    private func inventory(_ data: WorkspaceDashboard) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Inventory breakdown").font(.headline).accessibilityAddTraits(.isHeader)
            Text("\(data.inventory.available) available · \(data.inventory.rented) rented · \(data.inventory.maintenance) unavailable")
                .font(.subheadline).foregroundStyle(.secondary)
            if data.inventoryByType.isEmpty {
                Text(data.inventory.total == 0 ? "No inventory yet." : "No inventory type breakdown available.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(Array(data.inventoryByType.enumerated()), id: \.offset) { _, item in
                    HStack {
                        Text(item.name.isEmpty ? "Unspecified type" : item.name)
                        Spacer()
                        Text(item.count.formatted()).monospacedDigit().fontWeight(.semibold)
                    }.accessibilityElement(children: .combine)
                }
            }
        }.dashboardCard().accessibilityIdentifier("dashboard-inventory")
    }

    private func notice(_ title: String, _ message: String, symbol: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(title, systemImage: symbol).font(.headline)
            Text(message).font(.subheadline).foregroundStyle(.secondary)
        }.frame(maxWidth: .infinity, alignment: .leading).accessibilityElement(children: .combine)
    }
    private func money(_ amount: Double) -> String { amount.formatted(.currency(code: "USD")) }
    private func shortMonth(_ raw: String) -> String {
        // Display only; the full exact server label remains the chart key and AX label.
        String(raw.prefix(3))
    }
}

@available(iOS 16.0, *)
private extension View {
    func dashboardCard() -> some View {
        padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(uiColor: .secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}
