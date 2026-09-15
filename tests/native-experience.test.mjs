import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const root = new URL('..', import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), 'utf8');

test('both installed apps retain update identity but display the general Trashed name', () => {
  assert.match(read('capacitor.config.ts'), /appId: 'com\.trashed\.driver'/);
  assert.match(read('capacitor.config.ts'), /appName: 'Trashed'/);
  assert.match(read('ios/App/App/Info.plist'), /CFBundleDisplayName<\/key>\s*<string>Trashed<\/string>/);
  assert.match(read('ios/App/App/MainViewController.swift'), /Need access\? Ask your account administrator to add you\./);
  assert.doesNotMatch(read('ios/App/App/MainViewController.swift'), /Need driver access\?/);
  assert.match(read('android/app/src/main/res/values/strings.xml'), /name="app_name">Trashed<\/string>/);
  assert.match(read('android/app/src/main/java/com/trashed/driver/MainActivity.java'), /https:\/\/trashed\.app\/app\?source=trashed-app/);
});

test('iOS login builds a role-aware app URL on the configured production or local origin', { skip: process.platform !== 'darwin' }, () => {
  const controller = read('ios/App/App/MainViewController.swift');
  const start = controller.indexOf('private enum DriverTheme:');
  const end = controller.indexOf('private struct NativeGoogleConfig:');
  assert.ok(start > 0 && end > start);
  const directory = mkdtempSync(join(tmpdir(), 'trashed-native-routing-'));
  try {
    const path = join(directory, 'routing.swift');
    writeFileSync(path, `import Foundation\n${controller.slice(start, end)}\n
      assert(DriverAuthConfig(origin: URL(string: "https://trashed.app")!).driverURL(theme: .dark).absoluteString == "https://trashed.app/app?source=trashed-app&theme=dark")
      assert(DriverAuthConfig(origin: URL(string: "http://127.0.0.1:3000")!).driverURL(theme: .light).absoluteString == "http://127.0.0.1:3000/app?source=trashed-app&theme=light")
      assert(DriverAuthConfig(origin: URL(string: "https://trashed.local")!).loginURL.absoluteString == "https://trashed.local/api/auth/mobile/login")
    `);
    const result = spawnSync('swift', [path], { encoding: 'utf8', timeout: 60000 });
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('iOS protects every WebView edge at the native boundary without hiding status or rewriting page CSS', () => {
  const controller = read('ios/App/App/MainViewController.swift');
  for (const edge of ['leading', 'trailing', 'top', 'bottom']) {
    assert.ok(controller.includes(`webView.${edge}Anchor.constraint(equalTo: container.safeAreaLayoutGuide.${edge}Anchor)`));
  }
  assert.match(controller, /view = container/);
  assert.match(controller, /contentInsetAdjustmentBehavior = \.never/);
  assert.match(controller, /override var prefersStatusBarHidden: Bool {\s*return false/);
  assert.doesNotMatch(controller, /driverSafeAreaScript|trashed-ios-safe-area|!important/);
});

test('ordinary phone links use the existing OS confirmation or dialer, not direct-call permission', () => {
  const iosNavigation = read('node_modules/@capacitor/ios/Capacitor/Capacitor/WebViewDelegationHandler.swift');
  const androidNavigation = read('node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/Bridge.java');
  assert.match(iosNavigation, /if !isApplicationNavigation, toplevelNavigation[\s\S]*UIApplication\.shared\.open\(navURL/);
  assert.match(androidNavigation, /new Intent\(Intent\.ACTION_VIEW, url\)/);
  assert.doesNotMatch(read('android/app/src/main/AndroidManifest.xml'), /android\.permission\.CALL_PHONE/);
  assert.doesNotMatch(read('android/app/src/main/java/com/trashed/driver/MainActivity.java'), /ACTION_CALL/);
});

test('existing web voice features can request audio only when used', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /android\.permission\.RECORD_AUDIO/);
  assert.match(manifest, /android\.permission\.MODIFY_AUDIO_SETTINGS/);
  assert.match(manifest, /android\.hardware\.microphone" android:required="false"/);
  assert.match(read('ios/App/App/Info.plist'), /NSMicrophoneUsageDescription<\/key>\s*<string>[^<]+when you choose[^<]+<\/string>/);
  const androidChrome = read('node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/BridgeWebChromeClient.java');
  assert.match(androidChrome, /onPermissionRequest[\s\S]*Manifest\.permission\.RECORD_AUDIO/);
});
