import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const root = new URL('..', import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), 'utf8');
const ios = read('ios/App/App/MainViewController.swift');
const android = read('android/app/src/main/java/com/trashed/driver/MainActivity.java');
const pages = JSON.parse(read('tests/fixtures/native-onboarding.json'));

test('both native platforms bundle the same three-page offline copy', () => {
  assert.equal(pages.length, 3);
  for (const page of pages) {
    for (const value of [page.title, page.body]) {
      assert.ok(ios.includes(JSON.stringify(value)));
      assert.ok(android.includes(JSON.stringify(value)));
    }
  }
  assert.match(ios, /native-onboarding-title/);
  assert.match(ios, /label: \{\s*Text\(step == 0 \? "Skip" : "Back"\)\s*\.font\(\.subheadline.weight\(\.semibold\)\)\s*\.frame\(minWidth: 64, minHeight: 44\)\s*\.contentShape\(Rectangle\(\)\)/);
  assert.match(ios, /Text\(preparing \? "Preparing\.\.\." : step == NativeOnboarding\.pages\.count - 1 \? "Get started" : "Next"\)\s*\.font\(\.headline\)\s*\.padding\(\.horizontal, 18\)\s*\.frame\(maxWidth: \.infinity, minHeight: 54\)\s*\.contentShape\(Rectangle\(\)\)/);
  assert.match(android, /onboardingStep == ONBOARDING_PAGES\.length - 1 \? "Get started" : "Next"/);
});

test('native initialization blocks the actual Capacitor bootstrap entry points', () => {
  assert.match(ios, /override func webView\(with frame: CGRect, configuration: WKWebViewConfiguration\) -> WKWebView \{\s*OnboardingWebView/);
  assert.match(ios, /override func load\(_ request: URLRequest\) -> WKNavigation\? \{\s*guard appNavigationEnabled else \{ return nil \}\s*return super.load\(request\)/);
  assert.match(android, /protected void load\(\)[^]*?parent.addView\(gated, index, params\);[^]*?super.load\(\)/);
  assert.match(android, /public void loadUrl\(String url\) \{\s*if \(appNavigationEnabled\) super.loadUrl\(url\)/);
  assert.match(android, /public void loadUrl\(String url, Map<String, String> headers\) \{\s*if \(appNavigationEnabled\) super.loadUrl\(url, headers\)/);
  assert.match(read('node_modules/@capacitor/ios/Capacitor/Capacitor/CAPBridgeViewController.swift'), /webView\?\.load\(URLRequest\(url: url\)\)/);
  assert.match(read('node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/Bridge.java'), /webView.loadUrl\(appUrl\)/);
});

test('completion gates cookie/login recovery and preserves the original user agent before web resume', () => {
  assert.match(ios, /guard self.onboardingReady else \{ return \}/);
  assert.match(ios, /guard let self = self, self.onboardingReady, self.nativeOnboardingController == nil/);
  assert.match(ios, /guard onboardingReady, nativeOnboardingController == nil else \{ return \}/);
  assert.match(ios, /evaluateJavaScript\("navigator.userAgent"\)[^]*?webView.customUserAgent = NativeOnboarding.completedUserAgent\(original\)[^]*?webView.appNavigationEnabled = true[^]*?completion\(nil\)/);
  assert.match(android, /getUserAgentString\(\)[^]*?setUserAgentString\(completedUserAgent\(original\)\)[^]*?webView.appNavigationEnabled = true[^]*?hasSessionCookie/);
  const androidIntro = android.slice(android.indexOf('private void showNativeOnboarding'), android.indexOf('private void showNativeLogin'));
  assert.doesNotMatch(androidIntro, /requestPermissions|requestPermission|HttpURLConnection|startActivity/);
  const swiftIntro = ios.slice(ios.indexOf('private struct NativeAppOnboardingView'), ios.indexOf('private struct NativeDriverLoginView'));
  assert.doesNotMatch(swiftIntro, /requestAuthorization|requestPermission|URLSession|load\(/);
});

test('actual Swift preference and UA functions preserve completion and all original UA markers', { skip: process.platform !== 'darwin' }, () => {
  const model = ios.slice(ios.indexOf('private struct NativeOnboardingPage'), ios.indexOf('// Capacitor starts its first request'));
  const directory = mkdtempSync(join(tmpdir(), 'trashed-native-intro-'));
  try {
    const path = join(directory, 'onboarding.swift');
    writeFileSync(path, `import Foundation\n${model}\n
      let suite = "trashed-intro-test-" + UUID().uuidString
      let defaults = UserDefaults(suiteName: suite)!
      defer { defaults.removePersistentDomain(forName: suite) }
      assert(!NativeOnboarding.isComplete(defaults))
      assert(NativeOnboarding.pages.count == 3)
      NativeOnboarding.complete(defaults)
      assert(NativeOnboarding.isComplete(UserDefaults(suiteName: suite)!))
      let original = "Mozilla/5.0 OtherMarker/7 Mobile/15E148"
      let completed = NativeOnboarding.completedUserAgent(original)
      assert(completed == original + " TrashedOnboarding/1")
      assert(NativeOnboarding.completedUserAgent(completed) == completed)
      let whitespace = original + "\\tTrashedOnboarding/1\\t"
      assert(NativeOnboarding.completedUserAgent(whitespace) == whitespace)
      assert(NativeOnboarding.completedUserAgent(original + " NotTrashedOnboarding/1").hasSuffix(" TrashedOnboarding/1"))
    `);
    const result = spawnSync('swift', [path], { encoding: 'utf8', timeout: 60000 });
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
