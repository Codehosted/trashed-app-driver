import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = new URL('../', import.meta.url).pathname;
const shell = readFileSync(root + 'ios/App/App/MainViewController.swift', 'utf8');
const between = (a, b) => shell.slice(shell.indexOf(a), shell.indexOf(b, shell.indexOf(a)));

test('production workspace handoff retains the native root when web navigation is not ready', {skip: process.platform !== 'darwin', timeout: 90000}, () => {
  const dir = mkdtempSync(join(tmpdir(), 'workspace-transition-'));
  try {
    const open = between('    private func openWorkspaceWeb(', '    private func showWorkspaceLoadCover(').replace('private func openWorkspaceWeb', 'func openWorkspaceWeb');
    const availability = between('    private var nativeWorkspaceSessionAvailable:', '    var nativeChatAvailable:').replace('private var nativeWorkspaceSessionAvailable', 'var nativeWorkspaceSessionAvailable');
    const history = between('private struct NativeWorkspaceHistory', 'private enum DriverTheme');
    writeFileSync(join(dir, 'main.swift'), `import Foundation
${history}
final class Screen { var window: Bool? = true }
final class WebView {
 var url: URL? = URL(string:"about:blank")
 var isLoading = false
 var loads: [URL] = []
 func load(_ request: URLRequest) { loads.append(request.url!); url = request.url }
}
final class Host {
 var webView: WebView? = WebView()
 var viewIfLoaded: Screen? = Screen()
 var onboardingReady = true
 var nativeOnboardingController: Bool? = nil
 var nativeLoginController: Bool? = nil
 var nativeWorkspaceRoot = true
 var nativeWorkspaceController: Bool? = true
 var nativeWorkspaceDismissing = false
 var directWorkspace: WorkspaceDirectNavigation?
 var nativeWorkspaceBypass: WorkspaceRoute?
 var workspaceNavigationGeneration = UUID()
 var dismissals = 0
 var covers = 0
 var failures = 0
 func showWorkspaceLoadCover(target: URL) { covers += 1 }
 func workspaceLoadFailed(_ navigation: Bool?) { failures += 1 }
 func startWorkspaceWebLoad(_ url: URL) { webView?.load(URLRequest(url: url)) }
 var invalidateDuringDismiss = false
 func dismissNativeWorkspace(completion: (() -> Void)? = nil) {
   dismissals += 1; nativeWorkspaceRoot = false; nativeWorkspaceController = nil
   if invalidateDuringDismiss { workspaceNavigationGeneration = UUID() }
   completion?()
 }
${availability}
${open}
}
func check(_ yes: @autoclosure () -> Bool, _ label: String) { if !yes() { fputs("FAIL: " + label + "\\n", stderr); exit(1) } }
let origin = URL(string:"https://trashed.app")!
// A root ignores the intentionally stopped WebView for session availability.
// It must not tear itself down then reject that same WebView as still loading.
let busy = Host(); busy.webView!.isLoading = true
busy.openWorkspaceWeb("/vendor/assistant", origin: origin)
check(busy.nativeWorkspaceRoot && busy.dismissals == 0 && busy.webView!.loads.isEmpty,
      "loading WebView must not destroy the only visible native screen")
let detached = Host(); detached.viewIfLoaded!.window = nil
detached.openWorkspaceWeb("/vendor/customers", origin: origin)
check(detached.nativeWorkspaceRoot && detached.dismissals == 0, "offscreen action must not tear down root")
let missing = Host(); missing.webView = nil
missing.openWorkspaceWeb("/vendor/assistant", origin: origin)
check(missing.nativeWorkspaceRoot && missing.dismissals == 0, "missing WebView must retain native root")
for path in ["/vendor/assistant", "/vendor/customers", "/vendor/inventory"] {
 let ready = Host(); ready.openWorkspaceWeb(path, origin: origin)
 check(ready.dismissals == 1 && ready.webView!.loads.map(\\.path) == [path], "ready existing fallback loads once")
}
for path in ["https://evil.test/vendor/assistant", "http://trashed.app/vendor/assistant", "/vendor/dashboard", "/api/auth/signout"] {
 let denied = Host(); denied.openWorkspaceWeb(path, origin: origin)
 check(denied.nativeWorkspaceRoot && denied.dismissals == 0 && denied.webView!.loads.isEmpty, "unsafe or intercepted destination denied")
}
let login = Host(); login.nativeLoginController = true
login.openWorkspaceWeb("/vendor/assistant", origin: origin)
check(login.dismissals == 0 && login.webView!.loads.isEmpty, "login still revokes navigation")
let stale = Host(); stale.nativeWorkspaceRoot = false; stale.webView!.url = URL(string:"https://trashed.app/vendor/inventory")!
stale.directWorkspace = WorkspaceDirectNavigation.begin(action:"vendor-profile", sourceURL:stale.webView!.url!, origin:origin, context:"old", workspace:true, loading:false, modalBusy:false)
stale.invalidateDuringDismiss = true
stale.openWorkspaceWeb("/vendor/customers", origin: origin)
check(stale.webView!.loads.isEmpty, "old document generation cannot navigate after modal dismissal")
print("PASS actual production handoff: retain visible root before rejected navigation; valid/unsafe/stale guards")
`);
    const build = spawnSync('xcrun', ['swiftc', root + 'ios/App/App/NativeWorkspacePolicy.swift', join(dir, 'main.swift'), '-o', join(dir, 'run')], {encoding:'utf8',timeout:60000});
    assert.equal(build.status, 0, build.stderr);
    const run = spawnSync(join(dir, 'run'), [], {encoding:'utf8',timeout:10000});
    assert.equal(run.status, 0, run.stdout + run.stderr);
    console.log(run.stdout.trim());
  } finally { rmSync(dir, {recursive:true, force:true}); }
});
