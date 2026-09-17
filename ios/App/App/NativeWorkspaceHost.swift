import UIKit
import SwiftUI
import WebKit

/// Owns API/session lifetime above SwiftUI rows and editors, never a DOM renderer.
@available(iOS 16.0, *)
@MainActor
final class WorkspaceHostingController: UIHostingController<WorkspaceScreen> {
    let model: WorkspaceModel
    private var needsRevalidation = false
    private var finished = false
    private var revalidation: Task<Void, Never>?

    init(api: WorkspaceAPI, route: WorkspaceRoute, isRoot: Bool = false, profile: WorkspaceProfile? = nil, openWeb: @escaping (String) -> Void, close: @escaping () -> Void) {
        model = WorkspaceModel(api: api, profile: profile)
        super.init(rootView: WorkspaceScreen(model: model, route: route, isRoot: isRoot, openWeb: openWeb, close: close))
        modalPresentationStyle = .fullScreen
        isModalInPresentation = true
        NotificationCenter.default.addObserver(self, selector: #selector(backgrounded), name: UIApplication.didEnterBackgroundNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(becameActive), name: UIApplication.didBecomeActiveNotification, object: nil)
    }

    @MainActor required dynamic init?(coder aDecoder: NSCoder) { fatalError("Storyboard initialization is unsupported") }

    @objc private func backgrounded() {
        guard !finished else { return }
        revalidation?.cancel(); revalidation = nil
        needsRevalidation = true
        model.suspend()
    }

    @objc private func becameActive() {
        guard needsRevalidation, !finished else { return }
        needsRevalidation = false
        revalidation = Task { await model.resume() }
    }

    func finish() {
        guard !finished else { return }
        finished = true
        revalidation?.cancel(); revalidation = nil
        NotificationCenter.default.removeObserver(self)
        model.close()
    }

    func openNativeRoute(_ route: WorkspaceRoute) {
        guard !finished, !model.invalidated else { return }
        model.requestedRoute = route
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        if isBeingDismissed || (presentingViewController == nil && parent == nil) { finish() }
    }
}
