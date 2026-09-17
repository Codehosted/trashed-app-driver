import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
const root = new URL('..', import.meta.url).pathname;
const read = p => readFileSync(join(root, p), 'utf8');
const appearance = read('ios/App/App/NativeSystemAppearance.swift');
const policy = read('ios/App/App/NativeWorkspacePolicy.swift');
const controller = read('ios/App/App/MainViewController.swift');
function run(command, args) {
  const value = spawnSync(command, args, { encoding: 'utf8', timeout: 90000 });
  assert.equal(value.status, 0, value.error?.message || value.stderr || value.stdout);
  return value.stdout.trim();
}

test('compiled production Swift emits origin-guarded JS; live OS changes never reload or lose document state', { skip: process.platform !== 'darwin' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'trashed-appearance-'));
  try {
    const main = join(dir, 'main.swift');
    writeFileSync(main, `import Foundation\n${policy}\n${appearance}\n
for raw in ["file:///tmp/app", "https://user@trashed.app", "https://:secret@trashed.app"] {
 assert(NativeSystemAppearance.script(origin: URL(string: raw)!) == nil)
}
print(NativeSystemAppearance.script(origin: URL(string: "https://trashed.app/app?source=trashed-app#fragment")!)!)
`);
    run('swiftc', [main, '-o', join(dir, 'test')]);
    const script = run(join(dir, 'test'), []);
    function context(origin = 'https://trashed.app', frame = false) {
      const events = [], callbacks = [];
      const media = { matches: false, addEventListener: (name, fn) => { assert.equal(name, 'change'); callbacks.push(fn); } };
      const window = { dispatchEvent: e => events.push(e), draft: 'keep me', selectedConversation: 'thread-7' };
      window.top = frame ? {} : window;
      window.matchMedia = query => { assert.equal(query, '(prefers-color-scheme: dark)'); return media; };
      const scope = vm.createContext({ window, location: { origin }, URL, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } } });
      return { scope, window, events, callbacks, media };
    }
    const c = context();
    vm.runInContext(script, c.scope);
    assert.equal(c.window.__TRASHED_SYSTEM_APPEARANCE__, 'light');
    c.media.matches = true;
    vm.runInContext(script, c.scope); // A queued native notification reads current media, not captured native traits.
    assert.equal(c.window.__TRASHED_SYSTEM_APPEARANCE__, 'dark');
    assert.equal(c.callbacks.length, 1);
    c.media.matches = false; c.callbacks[0]({ matches: false });
    assert.equal(c.window.__TRASHED_SYSTEM_APPEARANCE__, 'light');
    assert.equal(c.window.draft, 'keep me');
    assert.equal(c.window.selectedConversation, 'thread-7');
    assert.ok(c.events.every(e => e.type === 'trashed:system-appearance'));
    for (const origin of ['https://evil.example', 'https://trashed.app.evil', 'http://trashed.app', 'https://trashed.app:444']) {
      const foreign = context(origin); vm.runInContext(script, foreign.scope); assert.equal(foreign.events.length, 0); assert.equal(foreign.callbacks.length, 0);
    }
    const frame = context('https://trashed.app', true); vm.runInContext(script, frame.scope); assert.equal(frame.events.length, 0);
    assert.doesNotMatch(script, /reload|localStorage|cookie|fetch\(|history\./);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('real UIKit dynamic palette resolves light/dark traits and preserves brand fills with readable foreground', { skip: process.platform !== 'darwin' }, () => {
  // Catalyst executes the same UIKit UIColor API on this Mac, without touching a Simulator.
  const dir = mkdtempSync(join(tmpdir(), 'trashed-uikit-palette-'));
  try {
    const sdk = run('xcrun', ['--sdk', 'macosx', '--show-sdk-path']);
    const main = join(dir, 'main.swift');
    writeFileSync(main, `import UIKit\n${appearance.slice(appearance.indexOf('enum NativeAdaptivePalette'), appearance.lastIndexOf('#endif'))}\n
func components(_ value: UIColor, _ style: UIUserInterfaceStyle) -> [Double] {
 var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
 assert(value.resolvedColor(with: UITraitCollection(userInterfaceStyle: style)).getRed(&r, green: &g, blue: &b, alpha: &a))
 return [Double(r), Double(g), Double(b)]
}
func luminance(_ values: [Double]) -> Double {
 let v = values.map { $0 <= 0.04045 ? $0 / 12.92 : pow(($0 + 0.055) / 1.055, 2.4) }
 return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]
}
func contrast(_ a: UIColor, _ b: UIColor, _ style: UIUserInterfaceStyle) -> Double {
 let x = luminance(components(a, style)), y = luminance(components(b, style))
 return (max(x, y) + 0.05) / (min(x, y) + 0.05)
}
assert(NativeAdaptivePalette.color("invalid") == nil)
assert(NativeAdaptivePalette.color("#fff") == nil)
assert(!NativeAdaptivePalette.branded("#FFFFFF"))
assert(NativeAdaptivePalette.branded("#eee5ff"))
let dynamicLabel = NativeAdaptivePalette.color("#111827")!
let dynamicSurface = NativeAdaptivePalette.color("#ffffff", role: .background)!
assert(components(dynamicLabel, .light) != components(dynamicLabel, .dark))
assert(components(dynamicSurface, .light) != components(dynamicSurface, .dark))
for style in [UIUserInterfaceStyle.light, .dark] {
 assert(contrast(dynamicLabel, dynamicSurface, style) >= 4.5)
 assert(contrast(.white, NativeAdaptivePalette.fill, style) >= 4.5)
 assert(contrast(.black, .systemRed, style) >= 4.5)
 assert(contrast(NativeAdaptivePalette.accent, .systemBackground, style) >= 4.5)
 for hex in ["#7033ff", "#eee5ff", "#facc15", "#166534", "#ef4444"] {
  let fill = NativeAdaptivePalette.color(hex, role: .background)!
  let rgb = NativeAdaptivePalette.rgb(hex)!
  let actual = components(fill, style)
  assert(abs(actual[0] - rgb.0) < 0.001 && abs(actual[1] - rgb.1) < 0.001 && abs(actual[2] - rgb.2) < 0.001)
  let text = NativeAdaptivePalette.color("#ffffff", surface: hex)!
  assert(contrast(text, fill, style) >= 4.5)
  assert(contrast(NativeAdaptivePalette.color(nil, surface: hex)!, fill, style) >= 4.5)
 }
}
print("PASS UIKit light/dark traits, neutral semantics, five retained brand/status fills and contrasting text")
`);
    run('xcrun', ['swiftc', '-target', `${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-apple-ios14.0-macabi`, '-sdk', sdk,
      '-F', join(sdk, 'System/iOSSupport/System/Library/Frameworks'), '-I', join(sdk, 'System/iOSSupport/usr/include'),
      '-L', join(sdk, 'System/iOSSupport/usr/lib'), '-Xlinker', '-rpath', '-Xlinker', '/System/iOSSupport/System/Library/Frameworks',
      main, '-o', join(dir, 'test')]);
    assert.match(run(join(dir, 'test'), []), /PASS UIKit/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('appearance repaint retains auth guards, mounted state, drafts, native sheets and semantic screens', () => {
  const lifecycle = controller.slice(controller.indexOf('override func traitCollectionDidChange'), controller.indexOf('private var currentDriverTheme'));
  assert.match(lifecycle, /WorkspacePolicy.sameOrigin/);
  assert.match(lifecycle, /!webView.isLoading/);
  assert.doesNotMatch(lifecycle, /\.reset\(|reload\(|load\(|dismiss|rootView\s*=|beginSession/);
  assert.match(controller, /UIApplication.didBecomeActiveNotification/);
  assert.match(controller, /injectionTime: \.atDocumentStart, forMainFrameOnly: true/);
  const nav = read('ios/App/App/TrashedNavigationPlugin.swift');
  assert.equal((nav.match(/overrideUserInterfaceStyle = \.unspecified/g) || []).length, 3);
  assert.match(nav, /cell.backgroundColor = item.selected \? NativeAdaptivePalette.fill/);
  const chat = read('ios/App/App/NativeChatView.swift');
  assert.doesNotMatch(chat, /preferredColorScheme/);
  assert.match(chat, /nativeBrandedSurface, isUser \? "#7033ff"/);
  assert.match(chat, /background\(isUser \? NativeChatPalette.fill/);
  const measured = read('ios/App/App/NativeChatMeasured.swift');
  const repaint = measured.slice(measured.indexOf('override func traitCollectionDidChange'), measured.indexOf('private var font'));
  assert.match(repaint, /resolvedColor\(with: traitCollection\).cgColor/);
  assert.doesNotMatch(repaint, /attributedText\s*=|removeFromSuperview|update\(|buffer\.|reloadInputViews/);
  for (const path of ['NativeWorkspaceView.swift', 'NativeDashboardView.swift', 'NativeCallTranscript.swift']) {
    assert.doesNotMatch(read('ios/App/App/' + path), /preferredColorScheme|overrideUserInterfaceStyle = \.(light|dark)/);
  }
});
