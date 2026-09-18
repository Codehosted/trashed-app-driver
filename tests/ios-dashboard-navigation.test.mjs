import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync, writeFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const root = new URL('../', import.meta.url).pathname;
const read = name => readFileSync(root + 'ios/App/App/' + name, 'utf8');
const shell = read('MainViewController.swift');
const between = (text, a, b) => text.slice(text.indexOf(a), text.indexOf(b, text.indexOf(a)));

test('dashboard is a child-owned native root, not HTML plus modal', () => {
  const presentation = between(shell, '    private func presentNativeWorkspace', '    private func dismissNativeWorkspace');
  assert.match(presentation, /isRoot = isRoot \|\| route == \.dashboard/);
  assert.match(presentation, /addChild\(controller\)/);
  assert.match(presentation, /if !isRoot \{ self\?\.closeNativeWorkspace/);
  assert.match(presentation, /webView\?\.stopLoading\(\); webView\?\.isHidden = true/);
  assert.doesNotMatch(presentation, /\.load\(/);
  const plugin = between(read('TrashedNavigationPlugin.swift'), '    override public func shouldOverrideLoad', '    func refresh');
  assert.match(plugin, /interceptWorkspaceHome\(url\) == true \{ return true \}/);
  assert.ok(plugin.indexOf('interceptWorkspaceHome') < plugin.indexOf('targetFrame'));
  const ui = read('NativeWorkspaceView.swift');
  assert.match(ui, /NavigationStack\(path: \$path\)/);
  assert.match(ui, /if !isRoot \{ Button\("Close"/);
  assert.match(ui, /Button\("Profile"\).*path = \[\.profile\]/);
  assert.match(ui, /Button\("Calls"\).*path = \[\.calls/);
  assert.match(ui, /More destinations · Web/);
  assert.match(shell, /if nativeWorkspaceRoot \{ return \} \/\/ Blank WebView KVO/);
  assert.match(shell, /workspaceBootstrap\?\.cancel\(\); workspaceBootstrap = nil/);
  assert.match(shell, /configuration.websiteDataStore = \.nonPersistent\(\)/);
});

test('executable production bootstrap and routing reject HTML, unsafe URLs, denied roles and late auth', {skip: process.platform !== 'darwin', timeout: 90000}, () => {
  const dir = mkdtempSync(join(tmpdir(), 'dashboard-navigation-'));
  try {
    const bootstrap = between(shell, '    private func bootstrapWorkspace(', '    #if DEBUG && targetEnvironment(simulator)\n    // Exercise').replace('private func bootstrapWorkspace', 'func bootstrapWorkspace');
    const entry = between(shell, '    private func loadDriverApp(', '    private func signIn(').replace('private func loadDriverApp', 'func loadDriverApp');
    const home = between(shell, '    @objc private func returnFromWorkspaceLoad()', '    @available(iOS 16.0, *)\n    func prepareNativePushLogout').replace('@objc private func', 'func');
    writeFileSync(join(dir, 'Harness.swift'), `import Foundation
final class WKHTTPCookieStore {}
struct Store { let httpCookieStore = WKHTTPCookieStore() }
struct Configuration { let websiteDataStore = Store() }
final class WebView {
 let configuration = Configuration(); var isHidden = false; var allowsBackForwardNavigationGestures = false; var loads: [URL] = []
 func stopLoading() {} ; func load(_ request: URLRequest) { loads.append(request.url!) }
}
struct DriverAuthConfig { let origin: URL; func driverURL(theme: Bool) -> URL { URL(string:"/app", relativeTo:origin)!.absoluteURL } }
struct History { mutating func beginSession() {} }
final class Gesture { var isEnabled = false }
final class Plugin { func reset() {} }
enum Style { case alert, cancel, \`default\` }
final class UIAlertAction { init(title:String, style:Style, handler:((UIAlertAction)->Void)? = nil) {} }
final class UIAlertController { init(title:String, message:String?, preferredStyle:Style) {}; func addAction(_ action:UIAlertAction) {} }
@MainActor final class WorkspaceAPI {
 static var current: WorkspaceProfile!; static var failure: Error?; static var reads=0
 static var pending: CheckedContinuation<WorkspaceProfile,Error>?; static var delay=false
 init(origin:URL,cookieStore:WKHTTPCookieStore) {}
 func profile() async throws -> WorkspaceProfile { Self.reads += 1; if Self.delay { return try await withCheckedThrowingContinuation { Self.pending=$0 } }; if let error=Self.failure { throw error }; return Self.current }
 func close() {}
}
@MainActor final class Host {
 var webView: WebView? = WebView(); var onboardingReady=true; var nativeOnboardingController: Bool?; var nativeLoginController: Bool?
 var workspaceHistory=History(); var historyEdgeGesture: Gesture? = Gesture(); var currentDriverTheme=false
 var workspaceBootstrap: Task<Void,Never>?; var workspaceBootstrapGeneration=UUID(); var roots=0; var alerts=0; var logins=0
 var workspaceLoadCover: Bool?; var recoveryFailures=0
 let nativeNavigation=Plugin(), nativeChat=Plugin()
 func clearWorkspaceLoadCover() { workspaceLoadCover=nil }
 func showWorkspaceLoadCover(target:URL) { workspaceLoadCover=true }
 func workspaceLoadFailed(_ navigation:Bool?) { recoveryFailures += 1 }
 func startWorkspaceWebLoad(_ url:URL) { webView?.load(URLRequest(url:url)) }
 func makeDriverAuthConfig()->DriverAuthConfig { DriverAuthConfig(origin:URL(string:"https://trashed.app")!) }
 func presentNativeWorkspace(route:WorkspaceRoute,url:URL,origin:URL,store:WKHTTPCookieStore,isRoot:Bool=false,profile:WorkspaceProfile?=nil) { precondition(route == .dashboard && isRoot && profile != nil); roots += 1; clearWorkspaceLoadCover() }
 func presentNativeLogin(_ config:DriverAuthConfig) { logins += 1; clearWorkspaceLoadCover() }
 func stopWorkspacePush() {}
 func present(_ alert:UIAlertController,animated:Bool) { alerts += 1 }
${bootstrap}
${entry}
${home}
}
func profile(_ roles:[String], vendor:Int?=2, permissions:[String:Bool]?=nil) -> WorkspaceProfile {
 WorkspaceProfile(user:.init(id:1,name:"Fixture",email:"fixture@example.invalid",phone:nil,image:nil,roles:roles,vendor:vendor.map{.init(id:$0,businessName:"Fixture")},emailVerified:true,vendorPermissions:permissions),capabilities:.init(calls:true))
}
func check(_ yes:@autoclosure()->Bool,_ label:String) { if !yes() { fatalError(label) } }
@main struct Run { @MainActor static func main() async {
 let origin=URL(string:"https://trashed.app")!, config=DriverAuthConfig(origin:URL(string:"https://trashed.app")!)
 for roles in [["vendor"],["manager"],["admin","vendor"]] {
   WorkspaceAPI.current=profile(roles); let host=Host(); host.loadDriverApp(config); await host.workspaceBootstrap?.value
   check(host.roots==1 && host.webView!.loads.isEmpty,"eligible bootstrap never loads /app or dashboard HTML")
 }
 for (p, expected) in [(profile(["driver"]),"/driver"),(profile(["admin"],vendor:nil),"/admin"),(profile(["customer"]),"/"),(profile(["manager"],permissions:["dashboard":false,"customers":true]),"/vendor/customers"),(profile(["vendor"],permissions:[:]),"/vendor/assistant")] {
   WorkspaceAPI.current=p; let host=Host(); host.loadDriverApp(config); await host.workspaceBootstrap?.value
   check(host.roots==0 && host.webView!.loads.map(\\.path)==[expected],"non-dashboard fallback preserves roles")
 }
 for raw in ["https://trashed.app/app?callbackUrl=https://evil.test#x", "https://trashed.app/vendor/dashboard?url=javascript:bad#https://evil.test", "https://trashed.app/vendor/dashboard/"] {
   check(WorkspaceHomeRouting.isHomeTarget(URL(string:raw)!,origin:origin),"query and fragment are ignored, never destinations")
 }
 for raw in ["https://evil.test/vendor/dashboard","http://trashed.app/vendor/dashboard","https://trashed.app:444/vendor/dashboard","https://user@trashed.app/vendor/dashboard","https://trashed.app/vendor/%64ashboard","https://trashed.app/vendor/dashboard/../profile","https://trashed.app/vendor/dashboard%2fextra","https://trashed.app/vendor/profile"] {
   check(!WorkspaceHomeRouting.isHomeTarget(URL(string:raw)!,origin:origin),"unsafe/non-home URL not admitted")
 }
 WorkspaceAPI.failure=WorkspaceError.expired; let expired=Host(); expired.loadDriverApp(config); await expired.workspaceBootstrap?.value
 check(expired.logins==1 && expired.roots==0 && expired.webView!.loads.isEmpty,"expired goes to native login without HTML")
 WorkspaceAPI.failure=WorkspaceError.server("offline"); let offline=Host(); offline.loadDriverApp(config); await offline.workspaceBootstrap?.value
 check(offline.alerts==1 && offline.webView!.loads.isEmpty,"offline offers retry without HTML fallback")
 WorkspaceAPI.failure=nil; WorkspaceAPI.delay=true; let late=Host(); late.loadDriverApp(config)
 while WorkspaceAPI.pending==nil { await Task.yield() }
 late.workspaceBootstrapGeneration=UUID(); WorkspaceAPI.pending!.resume(returning:profile(["vendor"])); await late.workspaceBootstrap?.value
 check(late.roots==0 && late.webView!.loads.isEmpty,"late identity result cannot restore retired root")
 WorkspaceAPI.pending=nil; WorkspaceAPI.delay=true; let recovery=Host(); recovery.workspaceLoadCover=true
 recovery.returnFromWorkspaceLoad()
 while WorkspaceAPI.pending==nil { await Task.yield() }
 check(recovery.workspaceLoadCover==true && recovery.roots==0,"Home retains recovery surface throughout pending profile")
 WorkspaceAPI.pending!.resume(throwing:WorkspaceError.server("offline")); await recovery.workspaceBootstrap?.value
 check(recovery.workspaceLoadCover==true && recovery.recoveryFailures==1,"offline Home retains retry surface")
 WorkspaceAPI.pending=nil; recovery.returnFromWorkspaceLoad()
 while WorkspaceAPI.pending==nil { await Task.yield() }
 WorkspaceAPI.pending!.resume(returning:profile(["vendor"])); await recovery.workspaceBootstrap?.value
 check(recovery.roots==1 && recovery.workspaceLoadCover==nil,"successful native root clears recovery surface")
 WorkspaceAPI.delay=false; WorkspaceAPI.current=profile(["driver"]); let fallback=Host();fallback.workspaceLoadCover=true
 fallback.returnFromWorkspaceLoad();await fallback.workspaceBootstrap?.value
 check(fallback.workspaceLoadCover==true && fallback.webView!.loads.last?.path=="/driver","role fallback retains cover until navigation completion")
 WorkspaceAPI.failure=WorkspaceError.expired;let signedOut=Host();signedOut.workspaceLoadCover=true
 signedOut.returnFromWorkspaceLoad();await signedOut.workspaceBootstrap?.value
 check(signedOut.logins==1 && signedOut.workspaceLoadCover==nil,"expired recovery transfers to native login")
 print("PASS native dashboard bootstrap, role fallback, URL admission, expiry, offline, stale results and recovery Home")
} }
`);
    let result = spawnSync('xcrun', ['swiftc', '-parse-as-library', root + 'ios/App/App/NativeWorkspacePolicy.swift', join(dir, 'Harness.swift'), '-o', join(dir, 'run')], {encoding:'utf8',timeout:60000});
    assert.equal(result.status, 0, result.stderr);
    result = spawnSync(join(dir, 'run'), [], {encoding:'utf8',timeout:15000});
    assert.equal(result.status, 0, result.stderr);
    console.log(result.stdout.trim());
  } finally { rmSync(dir, {recursive:true,force:true}); }
});
