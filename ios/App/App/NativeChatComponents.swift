import SwiftUI
import MapKit

struct NativeChatPalette {
    static let primary = Color(NativeAdaptivePalette.accent)
    static let fill = Color(NativeAdaptivePalette.fill)
    static func color(_ hex: String?, role: NativeAdaptivePalette.Role = .foreground, surface: String? = nil) -> Color? {
        NativeAdaptivePalette.color(hex, role: role, surface: surface).map { Color($0) }
    }
}

struct NativeBrandedSurfaceKey: EnvironmentKey { static let defaultValue: String? = nil }
extension EnvironmentValues {
    var nativeBrandedSurface: String? {
        get { self[NativeBrandedSurfaceKey.self] }
        set { self[NativeBrandedSurfaceKey.self] = newValue }
    }
}

/// Recursive type erasure is deliberately limited to this bounded schema tree.
/// IDs do not include revision, so editing/focus and native maps survive updates.
struct NativeComponentView: View {
    let node: NativeComponentNode
    let state: NativeChatState
    let configured: URL
    let onAction: (String, String?) -> Void
    @Environment(\.nativeBrandedSurface) private var inheritedBrand
    private var brandedSurface: String? {
        node.style?.background ?? inheritedBrand
    }
    private var enabled: Bool { node.disabled != true && node.actionId.map { state.offers($0) } == true }
    var body: some View {
        Group {
        if let box = node.box {
            NativeMeasuredComponent(node: node, state: state, configured: configured, onAction: onAction, inheritedSurface: brandedSurface)
                .frame(height: CGFloat(box.height)).frame(maxWidth: .infinity, alignment: .leading)
        } else {
        content
            .font(.system(size: CGFloat(node.style?.fontSize ?? 15), weight: weight))
            .foregroundColor(NativeChatPalette.color(node.style?.foreground, surface: brandedSurface))
            .padding(CGFloat(node.style?.padding ?? (node.type == "card" ? 12 : 0)))
            .background(NativeChatPalette.color(node.style?.background, role: .background) ?? (node.type == "card" ? Color(.tertiarySystemBackground) : .clear))
            .clipShape(RoundedRectangle(cornerRadius: CGFloat(node.style?.radius ?? (node.type == "card" ? 12 : 0))))
            .accessibilityIdentifier("trashed-native-node-" + node.id)
            .environment(\.nativeBrandedSurface, brandedSurface)
        }
        }
    }
    private var weight: Font.Weight {
        switch node.style?.fontWeight { case "bold": return .bold; case "semibold": return .semibold; case "medium": return .medium; default: return .regular }
    }
    @ViewBuilder private var content: some View {
        switch node.type {
        case "text": NativeChatText(text: node.text ?? "")
        case "inline":
            if #available(iOS 15.0, *) { inlineText(node).textSelection(.enabled).fixedSize(horizontal: false, vertical: true) }
            else { inlineText(node).fixedSize(horizontal: false, vertical: true) }
        case "badge": Text(node.text ?? "").font(.caption.weight(.semibold)).padding(.horizontal, 8).padding(.vertical, 4).background(NativeChatPalette.primary.opacity(0.12)).clipShape(Capsule())
        case "row":
            HStack(alignment: .top, spacing: CGFloat(node.style?.gap ?? 8)) { children }
        case "column", "card", "list":
            VStack(alignment: .leading, spacing: CGFloat(node.style?.gap ?? 8)) {
                if let text = node.text, !text.isEmpty { NativeChatText(text: text) }
                children
            }.frame(maxWidth: .infinity, alignment: .leading)
        case "button", "link":
            Button(action: perform) {
                VStack(alignment: .leading, spacing: 4) {
                    if let text = node.text, !text.isEmpty { Text(text) }
                    children
                }.frame(minHeight: 44)
            }.buttonStyle(.plain).foregroundColor(NativeChatPalette.color(node.style?.foreground, surface: brandedSurface) ?? NativeChatPalette.primary).disabled(!enabled)
        case "input":
            NativeComponentInput(node: node, enabled: enabled, onAction: onAction)
        case "image":
            if let raster = node.props?.raster, let data = NativeChatPolicy.rasterData(raster), let image = UIImage(data: data) {
                Image(uiImage: image).resizable().scaledToFit().accessibilityLabel(node.accessibilityLabel ?? node.text ?? "Image")
            } else if let url = node.props?.src.flatMap({ NativeChatPolicy.safeImageURL($0, configured: configured) }) {
                NativeComponentImage(url: url, label: node.text ?? "Image", configured: configured)
            }
        case "map":
            VStack(alignment: .leading, spacing: 6) {
                if let text = node.text { Text(text).font(.headline) }
                NativeChatMap(markers: node.props?.markers ?? [], lines: node.props?.lines ?? [])
                    .frame(height: 240).clipShape(RoundedRectangle(cornerRadius: 12))
                    .accessibilityIdentifier("trashed-native-map-" + node.id)
                if (node.props?.markers ?? []).isEmpty && (node.props?.lines ?? []).isEmpty { Text("No map locations available").font(.caption).foregroundColor(.secondary) }
            }
        default: EmptyView() // Unreachable after strict policy validation.
        }
    }
    private var children: some View {
        ForEach(node.children ?? []) { child in
            AnyView(NativeComponentView(node: child, state: state, configured: configured, onAction: onAction))
        }
    }
    private func inlineText(_ value: NativeComponentNode) -> Text {
        var result = Text(value.text ?? "")
        for child in value.children ?? [] { result = result + inlineText(child) }
        let weight: Font.Weight = value.style?.fontWeight == "bold" ? .bold : value.style?.fontWeight == "semibold" ? .semibold : value.style?.fontWeight == "medium" ? .medium : .regular
        return result.font(.system(size: CGFloat(value.style?.fontSize ?? node.style?.fontSize ?? 15), weight: weight))
            .foregroundColor(NativeChatPalette.color(value.style?.foreground, surface: brandedSurface) ?? NativeChatPalette.color(node.style?.foreground, surface: brandedSurface))
    }
    private func perform() { if enabled, let id = node.actionId { onAction(id, node.value) } }
}

struct NativeChatText: View {
    let text: String
    var body: some View {
        Group {
            if #available(iOS 15.0, *), let value = try? AttributedString(markdown: text, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)) {
                // Markdown links are text, not a second unvalidated URL command channel.
                Text(removingLinks(value)).textSelection(.enabled)
            } else { Text(text) }
        }.fixedSize(horizontal: false, vertical: true)
    }
    @available(iOS 15.0, *) private func removingLinks(_ value: AttributedString) -> AttributedString {
        var value = value
        for run in value.runs where run.link != nil { value[run.range].link = nil }
        return value
    }
}

private struct NativeComponentInput: View {
    let node: NativeComponentNode
    let enabled: Bool
    let onAction: (String, String?) -> Void
    @State private var buffer: NativeDraftBuffer
    init(node: NativeComponentNode, enabled: Bool, onAction: @escaping (String, String?) -> Void) {
        self.node = node; self.enabled = enabled; self.onAction = onAction
        _buffer = State(initialValue: NativeDraftBuffer(value: node.value ?? ""))
    }
    private var binding: Binding<String> { Binding(get: { buffer.value }, set: change) }
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if node.props?.inputType == "textarea" {
                ZStack(alignment: .topLeading) {
                    TextEditor(text: binding).frame(minHeight: 96, maxHeight: 120)
                    if buffer.value.isEmpty { Text(node.props?.placeholder ?? "").foregroundColor(.secondary).padding(.top, 8).padding(.leading, 5).allowsHitTesting(false).accessibilityHidden(true) }
                }
            } else if node.props?.inputType == "date" {
                DatePicker(node.props?.placeholder ?? "Choose date", selection: Binding(get: {
                    Self.dateFormatter.date(from: buffer.value) ?? Date()
                }, set: { change(Self.dateFormatter.string(from: $0)) }), displayedComponents: .date)
                    .datePickerStyle(.compact)
                if buffer.value.isEmpty {
                    Button("Use today") { change(Self.dateFormatter.string(from: Date())) }
                } else { Button("Clear date") { change("") } }
            } else {
                TextField(node.props?.placeholder ?? node.text ?? "", text: binding)
                    .keyboardType(keyboard).textFieldStyle(.roundedBorder)
            }
        }
        .disabled(!enabled)
        .accessibilityLabel(node.text ?? node.props?.placeholder ?? "Input")
        .accessibilityIdentifier("trashed-native-input-" + node.id)
        .onChange(of: node.value ?? "") { buffer.receive($0) }
    }
    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian); formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false; return formatter
    }()
    private var keyboard: UIKeyboardType {
        switch node.props?.inputType { case "email": return .emailAddress; case "phone": return .phonePad; case "number": return .decimalPad; default: return .default }
    }
    private func change(_ value: String) {
        guard enabled, NativeChatPolicy.text(value, max: 4000, empty: true) != nil, let id = node.actionId else { return }
        buffer.edit(value); onAction(id, value)
    }
}

struct NativeChatMap: UIViewRepresentable {
    let markers: [NativeMapMarker]
    let lines: [NativeMapLine]
    func makeCoordinator() -> Coordinator { Coordinator() }
    func makeUIView(context: Context) -> MKMapView {
        let view = MKMapView(); view.delegate = context.coordinator
        view.showsUserLocation = false // No new location permission or tracking.
        view.isRotateEnabled = false
        return view
    }
    func updateUIView(_ view: MKMapView, context: Context) {
        let c = context.coordinator
        guard c.markers != markers || c.lines != lines else { return }
        c.markers = markers; c.lines = lines
        view.removeAnnotations(view.annotations); view.removeOverlays(view.overlays)
        view.addAnnotations(markers.map { marker in
            let a = MKPointAnnotation(); a.title = marker.label; a.coordinate = CLLocationCoordinate2D(latitude: marker.latitude, longitude: marker.longitude); return a
        })
        var mapRect = MKMapRect.null
        for line in lines where line.points.count >= 2 {
            let points = line.points.map { CLLocationCoordinate2D(latitude: $0.latitude, longitude: $0.longitude) }
            let overlay = MKPolyline(coordinates: points, count: points.count)
            mapRect = mapRect.union(overlay.boundingMapRect); view.addOverlay(overlay)
        }
        for marker in markers {
            let point = MKMapPoint(CLLocationCoordinate2D(latitude: marker.latitude, longitude: marker.longitude))
            mapRect = mapRect.union(MKMapRect(x: point.x - 800, y: point.y - 800, width: 1600, height: 1600))
        }
        if !mapRect.isNull { view.setVisibleMapRect(mapRect, edgePadding: UIEdgeInsets(top: 30, left: 30, bottom: 30, right: 30), animated: false) }
    }
    final class Coordinator: NSObject, MKMapViewDelegate {
        var selected: ((String) -> Void)?
        var markers: [NativeMapMarker]?
        var lines: [NativeMapLine]?
        func mapView(_ mapView: MKMapView, didSelect view: MKAnnotationView) {
            guard let annotation = view.annotation,
                  let marker = markers?.first(where: { abs($0.latitude - annotation.coordinate.latitude) < 0.000001 && abs($0.longitude - annotation.coordinate.longitude) < 0.000001 }) else { return }
            selected?(marker.id)
        }
        func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            guard let line = overlay as? MKPolyline else { return MKOverlayRenderer(overlay: overlay) }
            let renderer = MKPolylineRenderer(polyline: line)
            renderer.strokeColor = UIColor(red: 112 / 255, green: 51 / 255, blue: 1, alpha: 1); renderer.lineWidth = 4
            return renderer
        }
    }
}
