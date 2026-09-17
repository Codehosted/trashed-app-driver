import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = new URL('..', import.meta.url).pathname;
const read = path => readFileSync(join(root, path), 'utf8');
const source = read('ios/App/App/TrashedNavigationPlugin.swift');
const controller = read('ios/App/App/MainViewController.swift');
const policy = source.slice(source.indexOf('struct NativeNavigationItem'), source.indexOf('@objc(TrashedNavigationPlugin)'));
const base = {version: 1, context: 'opaque_context-1', revision: 1, visible: true, appearance: 'light', tabs: [
  {id: 'manage', label: 'Manage', icon: 'manage', badge: 0, selected: false, items: [
    {id: 'inventory', label: 'Inventory', icon: 'inventory', detail: 'Stock management', selected: true},
    {id: 'logout', label: 'Log out', icon: 'logout', destructive: true},
  ]},
  {id: 'dashboard', label: 'Dashboard', icon: 'dashboard', badge: 999, selected: true, items: []},
]};
const modify = fn => { const value = structuredClone(base); fn(value); return value; };
const raw = value => JSON.stringify(JSON.stringify(value));
const bad = [
  modify(x => x.extra = 'bad'), modify(x => delete x.context), modify(x => x.version = true), modify(x => x.version = 2),
  ...['', 'a'.repeat(81), 'opaque context', 'context\n', 'https://trashed.app'].map(v => modify(x => x.context = v)),
  ...[0, -1, true, 1.5, '1', 2147483648].map(v => modify(x => x.revision = v)),
  modify(x => x.visible = 1), modify(x => x.appearance = 'automatic'), modify(x => x.tabs = null),
  modify(x => x.tabs[0].href = '/vendor'), modify(x => x.tabs[0].selected = 0), modify(x => x.tabs[0].badge = false),
  ...[-1, 1000, 1.5, '2'].map(v => modify(x => x.tabs[0].badge = v)),
  ...['', 'Uppercase', 'a'.repeat(49), 'under score', 'id\n'].map(v => modify(x => x.tabs[0].id = v)),
  ...['', 'x'.repeat(65), 'line\nbreak', 'bidi\u202e', 'tab\tlabel'].map(v => modify(x => x.tabs[0].label = v)),
  modify(x => x.tabs[0].icon = 'javascript'), modify(x => x.tabs[0].items[0].id = 'manage'),
  modify(x => x.tabs[0].items[0].id = 'dashboard'), modify(x => x.tabs[0].items[1].id = 'inventory'),
  modify(x => x.tabs[0].items[0].url = '/api/action'), modify(x => x.tabs[0].items[0].detail = 'a'.repeat(121)),
  modify(x => x.tabs[0].items[0].detail = null), modify(x => x.tabs[0].items[0].detail = '\u0000'),
  modify(x => x.tabs[0].items[0].selected = 1), modify(x => x.tabs[0].items[0].destructive = 'true'),
  modify(x => x.tabs[0].items[0].icon = 'unregistered'), modify(x => x.tabs[0].items[0].label = ''),
  modify(x => x.tabs[0].items[0].label = '😃'.repeat(33)),
  modify(x => x.tabs = Array.from({length:6}, (_, i) => ({...x.tabs[1], id:`tab${i}`}))),
  modify(x => x.tabs[0].items = Array.from({length:21}, (_, i) => ({id:`item${i}`, label:'Item', icon:'more'}))),
  modify(x => x.tabs = Array.from({length:4}, (_, t) => ({...x.tabs[0], id:`tab${t}`, items:Array.from({length:16}, (_, i) => ({id:`item${t}_${i}`, label:'Item', icon:'more'}))}))),
];

test('compiled Swift validates exact navigation schema, type/size bounds, icons and globally unique IDs', {skip: process.platform !== 'darwin'}, () => {
  const dir = mkdtempSync(join(tmpdir(), 'trashed-navigation-policy-'));
  try {
    const path = join(dir, 'main.swift');
    writeFileSync(path, `import Foundation\nimport CoreFoundation\n${policy}\n
func parse(_ value: String) -> NativeNavigationState? { NativeNavigationPolicy.parse(try! JSONSerialization.jsonObject(with: Data(value.utf8)) as! [String: Any]) }
let initial = parse(${raw(base)})!
assert(initial.tabs.count == 2 && initial.tabs[0].items[0].detail == "Stock management")
${bad.map(value => `assert(parse(${raw(value)}) == nil)`).join('\n')}
${['manage', 'inventory', 'pods', 'rentals', 'customers', 'dispatch', 'driver', 'assistant', 'calls', 'operator', 'settings', 'profile', 'inbox', 'support', 'appearance', 'logout', 'delete-account', 'workspace', 'dashboard', 'account', 'admin', 'map', 'messages', 'more'].map(icon => `assert(parse(${raw(modify(x=>x.tabs[0].icon=icon))}) != nil)`).join('\n')}
assert(parse(${raw(modify(x=>{ x.tabs=[];x.visible=false; }))}) != nil)
assert(parse(${raw(modify(x=>{ x.tabs[0].label='😃'.repeat(32);x.tabs[0].items[0].detail=''; }))}) != nil)
assert(NativeNavigationPolicy.integer(Double.nan, max: 999) == nil)
assert(NativeNavigationPolicy.integer(Double.infinity, max: 999) == nil)
var store = NativeNavigationStore()
assert(store.set(initial)); assert(!store.set(initial))
let newer = parse(${raw(modify(x=>x.revision=2))})!
assert(store.set(newer)); assert(!store.set(initial))
assert(store.clear(context: "other-context") == nil && store.state?.revision == 2)
assert(store.state?.selection(context: "opaque_context-1", tabID: "manage", itemID: "inventory")?["revision"] as? Int == 2)
assert(store.state?.selection(context: "opaque_context-1", tabID: "dashboard", itemID: "dashboard") != nil)
assert(store.state?.selection(context: "opaque_context-1", tabID: "manage", itemID: "manage") == nil)
assert(store.state?.selection(context: "opaque_context-1", tabID: "dashboard", itemID: "inventory") == nil)
assert(store.state?.selection(context: "old-context", tabID: "manage", itemID: "inventory") == nil)
let removed = parse(${raw(modify(x=>{x.revision=3;x.tabs[0].items.splice(0,1)}))})!
assert(store.set(removed)); assert(store.state?.selection(context: "opaque_context-1", tabID: "manage", itemID: "inventory") == nil)
let hidden = parse(${raw(modify(x=>{x.revision=4;x.visible=false;}))})!
assert(store.set(hidden)); assert(store.state?.selection(context: "opaque_context-1", tabID: "manage", itemID: "inventory") == nil)
let other = parse(${raw(modify(x=>{x.context='new-context';}))})!
assert(store.set(other)); assert(store.state?.revision == 1)
assert(store.clear(context: "opaque_context-1") == nil)
assert(store.clear(context: "new-context") == "new-context"); assert(store.state == nil)
assert(store.set(initial)); assert(store.clear() == "opaque_context-1"); assert(store.clear() == nil)
let origin = URL(string: "https://trashed.app/app?source=trashed-app")!
for value in ["https://trashed.app/vendor", "https://trashed.app/vendor/inventory", "https://trashed.app/calls/history", "https://trashed.app/driver?view=profile", "https://trashed.app/admin", "https://TRASHED.APP:443/vendor"] {
 assert(NativeNavigationPolicy.isWorkspace(URL(string:value), configured:origin))
}
for value in ["https://trashed.app/vendor-other", "https://trashed.app/drivers", "https://trashed.app/app/login", "https://trashed.app/support", "https://trashed.app/api/auth/signout", "https://trashed.app.evil/vendor", "http://trashed.app/vendor", "https://trashed.app:444/vendor", "https://u@trashed.app/vendor", "https://:p@trashed.app/vendor", "https://trashed.app/vendor/%2e%2e/api", "https://trashed.app/vendor/%5capi", "about:blank"] {
 assert(!NativeNavigationPolicy.isWorkspace(URL(string:value), configured:origin))
}
assert(NativeNavigationPolicy.isWorkspace(URL(string:"http://192.168.68.80:3000/driver"), configured:URL(string:"http://192.168.68.80:3000/app")))
assert(!NativeNavigationPolicy.isWorkspace(URL(string:"http://localhost:3000/driver"), configured:URL(string:"http://192.168.68.80:3000/app")))
assert(!NativeNavigationPolicy.isWorkspace(nil, configured:origin))
assert(!NativeNavigationPolicy.isWorkspace(origin, configured:nil))
`);
    const compiled = spawnSync('swiftc', [path, '-o', join(dir, 'policy')], {encoding:'utf8',timeout:60000});
    assert.equal(compiled.status, 0, compiled.stderr || compiled.stdout);
    const run = spawnSync(join(dir,'policy'), [], {encoding:'utf8',timeout:10000});
    assert.equal(run.status, 0, run.stderr || run.stdout);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test('iOS uses real UIKit controls and preserves one safe-area bounded WebView', () => {
  assert.match(source,/private let bar = UITabBar\(\)/);
  assert.match(source,/class NativeNavigationTable: UITableViewController/);
  assert.match(source,/controller.modalPresentationStyle = \.pageSheet/);
  assert.match(source,/if #available\(iOS 15.0, \*\) \{\s*controller.sheetPresentationController\?\.detents = \[\.medium\(\), \.large\(\)\]/);
  assert.match(source,/heightAnchor.constraint\(greaterThanOrEqualToConstant: 56\)/);
  assert.match(source,/adjustsFontForContentSizeCategory = true/);
  assert.match(source,/appearance.configureWithOpaqueBackground\(\)/);
  assert.match(source,/private let primary = NativeAdaptivePalette.accent/);
  assert.match(controller,/bridge\?\.registerPluginInstance\(nativeNavigation\)/);
  assert.match(controller,/nativeWebBottom\?\.constant = -height/);
  assert.match(source,/bar.bottomAnchor.constraint\(equalTo: container.safeAreaLayoutGuide.bottomAnchor\)/);
  assert.match(source,/host\?\.setNativeNavigationHeight\(0\)/);
  assert.match(source,/barBackground.bottomAnchor.constraint\(equalTo: container.bottomAnchor\)/);
  assert.doesNotMatch(source,/bar.superview\?\.backgroundColor/);
  assert.match(source,/UIResponder.keyboardWillChangeFrameNotification/);
  assert.match(source,/UIResponder.keyboardWillHideNotification/);
  assert.match(source,/!keyboardVisible/);
  assert.match(source,/deinit \{ observers.forEach/);
  assert.doesNotMatch(source,/WKWebView\(|UserDefaults|URLSession|evaluateJavaScript|load\(URLRequest|print\(|CAPLog/);
});

test('bridge ACK/event/reset lifecycle retains native auth, document, modal and history boundaries', () => {
  assert.match(source,/jsName = "TrashedNavigation"/);
  assert.match(source,/call.resolve\(\["context": next.context, "revision": next.revision\]\)/);
  assert.match(source,/notifyListeners\("select", data: event, retainUntilConsumed: false\)/);
  assert.match(source,/notifyListeners\("reset", data: \["context": context\], retainUntilConsumed: false\)/);
  assert.match(source,/sheet.dismiss\(animated: true\) \{[\s\S]*?self.emit\(context: context, tabID: tabID, itemID: itemID\)/);
  assert.match(source,/let event = store.state\?\.selection\(context: context, tabID: tabID, itemID: itemID\)/);
  assert.match(source,/shouldOverrideLoad[\s\S]*?targetFrame\?\.isMainFrame == true \{ reset\(\) \}[\s\S]*?return nil/);
  assert.match(controller,/if webView.isLoading \{ self\?\.nativeNavigation.reset\(\); self\?\.nativeChat.reset\(purge: !NativeChatPolicy.isAssistant\(webView.url, configured: self\?\.bridge\?\.config.serverURL\)\) \}/);
  assert.match(controller,/if !NativeNavigationPolicy.isWorkspace\(url, configured: self.bridge\?\.config.serverURL\) \{ self.nativeNavigation.reset\(\); self.nativeChat.reset\(\) \}/);
  assert.match(controller,/private func presentNativeOnboarding\(\) \{\s*nativeNavigation.reset\(\)/);
  assert.match(controller,/private func presentNativeLogin[\s\S]*?nativeNavigation.reset\(\)/);
  assert.match(controller,/nativeNavigationAvailable: Bool \{\s*onboardingReady && nativeOnboardingController == nil && nativeLoginController == nil\s*&& webView\?\.isLoading == false/);
  const history = controller.slice(controller.indexOf('@objc private func handleHistoryEdge'), controller.indexOf('private func presentNativeOnboarding'));
  assert.ok(history.indexOf('nativeNavigation.dismissSheet()') < history.indexOf('webView.evaluateJavaScript'));
  assert.match(history,/webView.go\(to: target\)/);
  const project=read('ios/App/App.xcodeproj/project.pbxproj');
  assert.equal((project.match(/TrashedNavigationPlugin.swift in Sources/g)||[]).length,2);
  assert.match(read('ios/App/Podfile'),/platform :ios, '14.0'/);
});
