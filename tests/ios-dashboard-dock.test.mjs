import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync, writeFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

const root = new URL('../', import.meta.url).pathname;
const read = file => readFileSync(root + 'ios/App/App/' + file, 'utf8');
const ui = read('NativeWorkspaceView.swift');
const dashboard = read('NativeDashboardView.swift');
const between = (text, from, to) => {
  assert.ok(text.includes(from), `missing ${from}`);
  assert.ok(text.includes(to), `missing ${to}`);
  return text.slice(text.indexOf(from), text.indexOf(to, text.indexOf(from)));
};

test('root-only dock consumes sibling layout space and leaves legacy modals unchanged', () => {
  const screen = between(ui, 'struct WorkspaceScreen: View', 'enum WorkspaceStyle');
  assert.match(screen, /VStack\(spacing: 0\)\s*\{\s*NavigationStack/);
  assert.match(screen, /if isRoot && !keyboardVisible/);
  assert.match(screen, /\.frame\(maxWidth: \.infinity, maxHeight: \.infinity\)/);
  assert.match(screen, /\.fixedSize\(horizontal: false, vertical: true\)/);
  assert.doesNotMatch(screen, /\.safeAreaInset|\.overlay/);
  assert.match(screen, /WorkspaceBottomDock\(/);
  assert.match(screen, /selected: WorkspaceDockNavigation\.selectedGroup\(path\.last \?\? route\)/);
  assert.match(screen, /UIResponder\.keyboardWillShowNotification/);
  assert.match(screen, /UIResponder\.keyboardWillHideNotification/);
  assert.match(screen, /guard !model\.invalidated, !model\.suspended/);
  assert.match(screen, /WorkspaceDockNavigation\.entries\(in: group, profile: model\.profile\)/);
  assert.match(screen, /\.task\(id: model\.dashboard\?\.generatedAt\)/);
  assert.match(screen, /if isRoot && model\.profile == nil \{ await model\.loadProfile\(\) \}/);
  assert.match(screen, /case \.dashboard: path = \[\]/);
  assert.match(screen, /case \.rentals: path = \[\.rentals\]/);
  assert.match(screen, /case \.profile: path = \[\.profile\]/);
  assert.match(screen, /case \.calls: path = \[\.calls\(WorkspaceCallsQuery\(\)\)\]/);
  assert.match(screen, /case \.web\(let destination\): openWeb\(destination\)/);
  assert.doesNotMatch(screen, /openWeb\("\/(?:app|vendor\/dashboard)"\)/);
  assert.doesNotMatch(screen, /evaluateJavaScript|TrashedNavigationPlugin|setNativeNavigationHeight/);
  assert.match(screen, /More destinations · Web/);
});

test('dock uses adaptive intrinsic sizing and dashboard exposes its last footer', () => {
  const dock = between(ui, 'private struct WorkspaceBottomDock: View', '@available(iOS 16.0, *)\nprivate struct WorkspaceNotice');
  assert.match(dock, /@Environment\(\\\.dynamicTypeSize\)/);
  assert.match(dock, /dynamicTypeSize\.isAccessibilitySize \? 2 : 4/);
  assert.match(dock, /\.font\(\.caption/);
  assert.match(dock, /\.fixedSize\(horizontal: false, vertical: true\)/);
  assert.match(dock, /\.frame\(maxWidth: \.infinity, minHeight: 44\)/);
  assert.match(dock, /\.padding\(\.bottom, 8\)/);
  assert.match(dock, /RoundedRectangle/);
  assert.match(dock, /\.systemBackground/);
  assert.match(dock, /\.accessibilityIdentifier\("workspace-bottom-dock"\)/);
  assert.match(dock, /\.accessibilityIdentifier\("trashed-native-tab-\\\(group\.rawValue\)"\)/);
  assert.match(dock, /\.isSelected/);
  assert.doesNotMatch(dock, /ignoresSafeArea|UIScreen|\.frame\(height:|\.overlay/);
  assert.match(dashboard, /Revenue in[\s\S]*?\.fixedSize\(horizontal: false, vertical: true\)[\s\S]*?\.accessibilityIdentifier\("dashboard-scroll-end"\)/);
  assert.match(dashboard, /\.refreshable \{ await model\.loadDashboard\(\) \}/);
  assert.match(dashboard, /accessibilityIdentifier\("dashboard-refresh"\)/);
});

test('production dock policy executes permission, grouping, selection and stale-action guards', {skip: process.platform !== 'darwin', timeout: 90000}, () => {
  const dir = mkdtempSync(join(tmpdir(), 'dashboard-dock-'));
  try {
    const policy = between(ui, '// MARK: - Native dock navigation policy', '// MARK: - Native workspace screen');
    const dispatch = between(ui, '    private func dockEntry(', '\n}\n\n@available(iOS 16.0, *)\nenum WorkspaceStyle').replaceAll('private func', 'func');
    writeFileSync(join(dir, 'Harness.swift'), `import Foundation
${policy}
final class Model {
  var profile: WorkspaceProfile?; var invalidated = false; var suspended = false
  var onEnableNotifications: (() -> Void)?
  init(_ profile: WorkspaceProfile?) { self.profile = profile }
}
final class Screen {
  let model: Model; var path: [WorkspaceRoute] = []; var web: [String] = []
  init(_ profile: WorkspaceProfile?) { model = Model(profile) }
  func openWeb(_ path: String) { web.append(path) }
${dispatch}
}
func profile(_ roles: [String] = ["vendor"], permissions: [String: Bool]? = nil, calls: Bool = true, vendor: Int? = 2) -> WorkspaceProfile {
  WorkspaceProfile(user: .init(id: 1, name: "Fixture", email: "fixture@example.invalid", phone: nil, image: nil, roles: roles, vendor: vendor.map { .init(id: $0, businessName: "Fixture") }, emailVerified: true, vendorPermissions: permissions), capabilities: .init(calls: calls))
}
func check(_ yes: @autoclosure () -> Bool, _ message: String) { if !yes() { fatalError(message) } }
func ids(_ group: WorkspaceDockGroup, _ p: WorkspaceProfile?) -> [String] { WorkspaceDockNavigation.entries(in: group, profile: p).map(\\.id) }
@main struct Run { static func main() {
  let full = profile()
  check(WorkspaceDockGroup.allCases.map(\\.rawValue) == ["vendor-manage", "vendor-assistant", "vendor-calls", "vendor-account"], "four stable app navigation groups")
  check(ids(.manage, full).first == "vendor-dashboard", "dashboard is first Manage destination")
  check(ids(.manage, full).contains("vendor-inventory") && ids(.manage, full).contains("vendor-driver"), "existing management routes retained")
  check(ids(.assistant, full) == ["vendor-assistant"], "assistant explicit fallback")
  check(ids(.calls, full) == ["vendor-call-history", "vendor-call-monitor", "vendor-call-settings"], "calls and settings retained")
  check(ids(.account, full).contains("vendor-profile") && ids(.account, full).contains("vendor-enable-notifications"), "native account and push retained")
  for group in WorkspaceDockGroup.allCases { check(ids(group, nil).isEmpty, "missing profile fails closed") }
  let limited = profile(["manager"], permissions: ["dashboard": true, "profile": true])
  check(ids(.manage, limited) == ["vendor-dashboard"], "missing features fail closed in explicit permission map")
  check(ids(.assistant, limited).isEmpty && ids(.calls, limited).isEmpty, "assistant/calls respect feature denial")
  check(ids(.assistant, profile(calls: false)).isEmpty && ids(.calls, profile(calls: false)).isEmpty, "server calls capability gates AI controls")
  check(!ids(.account, limited).contains("vendor-settings"), "settings denial enforced")
  check(ids(.manage, profile(["driver"])).isEmpty, "driver cannot enter vendor-only root management")
  check(ids(.manage, profile(vendor: nil)).isEmpty, "missing vendor rejected")
  check(ids(.account, profile(["admin", "vendor"])).contains("vendor-admin"), "admin retained only for admin")
  check(!ids(.account, full).contains("vendor-admin"), "vendor cannot see administration")
  check(WorkspaceDockNavigation.selectedGroup(.dashboard) == .manage, "dashboard selection")
  check(WorkspaceDockNavigation.selectedGroup(.rentals) == .manage, "rentals selection")
  check(WorkspaceDockNavigation.selectedGroup(.profile) == .account, "profile selection")
  check(WorkspaceDockNavigation.selectedGroup(.calls(.init(search: "fixture"))) == .calls, "calls selection follows current route")
  let manage = WorkspaceDockNavigation.entries(in: .manage, profile: full)
  check(manage.first?.action == .dashboard, "dashboard is native, not web fallback")
  check(manage.first(where: { $0.id == "vendor-rentals" })?.action == .rentals, "rentals is native, not web fallback")
  check(!ids(.manage, limited).contains("vendor-rentals"), "denied rentals action absent")
  check(WorkspaceDockNavigation.entries(in: .account, profile: full).first?.action == .profile, "profile is native")
  check(WorkspaceDockNavigation.entries(in: .calls, profile: full).first?.action == .calls, "calls is native")
  for group in WorkspaceDockGroup.allCases {
    for entry in WorkspaceDockNavigation.entries(in: group, profile: full) {
      if case .web(let path) = entry.action {
        check(entry.title.hasSuffix(" · Web"), "web fallback visibly labeled")
        check(path.hasPrefix("/") && !path.hasPrefix("//") && path != "/app" && path != "/vendor/dashboard", "finite same-origin web destinations, never dashboard HTML")
      }
      check(!entry.id.contains("delete") && !entry.id.contains("theme"), "no retired account/theme actions")
    }
  }
  check(!ids(.manage, limited).contains("vendor-inventory"), "stale inventory action removed after permission update")
  let screen = Screen(full)
  screen.selectDockEntry(.manage, "vendor-rentals")
  check(screen.path == [.rentals] && screen.web.isEmpty, "rentals dispatch never loads web")
  screen.selectDockEntry(.account, "vendor-profile")
  check(screen.path == [.profile] && screen.web.isEmpty, "profile dispatch never loads web")
  screen.selectDockEntry(.calls, "vendor-call-history")
  check(screen.path == [.calls(.init())] && screen.web.isEmpty, "calls dispatch never loads web")
  screen.selectDockEntry(.manage, "vendor-dashboard")
  check(screen.path.isEmpty && screen.web.isEmpty, "dashboard returns to native root")
  screen.selectDockEntry(.assistant, "vendor-assistant")
  check(screen.web == ["/vendor/assistant"], "only explicit web action dispatches fallback")
  screen.web = []
  screen.model.profile = limited
  screen.selectDockEntry(.manage, "vendor-rentals")
  screen.selectDockEntry(.manage, "vendor-inventory")
  screen.selectDockEntry(.calls, "vendor-call-history")
  check(screen.path.isEmpty && screen.web.isEmpty, "stale selected actions recheck current permissions")
  screen.model.profile = nil
  screen.selectDockEntry(.account, "vendor-profile")
  check(screen.path.isEmpty && screen.web.isEmpty, "renewal quarantine has no native/web actions")
  screen.model.profile = full; screen.model.invalidated = true
  screen.selectDockEntry(.account, "vendor-profile")
  screen.selectDockEntry(.manage, "vendor-inventory")
  check(screen.path.isEmpty && screen.web.isEmpty, "invalidation blocks all navigation")
  screen.model.invalidated = false; screen.model.suspended = true
  screen.selectDockEntry(.account, "vendor-profile")
  screen.selectDockEntry(.manage, "vendor-inventory")
  check(screen.path.isEmpty && screen.web.isEmpty, "suspension blocks all navigation")
  screen.model.suspended = false
  screen.selectDockEntry(.account, "vendor-profile")
  check(screen.path == [.profile], "verified replacement profile restores native account action")
  print("PASS native dock policy and production dispatch: groups, native routes, web labels, permissions, selection, stale actions, renewal, invalidation and suspension")
}}
`);
    let result = spawnSync('xcrun', ['swiftc', '-parse-as-library', root + 'ios/App/App/NativeWorkspacePolicy.swift', join(dir, 'Harness.swift'), '-o', join(dir, 'run')], {encoding: 'utf8', timeout: 60000});
    assert.equal(result.status, 0, result.stderr);
    result = spawnSync(join(dir, 'run'), [], {encoding: 'utf8', timeout: 10000});
    assert.equal(result.status, 0, result.stderr);
    console.log(result.stdout.trim());
  } finally { rmSync(dir, {recursive: true, force: true}); }
});
