import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = new URL('..', import.meta.url).pathname;
const read = path => readFileSync(join(root, path), 'utf8');
const base = 'android/app/src/main/java/com/trashed/driver/';

test('compiles and executes actual Android navigation validation and lifecycle policy', () => {
  const directory = mkdtempSync(join(tmpdir(), 'trashed-navigation-java-'));
  try {
    mkdirSync(join(directory, 'org/junit'), { recursive: true });
    writeFileSync(join(directory, 'org/junit/Test.java'), 'package org.junit; @java.lang.annotation.Retention(java.lang.annotation.RetentionPolicy.RUNTIME) public @interface Test {}');
    const home = process.env.JAVA_HOME || '/opt/homebrew/opt/openjdk@21';
    for (const [binary, args] of [
      ['javac', ['-d', directory, join(directory, 'org/junit/Test.java'), join(root, base, 'NativeNavigationState.java'), join(root, 'android/app/src/test/java/com/trashed/driver/NativeNavigationStateTest.java')]],
      ['java', ['-ea', '-cp', directory, 'com.trashed.driver.NativeNavigationStateTest']],
    ]) {
      const result = spawnSync(join(home, 'bin', binary), args, { encoding: 'utf8', timeout: 60000 });
      assert.equal(result.status, 0, result.stdout + result.stderr);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('Android bridge is presentation-only and sends only validated action IDs', () => {
  const plugin = read(base + 'TrashedNavigationPlugin.java');
  const controls = read(base + 'NativeBottomNavigation.java');
  assert.match(plugin, /@CapacitorPlugin\(name = "TrashedNavigation"\)/);
  assert.match(plugin, /"UNAVAILABLE"/); assert.match(plugin, /"UNTRUSTED_ORIGIN"/);
  assert.match(plugin, /notifyListeners\("select"/); assert.match(plugin, /notifyListeners\("reset"/);
  assert.match(plugin, /\.put\("context", selection.context\)[\s\S]*?\.put\("revision", selection.revision\)\.put\("id", selection.id\)/);
  for (const source of [plugin, controls, read(base + 'NativeNavigationState.java')])
    assert.doesNotMatch(source, /evaluateJavascript|loadUrl|HttpURLConnection|SharedPreferences|CookieManager|startActivity|ACTION_VIEW/);
  assert.match(controls, /new BottomNavigationView/); assert.match(controls, /new BottomSheetDialog/);
  assert.match(controls, /setOnDismissListener[\s\S]*emit\(state.context, generation, selected\)/);
  assert.match(controls, /store.select\(context, generation, id\)/);
});

test('host clears document/account boundaries and dismisses native sheet before existing Back', () => {
  const activity = read(base + 'MainActivity.java');
  assert.match(activity, /registerPlugin\(TrashedNavigationPlugin.class\)/);
  assert.match(activity, /onPageStarted[\s\S]*navigationDocument\+\+[\s\S]*nativeNavigation.reset\(\)[\s\S]*super.onPageStarted/);
  assert.match(activity, /if \(!workspace && nativeNavigation != null\) nativeNavigation.reset\(\)/);
  for (const method of ['showNativeLogin', 'showNativeOnboarding']) {
    const start = activity.indexOf(`private void ${method}(`);
    assert.match(activity.slice(start, start + 400), /nativeNavigation.reset\(\)/);
  }
  assert.match(activity, /handleOnBackPressed\(\) \{\s*if \(nativeNavigation.dismissSheet\(\)\) return;\s*if \(nativeWorkspace != null && nativeWorkspace.back\(\)\) return;\s*if \(dismissDirectWorkspace\(\)\) return;\s*if \(nativeChat != null && nativeChat.dismissDialog\(\)\) return;\s*if \(backCheckPending\)/);
  assert.match(activity, /NativeWorkspaceHistory.isWorkspaceURL\(getBridge\(\).getWebView\(\).getUrl\(\), authConfig.origin\)/);
  assert.match(activity, /nativeNavigation.keyboard\(windowInsets.isVisible\(WindowInsetsCompat.Type.ime\(\)\)\)/);
  assert.match(activity, /Math.max\(insets.bottom, ime.bottom\)/);
});
