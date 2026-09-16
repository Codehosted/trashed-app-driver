import SwiftUI
import MapKit
import Combine

/// Browser-measured boxes contain all layout. Stable UIKit children retain IME/focus.
struct NativeMeasuredComponent: UIViewRepresentable {
    let node: NativeComponentNode
    let state: NativeChatState
    let configured: URL
    let onAction: (String, String?) -> Void
    func makeUIView(context: Context) -> NativeMeasuredRoot { NativeMeasuredRoot() }
    func updateUIView(_ view: NativeMeasuredRoot, context: Context) {
        view.isUserInteractionEnabled = context.environment.isEnabled
        view.update(node, state: state, configured: configured, onAction: onAction)
    }
}
final class NativeMeasuredRoot: UIView {
    private var root: NativeMeasuredNode?
    private var reference = CGSize.zero
    func update(_ node: NativeComponentNode, state: NativeChatState, configured: URL, onAction: @escaping (String, String?) -> Void) {
        if root?.nodeID != node.id { root?.removeFromSuperview(); root = NativeMeasuredNode(node); addSubview(root!) }
        reference = CGSize(width: node.box?.width ?? 0, height: node.box?.height ?? 0)
        root?.update(node, state: state, configured: configured, onAction: onAction)
        setNeedsLayout()
    }
    override func layoutSubviews() {
        super.layoutSubviews()
        guard let root = root else { return }
        let ratio = reference.width > 0 ? bounds.width / reference.width : 1
        // Larger changes require fresh projection, not stretched typography.
        let scale: CGFloat = abs(ratio - 1) <= 0.02 ? ratio : 1
        root.transform = .identity; root.frame = CGRect(origin: .zero, size: reference)
        root.transform = CGAffineTransform(scaleX: scale, y: scale); root.frame.origin = .zero
    }
}
final class NativeMeasuredNode: UIView, UITextViewDelegate {
    let nodeID: String
    private let kind: String
    private var node: NativeComponentNode
    private var nodes: [String: NativeMeasuredNode] = [:]
    private var label: UILabel?
    private var editor: UITextView?
    private var placeholder: UILabel?
    private var button: UIButton?
    private var imageView: UIImageView?
    private var map: MKMapView?
    private let mapDelegate = NativeChatMap.Coordinator()
    private var imageLoader: NativeChatImageLoader?
    private var imageSubscription: AnyCancellable?
    private var imageKey: String?
    private var buffer: NativeDraftBuffer
    private var perform: ((String, String?) -> Void)?
    private var enabled = false
    private var datePicker: UIDatePicker?
    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false
        return formatter
    }()
    init(_ node: NativeComponentNode) {
        self.node = node; nodeID = node.id; kind = node.type
        buffer = NativeDraftBuffer(value: node.value ?? "")
        super.init(frame: .zero)
        accessibilityIdentifier = "trashed-native-node-" + node.id
        if node.type == "input" {
            let view = UITextView(); view.delegate = self; view.backgroundColor = .clear
            view.textContainer.lineFragmentPadding = 0; view.isScrollEnabled = true
            view.adjustsFontForContentSizeCategory = false
            view.accessibilityIdentifier = "trashed-native-input-" + node.id
            editor = view; addSubview(view)
            let hint = UILabel(); hint.numberOfLines = 0; hint.isUserInteractionEnabled = false; hint.isAccessibilityElement = false
            placeholder = hint; addSubview(hint)
        } else if node.type == "image" {
            let view = UIImageView(); view.contentMode = .scaleToFill; imageView = view; addSubview(view)
        } else if node.type == "map" {
            let view = MKMapView(); view.delegate = mapDelegate; view.showsUserLocation = false
            map = view; addSubview(view)
        } else {
            let view = UILabel(); view.numberOfLines = 0; view.isUserInteractionEnabled = false
            view.lineBreakMode = .byClipping; label = view; addSubview(view)
        }
        if ["button", "link"].contains(node.type) {
            let view = UIButton(type: .custom); view.contentEdgeInsets = .zero
            view.addTarget(self, action: #selector(tapped), for: .touchUpInside)
            button = view; addSubview(view)
        }
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    private func color(_ hex: String?) -> UIColor? {
        guard let value = hex.flatMap({ UInt32($0.dropFirst(), radix: 16) }) else { return nil }
        return UIColor(red: CGFloat((value >> 16) & 255)/255, green: CGFloat((value >> 8) & 255)/255, blue: CGFloat(value & 255)/255, alpha: 1)
    }
    private var font: UIFont {
        let size = CGFloat(node.style?.fontSize ?? 15)
        let weight: UIFont.Weight = node.style?.fontWeight == "bold" ? .bold : node.style?.fontWeight == "semibold" ? .semibold : node.style?.fontWeight == "medium" ? .medium : .regular
        if node.style?.fontFamily == "arial" { return UIFont(name: weight == .regular ? "ArialMT" : "Arial-BoldMT", size: size) ?? .systemFont(ofSize: size, weight: weight) }
        if node.style?.fontFamily == "mono" { return .monospacedSystemFont(ofSize: size, weight: weight) }
        if node.style?.fontFamily == "jakarta" {
            let suffix = weight == .bold ? "Bold" : weight == .semibold ? "SemiBold" : weight == .medium ? "Medium" : "Regular"
            return UIFont(name: "TrashedJakarta-" + suffix, size: size) ?? .systemFont(ofSize: size, weight: weight)
        }
        if node.style?.fontFamily == "geist", let font = UIFont(name: "Geist-Regular", size: size) { return font }
        return .systemFont(ofSize: size, weight: weight)
    }
    private var attributes: [NSAttributedString.Key: Any] {
        let paragraph = NSMutableParagraphStyle()
        paragraph.alignment = node.style?.textAlign == "center" ? .center : node.style?.textAlign == "right" ? .right : .left
        // The webpage already split text into measured line fragments. Reflowing
        // a fragment at a subpixel boundary drops its final word into a clipped line.
        paragraph.lineBreakMode = node.type == "text" && node.box != nil ? .byClipping : .byWordWrapping
        if let height = node.style?.lineHeight { paragraph.minimumLineHeight = CGFloat(height); paragraph.maximumLineHeight = CGFloat(height) }
        return [.font: font, .foregroundColor: color(node.style?.foreground) ?? UIColor.label,
                .kern: node.style?.letterSpacing ?? 0, .paragraphStyle: paragraph]
    }
    private var insets: UIEdgeInsets {
        let s = node.style
        return UIEdgeInsets(top: CGFloat(s?.paddingTop ?? s?.padding ?? 0), left: CGFloat(s?.paddingLeft ?? s?.padding ?? 0), bottom: CGFloat(s?.paddingBottom ?? s?.padding ?? 0), right: CGFloat(s?.paddingRight ?? s?.padding ?? 0))
    }
    func update(_ value: NativeComponentNode, state: NativeChatState, configured: URL, onAction: @escaping (String, String?) -> Void) {
        node = value; perform = onAction
        enabled = node.disabled != true && node.actionId.map(state.offers) == true
        backgroundColor = color(node.style?.background) ?? .clear
        alpha = CGFloat(node.style?.opacity ?? 1)
        layer.cornerRadius = CGFloat(node.style?.radius ?? 0)
        layer.borderWidth = CGFloat(node.style?.borderWidth ?? 0)
        layer.borderColor = color(node.style?.borderColor)?.cgColor
        clipsToBounds = layer.cornerRadius > 0
        let spoken = node.accessibilityLabel ?? node.text ?? node.props?.placeholder ?? ""
        isAccessibilityElement = button == nil && editor == nil && (node.children ?? []).isEmpty && !spoken.isEmpty
        accessibilityLabel = spoken
        label?.isAccessibilityElement = false
        label?.numberOfLines = node.type == "text" && node.box != nil ? 1 : 0
        let visualText = button != nil && !(node.children ?? []).isEmpty ? "" : node.text ?? ""
        label?.attributedText = NSAttributedString(string: visualText, attributes: attributes)
        if let editor = editor {
            buffer.receive(node.value ?? "")
            if editor.markedTextRange == nil && editor.text != buffer.value {
                let selected = editor.selectedRange
                editor.attributedText = NSAttributedString(string: buffer.value, attributes: attributes)
                let length = (buffer.value as NSString).length
                editor.selectedRange = NSRange(location: min(selected.location, length), length: min(selected.length, max(0, length - min(selected.location, length))))
            }
            editor.typingAttributes = attributes; editor.font = font
            editor.textColor = color(node.style?.foreground) ?? .label
            editor.textContainerInset = insets; editor.isEditable = enabled
            editor.accessibilityLabel = spoken
            editor.keyboardType = node.props?.inputType == "email" ? .emailAddress : node.props?.inputType == "phone" ? .phonePad : node.props?.inputType == "number" ? .decimalPad : .default
            configureDateInput(editor)
            placeholder?.attributedText = NSAttributedString(string: node.props?.placeholder ?? "", attributes: attributes)
            placeholder?.textColor = color(node.style?.foreground) ?? .placeholderText
            placeholder?.isHidden = !buffer.value.isEmpty
        }
        button?.isEnabled = enabled; button?.accessibilityLabel = spoken
        button?.accessibilityIdentifier = "trashed-native-action-" + (node.actionId ?? node.id)
        if let raster = node.props?.raster, let data = NativeChatPolicy.rasterData(raster) {
            let key = NativeChatCache.digest(data)
            if key != imageKey { imageLoader?.cancel(); imageKey = key; imageView?.image = UIImage(data: data) }
        } else if let url = node.props?.src.flatMap({ NativeChatPolicy.safeImageURL($0, configured: configured) }), imageKey != url.absoluteString {
            imageKey = url.absoluteString
            imageLoader?.cancel(); let loader = NativeChatImageLoader(); imageLoader = loader
            imageSubscription = loader.$image.sink { [weak self] image in self?.imageView?.image = image }
            loader.load(url, configured: configured)
        }
        mapDelegate.selected = { [weak self] marker in
            guard let self = self, self.enabled, let id = self.node.actionId else { return }
            self.perform?(id, marker)
        }
        if let map = map, mapDelegate.markers != node.props?.markers || mapDelegate.lines != node.props?.lines {
            mapDelegate.markers = node.props?.markers; mapDelegate.lines = node.props?.lines
            map.removeAnnotations(map.annotations); map.removeOverlays(map.overlays)
            let annotations = (node.props?.markers ?? []).map { m -> MKPointAnnotation in let a = MKPointAnnotation(); a.title = m.label; a.coordinate = CLLocationCoordinate2D(latitude: m.latitude, longitude: m.longitude); return a }
            map.addAnnotations(annotations)
            var rect = MKMapRect.null
            for source in node.props?.lines ?? [] where source.points.count >= 2 {
                let line = MKPolyline(coordinates: source.points.map { CLLocationCoordinate2D(latitude: $0.latitude, longitude: $0.longitude) }, count: source.points.count)
                map.addOverlay(line); rect = rect.union(line.boundingMapRect)
            }
            for annotation in annotations { let p = MKMapPoint(annotation.coordinate); rect = rect.union(MKMapRect(x: p.x-800, y: p.y-800, width: 1600, height: 1600)) }
            if !rect.isNull { map.setVisibleMapRect(rect, edgePadding: .zero, animated: false) }
        }
        let wanted = Set((node.children ?? []).map(\.id))
        for id in Array(nodes.keys) where !wanted.contains(id) { nodes.removeValue(forKey: id)?.removeFromSuperview() }
        for child in node.children ?? [] {
            if nodes[child.id]?.kind != child.type { nodes.removeValue(forKey: child.id)?.removeFromSuperview() }
            let view = nodes[child.id] ?? NativeMeasuredNode(child)
            nodes[child.id] = view; if view.superview == nil { addSubview(view) }
            view.update(child, state: state, configured: configured, onAction: onAction)
            view.isUserInteractionEnabled = button == nil
            view.accessibilityElementsHidden = button != nil
            bringSubviewToFront(view)
        }
        if let button = button { bringSubviewToFront(button) }
        setNeedsLayout()
    }
    override func layoutSubviews() {
        super.layoutSubviews()
        // CSS clamps radii to half the smallest dimension; CALayer does not.
        layer.cornerRadius = min(CGFloat(node.style?.radius ?? 0), min(bounds.width, bounds.height) / 2)
        let content = bounds.inset(by: insets)
        label?.frame = content; editor?.frame = bounds; placeholder?.frame = content
        imageView?.frame = bounds; button?.frame = bounds; map?.frame = bounds
        for child in node.children ?? [] {
            if let box = child.box { nodes[child.id]?.frame = CGRect(x: box.x, y: box.y, width: box.width, height: box.height) }
        }
    }
    @objc private func tapped() { if enabled, let id = node.actionId { perform?(id, node.value) } }
    private func configureDateInput(_ editor: UITextView) {
        guard node.props?.inputType == "date" else {
            if datePicker != nil { datePicker = nil; editor.inputView = nil; editor.inputAccessoryView = nil; editor.reloadInputViews() }
            return
        }
        if datePicker == nil {
            let picker = UIDatePicker()
            picker.datePickerMode = .date
            picker.preferredDatePickerStyle = .wheels
            picker.calendar = Calendar(identifier: .gregorian)
            picker.timeZone = TimeZone(secondsFromGMT: 0)
            picker.accessibilityIdentifier = "trashed-native-date-" + node.id
            datePicker = picker; editor.inputView = picker
            let toolbar = UIToolbar(); toolbar.sizeToFit()
            toolbar.items = [
                UIBarButtonItem(title: "Cancel", style: .plain, target: self, action: #selector(cancelDate)),
                UIBarButtonItem(title: "Clear", style: .plain, target: self, action: #selector(clearDate)),
                UIBarButtonItem(barButtonSystemItem: .flexibleSpace, target: nil, action: nil),
                UIBarButtonItem(title: "Done", style: .done, target: self, action: #selector(doneDate))
            ]
            editor.inputAccessoryView = toolbar
            editor.reloadInputViews()
        }
        if !editor.isFirstResponder { resetDatePicker() }
    }
    private func resetDatePicker() {
        datePicker?.date = Self.dateFormatter.date(from: buffer.value) ?? Date()
    }
    func textViewDidBeginEditing(_ textView: UITextView) { if datePicker != nil { resetDatePicker() } }
    func textView(_ textView: UITextView, shouldChangeTextIn range: NSRange, replacementText text: String) -> Bool {
        // Date fields accept only the native picker, including with hardware keyboards.
        node.props?.inputType != "date"
    }
    @objc private func cancelDate() { editor?.resignFirstResponder() }
    @objc private func clearDate() { commitDate("") }
    @objc private func doneDate() {
        guard let picker = datePicker else { return }
        commitDate(Self.dateFormatter.string(from: picker.date))
    }
    private func commitDate(_ value: String) {
        guard enabled, let editor = editor, let id = node.actionId else { return }
        let changed = value != buffer.value
        buffer.edit(value)
        editor.attributedText = NSAttributedString(string: value, attributes: attributes)
        placeholder?.isHidden = !value.isEmpty
        editor.resignFirstResponder()
        if changed { perform?(id, value) }
    }
    func textViewDidChange(_ textView: UITextView) {
        guard enabled, let value = textView.text, NativeChatPolicy.text(value, max: 4000, empty: true) != nil, let id = node.actionId else { return }
        placeholder?.isHidden = !value.isEmpty
        buffer.edit(value); perform?(id, value)
    }
    deinit { imageLoader?.cancel() }
}
