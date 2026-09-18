import SwiftUI
import MapKit

@available(iOS 16.0, *)
@MainActor
struct WorkspaceRentalsMapView: View {
    @ObservedObject var model: WorkspaceModel
    let openWeb: (String) -> Void
    @State private var search = ""
    @State private var status: String?
    @State private var selectedID: String?
    @State private var fitRevision = 0
    @State private var choosingRental = false
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @FocusState private var searching: Bool

    private var orders: [WorkspaceRental] { model.rentals?.filtered(search: search, status: status) ?? [] }
    private var selected: WorkspaceRental? { orders.first { $0.id == selectedID } }

    var body: some View {
        GeometryReader { geometry in
            VStack(spacing: 0) {
                controls
                WorkspaceRentalMap(orders: orders, selectedID: $selectedID, fitRevision: fitRevision)
                    .overlay(alignment: .topTrailing) {
                        Button {
                            searching = false
                            fitRevision += 1
                        } label: {
                            Image(systemName: "arrow.down.right.and.arrow.up.left")
                                .font(.system(size: 20, weight: .semibold)).frame(width: 48, height: 48)
                        }
                        .background(.regularMaterial, in: Circle())
                        .padding(12)
                        .disabled(orders.isEmpty)
                        .accessibilityLabel("Fit all visible rentals")
                        .accessibilityIdentifier("rentals-fit")
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                // A sibling, not a bottom overlay: MapKit's Apple/legal controls stay
                // visible and interactive at every Dynamic Type size and dock height.
                ScrollView {
                    summary.padding(.horizontal, 20).padding(.vertical, 14)
                }
                .frame(height: min(geometry.size.height * (dynamicTypeSize.isAccessibilitySize ? 0.48 : 0.40), dynamicTypeSize.isAccessibilitySize ? 330 : 220))
                .background(LinearGradient(colors: [Color(uiColor: .secondarySystemBackground), Color(uiColor: .systemBackground)], startPoint: .top, endPoint: .bottom))
            }
        }
        .background(Color(uiColor: .systemBackground))
        .navigationTitle("Rentals")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Menu {
                    Button("Refresh rentals") { Task { await model.loadRentals() } }
                    Button("Choose a rental") { choosingRental = true }
                        .disabled(orders.isEmpty)
                    Button("Rental list · Web") { open("/vendor/rentals") }
                } label: { Label("Rental options", systemImage: "ellipsis.circle") }
                .disabled(model.invalidated || model.suspended)
                .accessibilityIdentifier("rentals-options")
            }
        }
        .task { await model.loadRentals() }
        .onDisappear { model.leaveRentals() }
        .onChange(of: orders.map(\.id)) { ids in
            if !ids.contains(selectedID ?? "") { selectedID = ids.first }
            if ids.isEmpty { choosingRental = false }
        }
        .onChange(of: model.rentals?.generatedAt) { _ in
            if let status = status, model.rentals?.statuses.contains(status) == false { self.status = nil }
        }
        .sheet(isPresented: $choosingRental) {
            NavigationStack {
                List(orders) { rental in
                    Button {
                        selectedID = rental.id
                        choosingRental = false
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(rental.customerName ?? rental.label).font(.headline)
                            Text(rental.address ?? "Address unavailable").foregroundStyle(.secondary)
                            Text(rental.statusLabel).font(.caption)
                        }.padding(.vertical, 4)
                    }
                    .accessibilityIdentifier("rentals-choose-\(rental.id)")
                }
                .navigationTitle("Choose a rental")
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { choosingRental = false } } }
            }
        }
        .accessibilityIdentifier("workspace-rentals-map")
    }

    private var controls: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 4) { searchField; statusFilter }
            } else {
                HStack(spacing: 10) { searchField; statusFilter }
            }
        }
        .padding(.horizontal, 16)
        .background(.regularMaterial)
        .disabled(model.invalidated || model.suspended)
    }

    private var searchField: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass").font(.system(size: 18)).foregroundStyle(.secondary).accessibilityHidden(true)
            TextField("Search rentals", text: $search)
                .focused($searching).submitLabel(.search).onSubmit { searching = false }
                .autocorrectionDisabled()
                .accessibilityIdentifier("rentals-search")
            if !search.isEmpty {
                Button { search = "" } label: { Image(systemName: "xmark.circle.fill").frame(width: 44, height: 44) }
                    .accessibilityLabel("Clear rental search")
            }
        }
        .frame(minHeight: 44)
    }

    private var statusFilter: some View {
            Menu {
                Button("All statuses") { status = nil }
                ForEach(model.rentals?.statuses ?? [], id: \.self) { value in
                    Button(value.replacingOccurrences(of: "_", with: " ").capitalized) { status = value }
                }
            } label: {
                Label(status?.replacingOccurrences(of: "_", with: " ").capitalized ?? "Status", systemImage: "line.3.horizontal.decrease.circle")
                    .font(.subheadline).frame(minWidth: 44, minHeight: 44)
            }
            .accessibilityLabel("Filter rentals by status")
            .accessibilityValue(status ?? "All statuses")
            .accessibilityIdentifier("rentals-status-filter")
    }

    @ViewBuilder private var summary: some View {
        VStack(alignment: .leading, spacing: 8) {
            if model.invalidated {
                Label("Rentals unavailable", systemImage: "lock").font(.headline)
                Text(model.error ?? "Reopen this screen to check your access.").font(.subheadline)
                Button("Sign in again") { model.onExpired?() }.frame(minHeight: 44)
            } else if model.rentalsLoading || (model.rentals == nil && model.rentalsError == nil) {
                ProgressView("Loading rentals…").frame(minHeight: 44)
            } else if let error = model.rentalsError {
                Label("Could not load rentals", systemImage: "exclamationmark.triangle").font(.headline)
                Text(error).font(.subheadline).accessibilityIdentifier("rentals-error")
                Button("Retry") { Task { await model.loadRentals() } }
                    .frame(minHeight: 44).accessibilityIdentifier("rentals-retry")
                Button("Rental list · Web") { open("/vendor/rentals") }.frame(minHeight: 44)
            } else if let snapshot = model.rentals {
                Text("\(orders.count) shown · \(snapshot.totalRentalCount) total rentals")
                    .font(.caption).foregroundStyle(.secondary)
                    .accessibilityIdentifier("rentals-count")
                if let rental = selected {
                    rentalSummary(rental)
                } else {
                    Text(snapshot.totalRentalCount == 0 ? "No rentals yet" : orders.isEmpty && snapshot.count > 0 ? "No matching rentals" : "No mapped rentals")
                        .font(.headline).accessibilityIdentifier("rentals-empty")
                    Text(snapshot.count > 0 ? "Try another search or status." : "Rentals with valid coordinates will appear on the map.")
                        .font(.subheadline).foregroundStyle(.secondary)
                }
                if snapshot.unmappedCount > 0 {
                    Button { open("/vendor/rentals") } label: {
                        Text("\(snapshot.unmappedCount) without map coordinates · View list in web")
                            .font(.footnote).multilineTextAlignment(.leading).frame(minHeight: 44)
                    }.accessibilityIdentifier("rentals-unmapped")
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("rentals-summary")
    }

    private func rentalSummary(_ rental: WorkspaceRental) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top, spacing: 10) {
                Circle().fill(colorScheme == .dark ? Color.green : Color(uiColor: .systemGreen))
                    .frame(width: 12, height: 12).padding(.top, 5).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 4) {
                    Text(rental.customerName?.isEmpty == false ? rental.customerName! : rental.label)
                        .font(.headline).fixedSize(horizontal: false, vertical: true)
                    Text(rental.address?.isEmpty == false ? rental.address! : "Address unavailable")
                        .font(.subheadline).foregroundStyle(.secondary)
                    if let size = rental.dumpsterSize, !size.isEmpty {
                        Text("\(size) · \(rental.statusLabel)").font(.caption)
                    } else if rental.label != rental.customerName {
                        Text("\(rental.label) · \(rental.statusLabel)").font(.caption)
                    } else {
                        Text(rental.statusLabel).font(.caption)
                    }
                }
            }
            if let delivery = rental.deliveryDate { dateRow("Delivery", delivery) }
            if let pickup = rental.pickupDate { dateRow("Pickup", pickup) }
            Button("Rental details · Web") {
                guard let path = WorkspaceRentalsPolicy.detailPath(rental.href, origin: model.api.origin) else { return }
                open(path)
            }
            .frame(minHeight: 44)
            .accessibilityIdentifier("rentals-details")
        }.accessibilityIdentifier("rentals-selected-\(rental.id)")
    }

    private func dateRow(_ title: String, _ raw: String) -> some View {
        Text("\(title): \(WorkspaceRentalsPolicy.date(raw)?.formatted(date: .abbreviated, time: .omitted) ?? raw)")
            .font(.caption).foregroundStyle(.secondary)
    }

    private func open(_ path: String) {
        searching = false
        Task { await model.openRentalsWeb(path, open: openWeb) }
    }
}

// UIKit MapKit avoids the iOS 17-only SwiftUI Map API; no SDK keys, user tracking,
// location manager, or permission prompt. Appearance follows the containing window.
@available(iOS 16.0, *)
@MainActor
private struct WorkspaceRentalMap: UIViewRepresentable {
    let orders: [WorkspaceRental]
    @Binding var selectedID: String?
    let fitRevision: Int

    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeUIView(context: Context) -> MKMapView {
        let map = RentalMapCanvas(frame: .zero)
        map.onSizeChange = { [weak coordinator = context.coordinator] map in
            coordinator?.parent.fit(map)
        }
        let configuration = MKStandardMapConfiguration(elevationStyle: .flat, emphasisStyle: .muted)
        configuration.pointOfInterestFilter = .excludingAll
        configuration.showsTraffic = false
        map.preferredConfiguration = configuration
        map.showsUserLocation = false
        map.showsCompass = false
        map.isRotateEnabled = false
        map.isPitchEnabled = false
        map.delegate = context.coordinator
        map.register(RentalDot.self, forAnnotationViewWithReuseIdentifier: "rental-dot")
        map.accessibilityIdentifier = "rentals-map-canvas"
        map.setRegion(MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: 39, longitude: -98), span: MKCoordinateSpan(latitudeDelta: 45, longitudeDelta: 60)), animated: false)
        return map
    }
    func updateUIView(_ map: MKMapView, context: Context) {
        let coordinator = context.coordinator
        coordinator.parent = self
        let changed = coordinator.orders != orders
        if changed {
            map.removeAnnotations(map.annotations)
            map.addAnnotations(orders.map(RentalAnnotation.init))
            coordinator.orders = orders
        }
        for annotation in map.annotations.compactMap({ $0 as? RentalAnnotation }) {
            if annotation.rental.id == selectedID {
                map.selectAnnotation(annotation, animated: false)
            } else { map.deselectAnnotation(annotation, animated: false) }
        }
        if changed || coordinator.fitRevision != fitRevision {
            coordinator.fitRevision = fitRevision
            fit(map)
        }
    }
    static func dismantleUIView(_ map: MKMapView, coordinator: Coordinator) {
        map.delegate = nil
        (map as? RentalMapCanvas)?.onSizeChange = nil
        map.removeAnnotations(map.annotations)
        coordinator.orders = []
    }
    private func fit(_ map: MKMapView) {
        guard !orders.isEmpty else { return }
        var rect = MKMapRect.null
        for rental in orders {
            // Mercator display caps its poles; the DTO still retains the real coordinate.
            let point = MKMapPoint(CLLocationCoordinate2D(latitude: min(85, max(-85, rental.lat)), longitude: rental.lng))
            rect = rect.union(MKMapRect(x: point.x - 2000, y: point.y - 2000, width: 4000, height: 4000))
        }
        // Leave room for the fit control and native Apple attribution. The summary
        // and search are siblings, so no private subview/legal-label manipulation.
        map.setVisibleMapRect(rect, edgePadding: UIEdgeInsets(top: 76, left: 36, bottom: 44, right: 36), animated: !UIAccessibility.isReduceMotionEnabled)
    }

    // Refit only when the actual bounds change, never just because a user pans.
    final class RentalMapCanvas: MKMapView {
        var onSizeChange: ((MKMapView) -> Void)?
        private var lastSize = CGSize.zero
        override func layoutSubviews() {
            super.layoutSubviews()
            guard bounds.width > 0, bounds.height > 0, bounds.size != lastSize else { return }
            lastSize = bounds.size
            DispatchQueue.main.async { [weak self] in
                guard let self = self else { return }
                self.onSizeChange?(self)
            }
        }
    }

    final class Coordinator: NSObject, MKMapViewDelegate {
        var parent: WorkspaceRentalMap
        var orders: [WorkspaceRental] = []
        var fitRevision = -1
        init(_ parent: WorkspaceRentalMap) { self.parent = parent }
        func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
            guard let annotation = annotation as? RentalAnnotation else { return nil }
            let view = mapView.dequeueReusableAnnotationView(withIdentifier: "rental-dot", for: annotation)
            view.accessibilityLabel = [annotation.rental.customerName ?? annotation.rental.label, annotation.rental.address, annotation.rental.statusLabel].compactMap { $0 }.joined(separator: ", ")
            view.accessibilityHint = "Select rental to show details below the map"
            view.accessibilityIdentifier = "rentals-pin-\(annotation.rental.id)"
            return view
        }
        func mapView(_ mapView: MKMapView, didSelect view: MKAnnotationView) {
            guard let rental = (view.annotation as? RentalAnnotation)?.rental, parent.selectedID != rental.id else { return }
            // Avoid publishing SwiftUI state synchronously from updateUIView.
            DispatchQueue.main.async { [weak self] in
                guard let self = self, self.orders.contains(where: { $0.id == rental.id }) else { return }
                self.parent.selectedID = rental.id
            }
        }
    }

    final class RentalAnnotation: NSObject, MKAnnotation {
        let rental: WorkspaceRental
        var coordinate: CLLocationCoordinate2D { .init(latitude: rental.lat, longitude: rental.lng) }
        var title: String? { rental.label }
        init(_ rental: WorkspaceRental) { self.rental = rental }
    }

    final class RentalDot: MKAnnotationView {
        private let dot = UIView()
        override init(annotation: MKAnnotation?, reuseIdentifier: String?) {
            super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)
            frame = CGRect(x: 0, y: 0, width: 44, height: 44)
            addSubview(dot)
            canShowCallout = false
            isAccessibilityElement = true
            displayPriority = .required
            collisionMode = .circle
            updateDot()
        }
        required init?(coder: NSCoder) { fatalError("Storyboard initialization is unsupported") }
        override func setSelected(_ selected: Bool, animated: Bool) {
            super.setSelected(selected, animated: animated)
            updateDot()
        }
        private func updateDot() {
            let size: CGFloat = isSelected ? 20 : 12
            dot.frame = CGRect(x: (44 - size) / 2, y: (44 - size) / 2, width: size, height: size)
            dot.layer.cornerRadius = size / 2
            dot.backgroundColor = isSelected ? .systemGreen : .systemIndigo
            dot.layer.borderWidth = isSelected ? 3 : 1
            dot.layer.borderColor = UIColor.white.withAlphaComponent(isSelected ? 0.95 : 0.6).cgColor
            layer.zPosition = isSelected ? 1 : 0
            accessibilityTraits = isSelected ? [.button, .selected] : [.button]
        }
    }
}
