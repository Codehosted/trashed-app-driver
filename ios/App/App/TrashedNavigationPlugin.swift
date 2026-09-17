import Foundation
import CoreFoundation
import UIKit
import WebKit
import Capacitor

struct NativeNavigationItem: Equatable {
    let id: String
    let label: String
    let icon: String
    let detail: String?
    let selected: Bool
    let destructive: Bool
}

struct NativeNavigationTab: Equatable {
    let id: String
    let label: String
    let icon: String
    let badge: Int
    let selected: Bool
    let items: [NativeNavigationItem]
}

struct NativeNavigationState: Equatable {
    let context: String
    let revision: Int
    let visible: Bool
    let appearance: String
    let tabs: [NativeNavigationTab]

    func selection(context: String, tabID: String, itemID: String) -> [String: Any]? {
        guard visible, self.context == context, let tab = tabs.first(where: { $0.id == tabID }),
              tab.items.isEmpty ? itemID == tab.id : tab.items.contains(where: { $0.id == itemID }) else { return nil }
        return ["context": context, "revision": revision, "id": itemID]
    }
}

enum NativeNavigationPolicy {
    static let icons: Set<String> = ["manage", "inventory", "pods", "rentals", "customers", "dispatch", "driver", "assistant", "calls", "operator", "settings", "profile", "inbox", "support", "appearance", "logout", "delete-account", "workspace", "dashboard", "account", "admin", "map", "messages", "more"]

    static func integer(_ value: Any?, max: Int) -> Int? {
        guard let n = value as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID() else { return nil }
        let d = n.doubleValue
        guard d.isFinite, d >= 0, d <= Double(max), d.rounded(.towardZero) == d else { return nil }
        return Int(d)
    }

    static func boolean(_ value: Any?) -> Bool? {
        guard let n = value as? NSNumber, CFGetTypeID(n) == CFBooleanGetTypeID() else { return nil }
        return n.boolValue
    }

    static func matches(_ value: String, _ pattern: String) -> Bool {
        value.range(of: pattern, options: .regularExpression) != nil
    }

    static func context(_ value: Any?) -> String? {
        guard let value = value as? String, matches(value, "^[A-Za-z0-9_-]{1,80}\\z") else { return nil }
        return value
    }

    static func text(_ value: Any?, max: Int, empty: Bool = false) -> String? {
        guard let value = value as? String, (empty || !value.isEmpty), value.utf16.count <= max,
              !matches(value, "[\\p{Cc}\\p{Cf}]") else { return nil }
        return value
    }

    static func parse(_ raw: [String: Any]) -> NativeNavigationState? {
        guard Set(raw.keys) == Set(["version", "context", "revision", "visible", "appearance", "tabs"]),
              integer(raw["version"], max: 1) == 1, let context = context(raw["context"]),
              let revision = integer(raw["revision"], max: 2147483647), revision > 0,
              let visible = boolean(raw["visible"]), let appearance = raw["appearance"] as? String,
              ["light", "dark"].contains(appearance), let rawTabs = raw["tabs"] as? [[String: Any]], rawTabs.count <= 5 else { return nil }
        var ids = Set<String>(), total = 0
        var tabs: [NativeNavigationTab] = []
        for rawTab in rawTabs {
            guard Set(rawTab.keys) == Set(["id", "label", "icon", "badge", "selected", "items"]),
                  let id = rawTab["id"] as? String, matches(id, "^[a-z][a-z0-9_-]{0,47}\\z"), ids.insert(id).inserted,
                  let label = text(rawTab["label"], max: 64), let icon = rawTab["icon"] as? String, icons.contains(icon),
                  let badge = integer(rawTab["badge"], max: 999), let selected = boolean(rawTab["selected"]),
                  let rawItems = rawTab["items"] as? [[String: Any]], rawItems.count <= 20 else { return nil }
            total += rawItems.count
            guard total <= 60 else { return nil }
            var items: [NativeNavigationItem] = []
            for rawItem in rawItems {
                let keys = Set(rawItem.keys)
                guard keys.isSuperset(of: ["id", "label", "icon"]), keys.isSubset(of: ["id", "label", "icon", "detail", "selected", "destructive"]),
                      let itemID = rawItem["id"] as? String, matches(itemID, "^[a-z][a-z0-9_-]{0,47}\\z"), ids.insert(itemID).inserted,
                      let itemLabel = text(rawItem["label"], max: 64), let itemIcon = rawItem["icon"] as? String, icons.contains(itemIcon),
                      !keys.contains("detail") || text(rawItem["detail"], max: 120, empty: true) != nil,
                      !keys.contains("selected") || boolean(rawItem["selected"]) != nil,
                      !keys.contains("destructive") || boolean(rawItem["destructive"]) != nil else { return nil }
                items.append(NativeNavigationItem(id: itemID, label: itemLabel, icon: itemIcon, detail: rawItem["detail"] as? String,
                    selected: boolean(rawItem["selected"]) ?? false, destructive: boolean(rawItem["destructive"]) ?? false))
            }
            tabs.append(NativeNavigationTab(id: id, label: label, icon: icon, badge: badge, selected: selected, items: items))
        }
        return NativeNavigationState(context: context, revision: revision, visible: visible, appearance: appearance, tabs: tabs)
    }

    // Presentation gate only. A top-level URL does NOT authenticate the calling frame.
    static func isWorkspace(_ current: URL?, configured: URL?) -> Bool {
        guard let current = current, let configured = configured, let host = configured.host,
              let scheme = configured.scheme, ["http", "https"].contains(scheme), current.scheme == scheme,
              current.host?.lowercased() == host.lowercased(), current.user == nil, current.password == nil,
              configured.user == nil, configured.password == nil,
              (current.port ?? (scheme == "https" ? 443 : 80)) == (configured.port ?? (scheme == "https" ? 443 : 80)),
              let path = URLComponents(url: current, resolvingAgainstBaseURL: false)?.percentEncodedPath.removingPercentEncoding,
              !path.contains("\\"), !path.split(separator: "/").contains(where: { $0 == "." || $0 == ".." }) else { return false }
        return ["/vendor", "/calls", "/driver", "/admin"].contains { path == $0 || path.hasPrefix($0 + "/") }
    }
}

struct NativeNavigationStore {
    private(set) var state: NativeNavigationState?

    mutating func set(_ next: NativeNavigationState) -> Bool {
        if let state = state, state.context == next.context, next.revision <= state.revision { return false }
        state = next
        return true
    }

    @discardableResult mutating func clear(context: String? = nil) -> String? {
        guard let current = state, context == nil || current.context == context else { return nil }
        state = nil
        return current.context
    }
}

@objc(TrashedNavigationPlugin)
public class TrashedNavigationPlugin: CAPPlugin, CAPBridgedPlugin, UITabBarDelegate, UIAdaptivePresentationControllerDelegate {
    public let identifier = "TrashedNavigationPlugin"
    public let jsName = "TrashedNavigation"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
    ]
    private var store = NativeNavigationStore()
    private let bar = UITabBar()
    private let barBackground = UIView()
    private var barHeight: NSLayoutConstraint?
    private var observers: [NSObjectProtocol] = []
    private var keyboardVisible = false
    private var sheet: UINavigationController?
    private var sheetTabID: String?
    private var sheetContext: String?
    private var selectionPending = false
    private let primary = NativeAdaptivePalette.accent
    private var host: MainViewController? { bridge?.viewController as? MainViewController }

    func attach(to container: UIView) {
        bar.translatesAutoresizingMaskIntoConstraints = false
        bar.delegate = self
        bar.isHidden = true
        bar.accessibilityIdentifier = "trashed-native-bottom-bar"
        barBackground.translatesAutoresizingMaskIntoConstraints = false
        barBackground.isHidden = true
        barBackground.isUserInteractionEnabled = false
        container.addSubview(barBackground)
        container.addSubview(bar)
        let height = bar.heightAnchor.constraint(equalToConstant: 49)
        barHeight = height
        NSLayoutConstraint.activate([
            barBackground.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            barBackground.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            barBackground.topAnchor.constraint(equalTo: bar.topAnchor),
            barBackground.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            bar.leadingAnchor.constraint(equalTo: container.safeAreaLayoutGuide.leadingAnchor),
            bar.trailingAnchor.constraint(equalTo: container.safeAreaLayoutGuide.trailingAnchor),
            bar.bottomAnchor.constraint(equalTo: container.safeAreaLayoutGuide.bottomAnchor), height,
        ])
        observers.append(NotificationCenter.default.addObserver(forName: UIResponder.keyboardWillChangeFrameNotification, object: nil, queue: .main) { [weak self] notification in
            guard let self = self, let view = self.host?.view,
                  let frame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else { return }
            let overlap = view.convert(frame, from: nil).intersection(view.bounds)
            self.keyboardVisible = !overlap.isNull && !overlap.isEmpty
            self.refresh()
        })
        observers.append(NotificationCenter.default.addObserver(forName: UIResponder.keyboardWillHideNotification, object: nil, queue: .main) { [weak self] _ in
            self?.keyboardVisible = false
            self?.refresh()
        })
    }

    deinit { observers.forEach { NotificationCenter.default.removeObserver($0) } }

    @objc func setState(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.host?.nativeNavigationAvailable == true,
                  NativeNavigationPolicy.isWorkspace(self.webView?.url, configured: self.bridge?.config.serverURL) else {
                call.reject("Navigation is unavailable on this screen.", "UNAVAILABLE"); return
            }
            guard let next = NativeNavigationPolicy.parse(call.jsObjectRepresentation) else {
                call.reject("Invalid navigation state.", "INVALID_STATE"); return
            }
            guard self.store.set(next) else { call.reject("Navigation state is stale.", "STALE_STATE"); return }
            self.host?.nativeWorkspaceNavigationChanged(context: next.context, visible: next.visible)
            self.refresh()
            call.resolve(["context": next.context, "revision": next.revision])
        }
    }

    @objc func clear(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard Set(call.jsObjectRepresentation.keys) == Set(["context"]),
                  let context = NativeNavigationPolicy.context(call.jsObjectRepresentation["context"]) else {
                call.reject("Invalid navigation context.", "INVALID_STATE"); return
            }
            self.store.clear(context: context)
            self.host?.nativeWorkspaceNavigationChanged(context: self.store.state?.context, visible: self.store.state?.visible == true)
            self.refresh()
            call.resolve()
        }
    }

    func reset() {
        let context = store.clear()
        host?.nativeWorkspaceNavigationChanged(context: nil, visible: false)
        refresh()
        if let context = context { notifyListeners("reset", data: ["context": context], retainUntilConsumed: false) }
    }

    override public func shouldOverrideLoad(_ navigationAction: WKNavigationAction) -> NSNumber? {
        if let url = navigationAction.request.url,
           host?.interceptWorkspaceHome(url) == true { return true }
        if navigationAction.targetFrame?.isMainFrame == true { reset() }
        return nil // Other Capacitor navigation/dialer decisions are unchanged.
    }

    func refresh() {
        guard let state = store.state, state.visible, !state.tabs.isEmpty, !keyboardVisible,
              host?.nativeNavigationAvailable == true,
              NativeNavigationPolicy.isWorkspace(webView?.url, configured: bridge?.config.serverURL) else {
            bar.isHidden = true
            barBackground.isHidden = true
            host?.setNativeNavigationHeight(0)
            dismissSheet()
            return
        }
        bar.overrideUserInterfaceStyle = .unspecified // Device, never the web projection.
        let appearance = UITabBarAppearance()
        appearance.configureWithOpaqueBackground()
        appearance.backgroundColor = .systemBackground
        appearance.shadowColor = .clear
        for layout in [appearance.stackedLayoutAppearance, appearance.inlineLayoutAppearance, appearance.compactInlineLayoutAppearance] {
            layout.normal.iconColor = .secondaryLabel
            layout.normal.titleTextAttributes = [.foregroundColor: UIColor.secondaryLabel]
            layout.selected.iconColor = primary
            layout.selected.titleTextAttributes = [.foregroundColor: primary]
            layout.normal.badgeBackgroundColor = NativeAdaptivePalette.fill
            layout.selected.badgeBackgroundColor = NativeAdaptivePalette.fill
            layout.normal.badgeTextAttributes = [.foregroundColor: UIColor.white]
            layout.selected.badgeTextAttributes = [.foregroundColor: UIColor.white]
        }
        bar.standardAppearance = appearance
        if #available(iOS 15.0, *) { bar.scrollEdgeAppearance = appearance }
        let items = state.tabs.enumerated().map { index, tab -> UITabBarItem in
            let item = UITabBarItem(title: tab.label, image: Self.icon(tab.icon), tag: index)
            item.badgeValue = tab.badge > 0 ? String(tab.badge) : nil
            item.accessibilityIdentifier = "trashed-native-tab-" + tab.id
            return item
        }
        bar.setItems(items, animated: false)
        bar.selectedItem = state.tabs.firstIndex(where: { $0.selected }).map { items[$0] }
        bar.isHidden = false
        barBackground.isHidden = false
        let height = max(49, bar.sizeThatFits(CGSize(width: host?.view.bounds.width ?? 0, height: 49)).height)
        barHeight?.constant = height
        host?.setNativeNavigationHeight(height)
        barBackground.backgroundColor = .systemBackground
        if let sheet = sheet, let table = sheet.viewControllers.first as? NativeNavigationTable {
            guard sheetContext == state.context, let tab = state.tabs.first(where: { $0.id == sheetTabID }), !tab.items.isEmpty else { dismissSheet(); return }
            sheet.overrideUserInterfaceStyle = .unspecified
            table.update(tab)
        }
    }

    public func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        guard !selectionPending, sheet == nil, host?.nativeNavigationAvailable == true,
              let state = store.state, state.visible, state.tabs.indices.contains(item.tag),
              NativeNavigationPolicy.isWorkspace(webView?.url, configured: bridge?.config.serverURL) else { return }
        let tab = state.tabs[item.tag]
        if tab.items.isEmpty { emit(context: state.context, tabID: tab.id, itemID: tab.id); refresh(); return }
        guard let host = host, host.presentedViewController == nil else { refresh(); return }
        let table = NativeNavigationTable(tab: tab, primary: primary)
        table.onSelect = { [weak self] id in self?.selectItem(context: state.context, tabID: tab.id, itemID: id) }
        table.onClose = { [weak self] in self?.dismissSheet() }
        let controller = UINavigationController(rootViewController: table)
        controller.overrideUserInterfaceStyle = .unspecified
        controller.modalPresentationStyle = .pageSheet
        if #available(iOS 15.0, *) {
            controller.sheetPresentationController?.detents = [.medium(), .large()]
            controller.sheetPresentationController?.prefersGrabberVisible = true
        }
        sheet = controller; sheetContext = state.context; sheetTabID = tab.id
        host.present(controller, animated: true)
        controller.presentationController?.delegate = self
    }

    private func selectItem(context: String, tabID: String, itemID: String) {
        guard !selectionPending, let sheet = sheet, !sheet.isBeingDismissed,
              let state = store.state, state.selection(context: context, tabID: tabID, itemID: itemID) != nil else { return }
        selectionPending = true
        let sourceURL = webView?.url
        sheet.dismiss(animated: true) { [weak self] in
            guard let self = self else { return }
            self.sheet = nil; self.sheetContext = nil; self.sheetTabID = nil; self.selectionPending = false
            if self.store.state?.revision == state.revision, self.webView?.url == sourceURL {
                self.emit(context: context, tabID: tabID, itemID: itemID)
            }
            self.refresh()
        }
    }

    private func emit(context: String, tabID: String, itemID: String) {
        guard host?.nativeNavigationAvailable == true, !keyboardVisible,
              host?.presentedViewController == nil,
              NativeNavigationPolicy.isWorkspace(webView?.url, configured: bridge?.config.serverURL),
              let event = store.state?.selection(context: context, tabID: tabID, itemID: itemID) else { return }
        if host?.consumeNativeWorkspaceAction(itemID, context: context) == true { return }
        notifyListeners("select", data: event, retainUntilConsumed: false)
    }

    @discardableResult func dismissSheet() -> Bool {
        guard let sheet = sheet else { return false }
        // Keep the reference until UIKit has finished dismissal: no overlapping picker/sheet.
        guard !sheet.isBeingDismissed else { return true }
        sheet.dismiss(animated: true) { [weak self] in
            self?.sheet = nil; self?.sheetContext = nil; self?.sheetTabID = nil
            self?.refresh()
        }
        return true
    }

    public func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        sheet = nil; sheetContext = nil; sheetTabID = nil
        refresh()
    }

    static func icon(_ key: String) -> UIImage? {
        let symbols = ["manage": "square.grid.2x2", "inventory": "shippingbox", "pods": "cube.box", "rentals": "truck.box", "customers": "person.2", "dispatch": "point.topleft.down.curvedto.point.bottomright.up", "driver": "car", "assistant": "sparkles", "calls": "phone", "operator": "headphones", "settings": "slider.horizontal.3", "profile": "person.crop.circle", "inbox": "tray", "support": "questionmark.circle", "appearance": "circle.lefthalf.filled", "logout": "rectangle.portrait.and.arrow.right", "delete-account": "person.crop.circle.badge.minus", "workspace": "building.2", "dashboard": "square.grid.2x2", "account": "person.crop.circle", "admin": "gearshape", "map": "map", "messages": "message", "more": "ellipsis"]
        return UIImage(systemName: symbols[key] ?? "ellipsis") ?? UIImage(systemName: "square.grid.2x2")
    }
}

private final class NativeNavigationTable: UITableViewController {
    private var group: NativeNavigationTab
    private let primary: UIColor
    var onSelect: ((String) -> Void)?
    var onClose: (() -> Void)?

    init(tab: NativeNavigationTab, primary: UIColor) {
        self.group = tab; self.primary = primary
        super.init(style: .plain)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }
    override func viewDidLoad() {
        super.viewDidLoad()
        title = group.label
        tableView.rowHeight = UITableView.automaticDimension
        tableView.estimatedRowHeight = 64
        tableView.separatorStyle = .none
        tableView.backgroundColor = .systemBackground
        tableView.accessibilityIdentifier = "trashed-native-navigation-sheet"
        navigationItem.rightBarButtonItem = UIBarButtonItem(barButtonSystemItem: .close, target: self, action: #selector(close))
        navigationItem.rightBarButtonItem?.accessibilityLabel = "Close " + group.label
        navigationController?.navigationBar.tintColor = primary
    }
    func update(_ tab: NativeNavigationTab) { self.group = tab; title = group.label; tableView.reloadData() }
    @objc private func close() { onClose?() }
    override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int { group.items.count }
    override func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let item = group.items[indexPath.row]
        let cell = UITableViewCell(style: .subtitle, reuseIdentifier: nil)
        cell.textLabel?.text = item.label
        cell.textLabel?.font = .preferredFont(forTextStyle: .body)
        cell.textLabel?.adjustsFontForContentSizeCategory = true
        cell.textLabel?.numberOfLines = 0
        cell.detailTextLabel?.text = item.detail
        cell.detailTextLabel?.font = .preferredFont(forTextStyle: .subheadline)
        cell.detailTextLabel?.adjustsFontForContentSizeCategory = true
        cell.detailTextLabel?.numberOfLines = 0
        cell.imageView?.image = TrashedNavigationPlugin.icon(item.icon)
        let foreground: UIColor = item.selected ? .white : (item.destructive ? .systemRed : .label)
        cell.textLabel?.textColor = foreground
        cell.detailTextLabel?.textColor = item.selected ? .white : .secondaryLabel
        cell.imageView?.tintColor = foreground
        cell.backgroundColor = item.selected ? NativeAdaptivePalette.fill : .systemBackground
        cell.accessoryType = item.selected ? .checkmark : .none
        cell.tintColor = foreground
        cell.accessibilityIdentifier = "trashed-native-item-" + item.id
        cell.contentView.heightAnchor.constraint(greaterThanOrEqualToConstant: 56).isActive = true
        return cell
    }
    override func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: false)
        guard group.items.indices.contains(indexPath.row) else { return }
        onSelect?(group.items[indexPath.row].id)
    }
}
