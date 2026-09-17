import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = new URL('../', import.meta.url).pathname;
const read = name => readFileSync(root + 'ios/App/App/' + name, 'utf8');
const shell = read('MainViewController.swift');
const plugin = read('TrashedNavigationPlugin.swift');
const between = (text, start, end) => text.slice(text.indexOf(start), text.indexOf(end, text.indexOf(start)));
const entry = between(shell, '    func consumeNativeWorkspaceAction', '    // Transition named routes');
const close = between(shell, '    private func closeNativeWorkspace()', '    private func openWorkspaceWeb');
test('direct native entry consumes validated selection before JS emission with dismissal revision guard', () => {
  const emit = between(plugin, '    private func emit(', '    @discardableResult func dismissSheet');
  assert.ok(emit.indexOf('selection(context:') < emit.indexOf('consumeNativeWorkspaceAction'));
  assert.ok(emit.indexOf('consumeNativeWorkspaceAction') < emit.indexOf('notifyListeners'));
  assert.match(emit, /consumeNativeWorkspaceAction\(itemID, context: context\) == true \{ return \}/);
  assert.match(plugin, /self.store.state\?\.revision == state.revision/);
  assert.match(emit, /host\?\.presentedViewController == nil/);
  assert.doesNotMatch(entry, /\.load\(|evaluateJavaScript|notifyListeners|await /);
  const directClose = close.slice(0, close.indexOf('guard let current'));
  assert.match(directClose, /dismissNativeWorkspace\(\)/);
  assert.doesNotMatch(directClose, /\.load\(|goBack|go\(to:|evaluateJavaScript/);
});
test('source changes, clear/logout and deliberate Open Web retain lifecycle boundaries', () => {
  assert.match(plugin, /nativeWorkspaceNavigationChanged\(context: nil, visible: false\)/);
  assert.match(plugin, /nativeWorkspaceNavigationChanged\(context: next.context, visible: next.visible\)/);
  assert.match(shell, /return \/\/ Unchanged source KVO\/resume/);
  const fallback = between(shell, '    private func openWorkspaceWeb', '    #if DEBUG && targetEnvironment(simulator)\n    // Explicit');
  assert.match(fallback, /NativeWorkspaceHistory.isWorkspaceURL\(url, origin: origin\)/);
  assert.match(fallback, /self.workspaceNavigationGeneration == generation/);
  assert.match(fallback, /self.nativeNavigationAvailable/);
  assert.match(read('NativeWorkspaceHost.swift'), /await model.resume\(\)/);
  assert.match(read('NativeWorkspaceModel.swift'), /onSessionChange =/);
});
test('executable Swift: production host entry/back preserve document; policy rejects races and unknown origins', { skip: process.platform !== 'darwin', timeout: 90000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'ios-native-direct-'));
  try {
    const history = between(shell, 'private struct NativeWorkspaceHistory', 'private enum DriverTheme');
    // Execute the actual production entry, invalidation and Back methods. UIKit's
    // presenter and WKWebView are recording doubles, not a duplicate route algorithm.
    writeFileSync(join(dir, 'main.swift'), `import Foundation
${history}
final class WKHTTPCookieStore {}
struct DataStore { let httpCookieStore = WKHTTPCookieStore() }
struct Configuration { let websiteDataStore = DataStore() }
final class WebView {
 var url: URL? = URL(string:"https://trashed.app/vendor/inventory?search=keep#position")!
 var isLoading = false
 let configuration = Configuration()
 var loads: [URL] = []
 func load(_ request: URLRequest) { loads.append(request.url!); url = request.url }
}
struct Config { let origin = URL(string:"https://trashed.app")! }
final class Host {
 var webView: WebView? = WebView()
 var nativeNavigationAvailable = true
 var presentedViewController: Bool? = nil
 var nativeWorkspaceController: Bool? = nil
 var nativeWorkspaceDismissing = false
 var directWorkspace: WorkspaceDirectNavigation?
 var workspaceNavigationGeneration = UUID()
 var nativeWorkspaceURL: URL?
 var nativeWorkspaceBypass: WorkspaceRoute?
 var lastWebWorkspaceURL: URL?
 var presentations = 0
 var dismissals = 0
 func makeDriverAuthConfig() -> Config { Config() }
 func presentNativeWorkspace(route: WorkspaceRoute, url: URL, origin: URL, store: WKHTTPCookieStore) {
   presentations += 1; nativeWorkspaceURL = url; nativeWorkspaceController = true
 }
 func dismissNativeWorkspace(completion: (() -> Void)? = nil) {
   dismissals += 1; directWorkspace = nil; nativeWorkspaceController = nil; completion?()
 }
${entry}
${close.replace('private func closeNativeWorkspace', 'func closeNativeWorkspace')}
}
func check(_ value: @autoclosure () -> Bool, _ label: String) { if !value() { fatalError(label) } }
let origin = Config().origin
for action in ["vendor-dashboard", "vendor-profile", "vendor-call-history"] {
 let host = Host(); let source = host.webView!.url
 check(host.consumeNativeWorkspaceAction(action, context:"session1"), "known action consumed")
 check(host.presentations == 1 && host.webView!.loads.isEmpty, "frame without web request")
 check(host.webView!.url == source && host.directWorkspace?.sourceURL == source, "source untouched")
 let entry = host.directWorkspace!
 check(WorkspaceRoute.parse(entry.destinationURL, origin:origin) == entry.route, "canonical destination")
 check(entry.remainsValid(currentURL:source, loading:false, context:"session1", visible:true), "stable resume")
 check(!entry.remainsValid(currentURL:source, loading:true, context:"session1", visible:true), "in-flight reload")
 check(!entry.remainsValid(currentURL:source, loading:false, context:"session2", visible:true), "tenant change")
 check(!entry.remainsValid(currentURL:source, loading:false, context:"session1", visible:false), "logout")
 check(!entry.remainsValid(currentURL:origin, loading:false, context:"session1", visible:true), "redirect")
 host.closeNativeWorkspace()
 check(host.dismissals == 1 && host.webView!.loads.isEmpty && host.webView!.url == source, "Back without web roundtrip")
}
let calls = WorkspaceDirectNavigation.begin(action:"vendor-call-history", sourceURL:origin, origin:origin,
 context:"session", workspace:true, loading:false, modalBusy:false)!
check(calls.route == .calls(WorkspaceCallsQuery()), "canonical empty/all/timestamp-desc")
let query = URLComponents(url:calls.destinationURL, resolvingAgainstBaseURL:false)!.queryItems!
check(query == [URLQueryItem(name:"search",value:""),URLQueryItem(name:"filter",value:"all"),URLQueryItem(name:"sort",value:"timestamp-desc")], "explicit canonical query")
for action in ["vendor-inventory", "logout", "profile", "calls", "https://trashed.app/vendor/profile", ""] {
 let host = Host(); check(!host.consumeNativeWorkspaceAction(action,context:"session"), "unknown action remains web-owned")
 check(host.presentations == 0 && host.webView!.loads.isEmpty, "unknown has no native side effect")
}
for url in ["https://evil.test/vendor", "http://trashed.app/vendor", "https://trashed.app:444/vendor", "https://u@trashed.app/vendor", "https://trashed.app/vendor/%2e%2e/api", "https://trashed.app/app/login"] {
 let host = Host(); host.webView!.url = URL(string:url)!
 check(!host.consumeNativeWorkspaceAction("vendor-profile",context:"session"), "unsafe source rejected")
}
let busy = Host(); busy.presentedViewController = true
check(!busy.consumeNativeWorkspaceAction("vendor-profile",context:"session"), "modal race rejected")
let loading = Host(); loading.webView!.isLoading = true
check(!loading.consumeNativeWorkspaceAction("vendor-profile",context:"session"), "loading rejected")
let cleared = Host(); check(cleared.consumeNativeWorkspaceAction("vendor-profile",context:"session"), "open before clear")
cleared.nativeWorkspaceNavigationChanged(context:nil,visible:false)
check(cleared.directWorkspace == nil && cleared.dismissals == 1 && cleared.webView!.loads.isEmpty, "clear dismisses without load")
print("PASS direct native production host + policy scenarios")
`);
    const build = spawnSync('xcrun', ['swiftc', root + 'ios/App/App/NativeWorkspacePolicy.swift', join(dir, 'main.swift'), '-o', join(dir, 'test')], { encoding: 'utf8', timeout: 60000 });
    assert.equal(build.status, 0, build.stderr);
    const run = spawnSync(join(dir, 'test'), [], { encoding: 'utf8', timeout: 10000 });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /PASS direct native production host/);
    console.log(run.stdout.trim());
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
