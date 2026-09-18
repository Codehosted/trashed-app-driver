import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';

const root = new URL('..', import.meta.url).pathname;
const read = path => readFileSync(join(root, path), 'utf8');
const ios = read('ios/App/App/MainViewController.swift');
const android = read('android/app/src/main/java/com/trashed/driver/MainActivity.java');
const allowed = ['/vendor', '/vendor/customers/one', '/driver', '/driver/routes', '/calls/history', '/calls/monitor', '/admin', '/admin/vendors', '/vendor%2Fcustomers'];
const denied = ['/app', '/app/login', '/api/auth/signin', '/partners/login', '/', '/vendor-other', '/drivers', '/callsign', '/vendor/../api', '/vendor/%2e%2e/api', '/vendor/%5capi', '/admins', '/admin-other', '/vendor%2f..%2fapi'];
function run(binary, args) {
  const result = spawnSync(binary, args, { encoding: 'utf8', timeout: 60000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test('compiled Swift exact-target history policy respects swipe direction and resets the account boundary', { skip: process.platform !== 'darwin' }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'trashed-history-swift-'));
  try {
    const policy = ios.slice(ios.indexOf('private struct NativeWorkspaceHistory'), ios.indexOf('private enum DriverTheme'));
    const path = join(directory, 'history.swift');
    writeFileSync(path, `import Foundation\n${policy}
      let origin = URL(string: "https://trashed.app")!
      func url(_ path: String) -> URL { URL(string: "https://trashed.app" + path)! }
      ${allowed.map(path => `assert(NativeWorkspaceHistory.isWorkspaceURL(url(${JSON.stringify(path)}), origin: origin))`).join('\n')}
      ${denied.map(path => `assert(!NativeWorkspaceHistory.isWorkspaceURL(url(${JSON.stringify(path)}), origin: origin))`).join('\n')}
      for value in ["http://trashed.app/vendor", "https://trashed.app:444/vendor", "https://trashed.app.evil.test/vendor", "https://user@trashed.app/vendor", "https://:password@trashed.app/vendor", "file:///vendor", "about:blank"] {
        assert(!NativeWorkspaceHistory.isWorkspaceURL(URL(string: value), origin: origin))
      }
      assert(NativeWorkspaceHistory.isWorkspaceURL(URL(string: "https://TRASHED.APP:443/vendor"), origin: origin))
      assert(NativeWorkspaceHistory.isWorkspaceURL(URL(string: "http://localhost:3000/vendor"), origin: URL(string: "http://localhost:3000")!))
      assert(!NativeWorkspaceHistory.isWorkspaceURL(URL(string: "http://localhost:3001/vendor"), origin: URL(string: "http://localhost:3000")!))
      for path in ["/app/login", "/partners/login", "/api/auth/signin", "/api/auth/signout", "/api/auth/callback/google"] { assert(NativeWorkspaceHistory.isAuthenticationURL(url(path))) }
      assert(!NativeWorkspaceHistory.isAuthenticationURL(url("/vendor"))); assert(!NativeWorkspaceHistory.isAuthenticationURL(nil))
      private var state = NativeWorkspaceHistory()
      func allowed(_ index: Int, _ back: URL? = url("/vendor/account-a"), _ visible: Bool = true) -> Bool {
        state.canGoBack(index: index, current: url("/vendor/current"), back: back, origin: origin, visible: visible)
      }
      assert(!NativeWorkspaceHistory.isBackSwipe(x: 63, y: 0)); assert(NativeWorkspaceHistory.isBackSwipe(x: 64, y: 10))
      assert(!NativeWorkspaceHistory.isBackSwipe(x: -100, y: 0)); assert(!NativeWorkspaceHistory.isBackSwipe(x: 100, y: 100))
      for start in [0.0, 1.0, 8.0, 24.0] {
        assert(NativeWorkspaceHistory.isBackSwipeStart(x: start))
        assert(NativeWorkspaceHistory.canBeginBackSwipe(startX: start, x: 12, y: 1, touches: 1))
      }
      for start in [-1.0, 24.1, 100.0, 440.0, Double.nan, Double.infinity] {
        assert(!NativeWorkspaceHistory.isBackSwipeStart(x: start))
        assert(!NativeWorkspaceHistory.canBeginBackSwipe(startX: start, x: 100, y: 0, touches: 1))
      }
      for (x, y) in [(0.0, 0.0), (-12.0, 0.0), (1.0, 12.0), (1.0, -12.0), (12.0, 8.0)] {
        assert(!NativeWorkspaceHistory.canBeginBackSwipe(startX: 8, x: x, y: y, touches: 1))
      }
      for touches in [0, 2, 3] { assert(!NativeWorkspaceHistory.canBeginBackSwipe(startX: 8, x: 100, y: 0, touches: touches)) }
      for path in ["/support", "/faq", "/privacy", "/terms", "/cookies", "/legal"] {
        assert(NativeWorkspaceHistory.isSameOriginURL(url(path), origin: origin)); assert(!NativeWorkspaceHistory.isWorkspaceURL(url(path), origin: origin))
      }
      assert(!allowed(7)); state.beginSession()
      state.update(index: 4, workspace: false, committed: true); assert(!allowed(7)) // /app redirect is not a floor.
      state.update(index: 5, workspace: true, committed: false); assert(!allowed(7))
      state.update(index: 6, workspace: true, committed: true); assert(!allowed(6)); assert(allowed(7)) // Blank/native-login history before floor is fine; exact target only.
      assert(!allowed(7, url("/app/login"))); assert(!allowed(7, url("/support")))
      assert(!allowed(7, URL(string: "https://evil.test/vendor"))); assert(!allowed(7, nil)); assert(!allowed(7, url("/vendor/a"), false))
      assert(allowed(7, url("/admin/vendors")))
      state.update(index: 6, workspace: true, committed: true); assert(!allowed(6)) // Pop to session root.
      state.update(index: 7, workspace: true, committed: true); assert(allowed(7)) // pushState after pop.
      state.reset(); assert(!allowed(7)); state.beginSession() // Account A signs out; account B signs in.
      state.update(index: 8, workspace: false, committed: true); assert(!allowed(9))
      state.update(index: 9, workspace: true, committed: false); assert(!allowed(9))
      state.update(index: 10, workspace: true, committed: true); assert(!allowed(10, url("/vendor/account-a"))) // Never pop to old account A.
      state.update(index: 11, workspace: true, committed: true); assert(allowed(11, url("/vendor/account-b")))
      state.update(index: 8, workspace: true, committed: true); assert(!allowed(11)) // Unexpected web pop beyond floor fails closed.
      state.update(index: 12, workspace: true, committed: true); assert(!allowed(12))

    `);
    run('swift', [path]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('compiled Swift simultaneous admission cooperates only with contained WebView touch plumbing', { skip: process.platform !== 'darwin' }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'trashed-history-gesture-swift-'));
  try {
    const start = ios.indexOf('    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith');
    const end = ios.indexOf('    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive', start);
    assert.ok(start >= 0 && end > start);
    const method = ios.slice(start, end);
    assert.doesNotMatch(method, /NSClassFromString|String\(describing|WKTouch|WKDeferring/);
    const path = join(directory, 'gesture.swift');
    // UIKit cannot execute on the macOS host. Compile the actual admission method
    // with hierarchy/type fixtures; actual UIKit timing remains the simulator UI gate.
    writeFileSync(path, `
      class UIView {
        var superview: UIView?
        init(_ parent: UIView? = nil) { superview = parent }
        func isDescendant(of view: UIView) -> Bool { self === view || superview?.isDescendant(of: view) == true }
      }
      class UIGestureRecognizer { var view: UIView?; init(_ view: UIView? = nil) { self.view = view } }
      class UIPanGestureRecognizer: UIGestureRecognizer {}
      class UIPinchGestureRecognizer: UIGestureRecognizer {}
      class UIRotationGestureRecognizer: UIGestureRecognizer {}
      class UITapGestureRecognizer: UIGestureRecognizer {}
      class UILongPressGestureRecognizer: UIGestureRecognizer {}
      class Harness {
        var historyEdgeGesture: UIGestureRecognizer? = UIPanGestureRecognizer()
        var webView: UIView? = UIView()
        ${method}
      }
      let harness = Harness(), outside = UIView()
      let web = harness.webView!, content = UIView(harness.webView), nested = UIView()
      nested.superview = content
      let edge = harness.historyEdgeGesture!
      for owner in [web, content, nested] {
        assert(harness.gestureRecognizer(edge, shouldRecognizeSimultaneouslyWith: UIGestureRecognizer(owner)))
        for other in [UIPanGestureRecognizer(owner), UIPinchGestureRecognizer(owner), UIRotationGestureRecognizer(owner), UITapGestureRecognizer(owner), UILongPressGestureRecognizer(owner)] {
          assert(!harness.gestureRecognizer(edge, shouldRecognizeSimultaneouslyWith: other))
        }
      }
      assert(!harness.gestureRecognizer(edge, shouldRecognizeSimultaneouslyWith: UIGestureRecognizer(outside)))
      assert(!harness.gestureRecognizer(edge, shouldRecognizeSimultaneouslyWith: UIGestureRecognizer()))
      assert(!harness.gestureRecognizer(UIPanGestureRecognizer(), shouldRecognizeSimultaneouslyWith: UIGestureRecognizer(content)))
      harness.webView = nil
      assert(!harness.gestureRecognizer(edge, shouldRecognizeSimultaneouslyWith: UIGestureRecognizer(content)))
    `);
    run('swift', [path]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('compiled Java history policy supports push/pop but never crosses a previous account boundary', () => {
  const directory = mkdtempSync(join(tmpdir(), 'trashed-history-java-'));
  try {
    const source = join(directory, 'NativeWorkspaceHistory.java');
    writeFileSync(source, read('android/app/src/main/java/com/trashed/driver/NativeWorkspaceHistory.java'));
    const harness = join(directory, 'HistoryTest.java');
    writeFileSync(harness, `package com.trashed.driver;
      class HistoryTest { public static void main(String[] args) {
        String origin = "https://trashed.app";
        ${allowed.map(path => `assert NativeWorkspaceHistory.isWorkspaceURL(origin + ${JSON.stringify(path)}, origin);`).join('\n')}
        ${denied.map(path => `assert !NativeWorkspaceHistory.isWorkspaceURL(origin + ${JSON.stringify(path)}, origin);`).join('\n')}
        for (String value : new String[]{null, "http://trashed.app/vendor", "https://trashed.app:444/vendor", "https://trashed.app.evil.test/vendor", "https://user@trashed.app/vendor", "https://:password@trashed.app/vendor", "file:///vendor", "about:blank"}) assert !NativeWorkspaceHistory.isWorkspaceURL(value, origin);
        assert NativeWorkspaceHistory.isWorkspaceURL("https://TRASHED.APP:443/vendor", origin);
        assert NativeWorkspaceHistory.isWorkspaceURL("http://localhost:3000/vendor", "http://localhost:3000");
        assert !NativeWorkspaceHistory.isWorkspaceURL("http://localhost:3001/vendor", "http://localhost:3000");
        for (String path : new String[]{"/app/login", "/partners/login", "/api/auth/signin", "/api/auth/signout", "/api/auth/callback/google"}) assert NativeWorkspaceHistory.isAuthenticationURL(origin + path);
        assert !NativeWorkspaceHistory.isAuthenticationURL(origin + "/vendor"); assert !NativeWorkspaceHistory.isAuthenticationURL(null);
        for (String path : new String[]{"/support", "/faq", "/privacy", "/terms", "/cookies", "/legal"}) {
          assert NativeWorkspaceHistory.isSameOriginURL(origin + path, origin);
          assert !NativeWorkspaceHistory.isWorkspaceURL(origin + path, origin);
        }
        assert !NativeWorkspaceHistory.isSameOriginURL("https://evil.test/support", origin);
        assert !NativeWorkspaceHistory.isSameOriginURL("https://user@trashed.app/support", origin);
        NativeWorkspaceHistory state = new NativeWorkspaceHistory();
        assert !state.canGoBack(7); state.beginSession();
        state.update(4, false, true); assert !state.canGoBack(7);
        state.update(5, true, false); assert !state.canGoBack(7);
        state.update(6, true, true); assert !state.canGoBack(6); assert state.canGoBack(7);
        state.update(6, true, true); assert !state.canGoBack(6);
        state.update(7, true, true); assert state.canGoBack(7);
        state.reset(); assert !state.canGoBack(7); state.beginSession();
        state.update(8, false, true); assert !state.canGoBack(9);
        state.update(9, true, false); assert !state.canGoBack(9);
        state.update(10, true, true); assert !state.canGoBack(10);
        state.update(11, true, true); assert state.canGoBack(11);
        state.update(8, true, true); assert !state.canGoBack(11);
        state.update(12, true, true); assert !state.canGoBack(12);
      }}
    `);
    const home = process.env.JAVA_HOME || '/opt/homebrew/opt/openjdk@21';
    run(join(home, 'bin/javac'), ['-d', directory, source, harness]);
    run(join(home, 'bin/java'), ['-ea', '-cp', directory, 'com.trashed.driver.HistoryTest']);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('history integration preserves single bridges, native overlays and Capacitor intent/delegate policy', () => {
  assert.doesNotMatch(ios, /UINavigationController\(|pushViewController\(|reloadFromOrigin\(/);
  // One outcome observer forwards Capacitor's existing navigation delegate; it
  // must not replace its URL/permission policy or add a second script bridge.
  assert.equal([...ios.matchAll(/navigationDelegate\s*=/g)].length, 1);
  assert.match(ios, /WorkspaceLoadDelegate\(forward: delegate, host: self\)/);
  assert.match(ios, /forwardingTarget\(for aSelector: Selector!\)/);
  assert.match(ios, /forward\.webView\?\(webView, didFinish: navigation\)/);
  assert.match(ios, /forward\.webView\?\(webView, didFail: navigation, withError: error\)/);
  for (const property of ['canGoBack', 'isLoading', 'url']) assert.ok(ios.includes(`observe(\\.${property}`));
  assert.match(ios, /let edge = UIPanGestureRecognizer/);
  assert.doesNotMatch(ios, /UIScreenEdgePanGestureRecognizer/);
  assert.match(ios, /edge.maximumNumberOfTouches = 1/);
  assert.match(ios, /edge.delegate = self/);
  assert.match(ios, /panGestureRecognizer.require\(toFail: edge\)/);
  assert.match(ios, /touch.type == \.direct && NativeWorkspaceHistory.isBackSwipeStart/);
  assert.match(ios, /let startX = pan.location\(in: view\).x - delta.x/);
  assert.match(ios, /NativeWorkspaceHistory.canBeginBackSwipe[\s\S]*touches: pan.numberOfTouches/);
  assert.match(ios, /webView.go\(to: target\)/);
  assert.match(ios, /history.currentItem === start.item/);
  assert.match(ios, /history.backItem === target/);
  assert.doesNotMatch(ios, /allowsBackForwardNavigationGestures = (?!false)|webView.goBack\(/);
  assert.match(ios, /loadDriverApp[\s\S]*workspaceHistory\.beginSession\(\)/);
  assert.match(android, /new BridgeWebViewClient\(getBridge\(\)\)/);
  assert.match(android, /super\.doUpdateVisitedHistory\(view, url, isReload\)/);
  assert.match(android, /super\.onPageFinished\(view, url\)/);
  assert.doesNotMatch(android, /shouldOverrideUrlLoading|shouldInterceptRequest|ACTION_CALL/);
  assert.match(android, /onboardingReady && onboardingOverlay == null && loginOverlay == null/);
  assert.match(android, /isAuthenticationURL\(webView.getUrl\(\)\)\) workspaceHistory.beginSession\(\)/);
  assert.match(ios, /isAuthenticationURL\(webView.url\) \{ self.workspaceHistory.beginSession\(\)/);
  assert.ok(android.indexOf('addCallback(this, historyBack)') < android.indexOf('addCallback(this, onboardingBack)'));
  assert.match(android, /if \(historyBackAvailable\) \{/);
  assert.match(android, /JSONObject.quote\(requestedURL\), requestedLength/);
  assert.doesNotMatch(android, /\.goBack\(\)|\.goBackOrForward\(/);
  assert.match(android, /setEnabled\(false\);\s*getOnBackPressedDispatcher\(\).onBackPressed\(\)/);
  assert.match(android, /Objects.equals\(requestedURL, view.getUrl\(\)\)/);
  assert.match(android, /currentHistory.getCurrentIndex\(\) != requestedIndex/);
  assert.match(android, /currentHistory.getSize\(\) != requestedLength/);
  assert.match(android, /Objects.equals\(requestedBack,/);
  assert.ok(android.indexOf('int requestedIndex =') < android.indexOf('view.evaluateJavascript(DISMISS_WEB_DIALOG'));
  assert.match(android, /if \(!"false".equals\(result\)\) return/);
  assert.match(android, /historyBack.setEnabled\(visible && NativeWorkspaceHistory.isSameOriginURL/);
  assert.match(read('node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/BridgeWebViewClient.java'), /return bridge\.launchIntent\(url\)/);
  assert.match(read('node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/Bridge.java'), /new Intent\(Intent\.ACTION_VIEW, url\)/);
  assert.match(read('node_modules/@capacitor/ios/Capacitor/Capacitor/WebViewDelegationHandler.swift'), /UIApplication\.shared\.open\(navURL/);
});


test('fixed native modal checks dispatch Escape only for an open dialog and consume vetoes', () => {
  const definition = android.slice(android.indexOf('static final String DISMISS_WEB_DIALOG ='), android.indexOf('private final NativeWorkspaceHistory'));
  const script = [...definition.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(match => JSON.parse(`"${match[1]}"`)).join('');
  const swiftScript = ios.match(/private static let dismissWebDialog = """([\s\S]*?)"""/)[1];
  for (const source of [script, swiftScript]) for (const modal of [null, { role: 'dialog' }, { role: 'alertdialog', veto: true }]) {
    const events = [];
    const document = {
      querySelector(selector) { assert.equal(selector, '[role=dialog][data-state=open], [role=alertdialog][data-state=open]'); return modal; },
      dispatchEvent(event) { events.push(event); return !modal?.veto; },
    };
    function KeyboardEvent(type, options) { return { type, ...options }; }
    assert.equal(runInNewContext(source, { document, KeyboardEvent }), Boolean(modal));
    assert.equal(events.length, modal ? 1 : 0);
    if (modal) assert.deepEqual(events[0], { type: 'keydown', key: 'Escape', code: 'Escape', bubbles: true, cancelable: true });
  }
});


test('Android renderer back uses only a guarded exact step, never the skipping native offset API', () => {
  const template = JSON.parse(android.match(/EXACT_HISTORY_BACK = ("(?:[^"\\]|\\.)*");/)[1]);
  const expected = 'http://localhost:3000/vendor/a?draft="synthetic"';
  const script = template.replace('%s', JSON.stringify(expected)).replace('%d', '3');
  for (const [url, length, steps] of [[expected, 3, [-1]], [expected, 4, []], ['http://localhost:3000/app/login', 3, []]]) {
    const actual = [];
    runInNewContext(script, { location: { href: url }, history: { length, go: step => actual.push(step) } });
    assert.deepEqual(actual, steps);
  }
});
