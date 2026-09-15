import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const root = new URL('..', import.meta.url).pathname;
const read = path => readFileSync(join(root, path), 'utf8');
const swift = read('ios/App/App/TrashedFileExportPlugin.swift');
const java = read('android/app/src/main/java/com/trashed/driver/TrashedFileExportPlugin.java');
const invalidNames = ['', '../secret.txt', '/secret.txt', 'folder/file.txt', 'folder\\file.txt', '.hidden.txt', 'a..txt', 'a.txt\n', 'a\r.txt', 'a\u0000.txt', 'a.html', 'a.TXT', 'résumé.txt', 'a'.repeat(117) + '.txt'];
const rejectedOrigins = ['https://trashed.app.evil.test/app', 'https://evil.test/app', 'http://trashed.app/app', 'https://trashed.app:444/app', 'https://user@trashed.app/app', 'file:///app', 'about:blank'];

test('actual Swift export policy rejects paths, bounds UTF8 bytes, and compares exact origins', { skip: process.platform !== 'darwin' }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'trashed-text-export-swift-'));
  try {
    const policy = swift.slice(swift.indexOf('enum TextExportPolicy'), swift.indexOf('enum ByteExportPolicy'));
    const path = join(directory, 'policy.swift');
    writeFileSync(path, `import Foundation\n${policy}\n
      let invalidNames = ${JSON.stringify(invalidNames).replace(/\\u0000/g, '\\u{0}')}
      for name in invalidNames { assert(TextExportPolicy.validationError(filename: name, content: "text") == "INVALID_FILENAME", name) }
      assert(TextExportPolicy.validationError(filename: "transcript_123_Customer.txt", content: "Hello 😀\\nWorld") == nil)
      assert(TextExportPolicy.validationError(filename: String(repeating: "a", count: 116) + ".txt", content: "") == nil)
      assert(TextExportPolicy.validationError(filename: "a.txt", content: nil) == "INVALID_CONTENT")
      let limit = TextExportPolicy.maxBytes
      assert(TextExportPolicy.validationError(filename: "a.txt", content: String(repeating: "a", count: limit)) == nil)
      assert(TextExportPolicy.validationError(filename: "a.txt", content: String(repeating: "é", count: limit / 2)) == nil)
      assert(TextExportPolicy.validationError(filename: "a.txt", content: String(repeating: "😀", count: limit / 4) + "a") == "TOO_LARGE")
      let origin = URL(string: "https://trashed.app/app?source=trashed-app")!
      assert(TextExportPolicy.isTrustedOrigin(URL(string: "https://trashed.app:443/vendor/calls"), origin))
      for value in ${JSON.stringify(rejectedOrigins)} { assert(!TextExportPolicy.isTrustedOrigin(URL(string: value), origin), value) }
      assert(!TextExportPolicy.isTrustedOrigin(nil, origin))
      assert(TextExportPolicy.isTrustedOrigin(URL(string: "http://localhost:3000/vendor"), URL(string: "http://localhost:3000/app")))
      assert(!TextExportPolicy.isTrustedOrigin(URL(string: "http://localhost:3001/vendor"), URL(string: "http://localhost:3000/app")))
    `);
    const result = spawnSync('swift', [path], { encoding: 'utf8', timeout: 60000 });
    assert.equal(result.status, 0, result.stderr);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('actual Java export policy rejects paths, bounds UTF8 bytes, and compares exact origins', () => {
  const directory = mkdtempSync(join(tmpdir(), 'trashed-text-export-java-'));
  try {
    const policyPath = join(directory, 'TextExportPolicy.java');
    writeFileSync(policyPath, read('android/app/src/main/java/com/trashed/driver/TextExportPolicy.java'));
    const harness = join(directory, 'PolicyTest.java');
    writeFileSync(harness, `package com.trashed.driver;
      class PolicyTest { public static void main(String[] args) {
        String[] invalidNames = ${JSON.stringify(invalidNames).replace(/^\[/, '{').replace(/\]$/, '}')};
        for (String name : invalidNames) assert "INVALID_FILENAME".equals(TextExportPolicy.validationError(name, "text")) : name;
        assert TextExportPolicy.validationError("transcript_123_Customer.txt", "Hello 😀\\nWorld") == null;
        assert TextExportPolicy.validationError("a".repeat(116) + ".txt", "") == null;
        assert "INVALID_CONTENT".equals(TextExportPolicy.validationError("a.txt", null));
        int limit = TextExportPolicy.MAX_BYTES;
        assert TextExportPolicy.validationError("a.txt", "a".repeat(limit)) == null;
        assert TextExportPolicy.validationError("a.txt", "é".repeat(limit / 2)) == null;
        assert "TOO_LARGE".equals(TextExportPolicy.validationError("a.txt", "😀".repeat(limit / 4) + "a"));
        String origin = "https://trashed.app/app?source=trashed-app";
        assert TextExportPolicy.isTrustedOrigin("https://trashed.app:443/vendor/calls", origin);
        for (String value : new String[]${JSON.stringify(rejectedOrigins).replace(/^\[/, '{').replace(/\]$/, '}')}) assert !TextExportPolicy.isTrustedOrigin(value, origin) : value;
        assert !TextExportPolicy.isTrustedOrigin(null, origin);
        assert TextExportPolicy.isTrustedOrigin("http://localhost:3000/vendor", "http://localhost:3000/app");
        assert !TextExportPolicy.isTrustedOrigin("http://localhost:3001/vendor", "http://localhost:3000/app");
      }}
    `);
    const javaHome = process.env.JAVA_HOME || (existsSync('/opt/homebrew/opt/openjdk@21/bin/javac') ? '/opt/homebrew/opt/openjdk@21' : null);
    const binary = name => javaHome ? join(javaHome, 'bin', name) : name;
    let result = spawnSync(binary('javac'), ['-encoding', 'UTF-8', '-d', directory, policyPath, harness], { encoding: 'utf8', timeout: 60000 });
    assert.equal(result.status, 0, result.stderr);
    result = spawnSync(binary('java'), ['-ea', '-cp', directory, 'com.trashed.driver.PolicyTest'], { encoding: 'utf8', timeout: 60000 });
    assert.equal(result.status, 0, result.stderr);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('native exports expose only text and filename, require system pickers, and do not add filesystem access', () => {
  assert.match(swift, /CAPPluginMethod\(name: "saveText"/);
  assert.match(java, /@CapacitorPlugin\(name = "TrashedFileExport"\)/);
  assert.match(swift, /Set\(call.jsObjectRepresentation.keys\) == Set\(\["filename", "content"\]\)/);
  assert.match(java, /call.getData\(\).length\(\) != 2/);
  assert.match(swift, /UIDocumentPickerViewController\(forExporting: \[file\], asCopy: true\)/);
  assert.match(swift, /UUID\(\).uuidString/);
  assert.match(swift, /removeItem\(at: exportRoot\)/);
  assert.match(swift, /removeItem\(at: directory\)/);
  assert.match(java, /Intent.ACTION_CREATE_DOCUMENT/);
  assert.match(java, /Intent.CATEGORY_OPENABLE/);
  assert.match(java, /\.setType\("text\/plain"\)/);
  assert.doesNotMatch(java + swift, /ACTION_SEND|UIActivityViewController|https?:\/\/|URLSession|HttpURLConnection|requestPermissions|takePersistableUriPermission|print\(|Log\./);
  assert.doesNotMatch(read('package.json'), /@capacitor\/(filesystem|share)/);
  assert.match(read('ios/App/App/MainViewController.swift'), /registerPluginInstance\(TrashedFileExportPlugin\(\)\)/);
  assert.match(read('android/app/src/main/java/com/trashed/driver/MainActivity.java'), /registerPlugin\(TrashedFileExportPlugin.class\);\s*super.onCreate/);
});

test('export cancellation/busy handling retains neither transcript state nor bridge payload logs', () => {
  assert.match(java, /pendingCall != null/);
  assert.match(swift, /pendingCall == nil/);
  assert.match(java, /finish\(call, "cancelled", null\)/);
  assert.match(swift, /finish\(status: "cancelled", error: nil\)/);
  assert.match(java, /protected Bundle saveInstanceState\(\) \{ return null; \}/);
  assert.match(java, /call.getData\(\).remove\("content"\)/);
  assert.match(java, /call.getData\(\).remove\("filename"\)/);
  const config = read('capacitor.config.ts');
  assert.match(config.slice(0, config.indexOf('android: {')), /loggingBehavior: 'none'/);
  assert.equal([...config.matchAll(/loggingBehavior:/g)].length, 1);
  assert.match(read('node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/CapConfig.java'), /"android.loggingBehavior",\s*JSONUtils.getString\(configJSON, "loggingBehavior"/);
  assert.match(read('node_modules/@capacitor/ios/Capacitor/Capacitor/assets/native-bridge.js'), /if \(cap.isLoggingEnabled && pluginName !== 'Console'\)/);
});
