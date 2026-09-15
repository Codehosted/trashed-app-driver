import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = new URL('..', import.meta.url).pathname;
const read = path => readFileSync(join(root, path), 'utf8');
const swift = read('ios/App/App/TrashedFileExportPlugin.swift');
const java = read('android/app/src/main/java/com/trashed/driver/TrashedFileExportPlugin.java');
const imagePairs = [
  ['image/png', 'png'], ['image/jpeg', 'jpg'], ['image/jpeg', 'jpeg'], ['image/jpeg', 'jpe'],
  ['image/gif', 'gif'], ['image/webp', 'webp'], ['image/avif', 'avif'], ['image/apng', 'apng'], ['image/apng', 'png'],
  ['image/svg+xml', 'svg'], ['image/bmp', 'bmp'], ['image/x-ms-bmp', 'bmp'], ['image/tiff', 'tif'], ['image/tiff', 'tiff'],
  ['image/x-icon', 'ico'], ['image/vnd.microsoft.icon', 'ico'], ['image/heic', 'heic'], ['image/heic-sequence', 'heic'],
  ['image/heif', 'heif'], ['image/heif-sequence', 'heif'], ['image/jxl', 'jxl'],
];
// Deterministic 1x1 RGBA PNG; byte-for-byte save only, no native image execution/decoding.
const pngFixture = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNIMF3xHwAEcwI97J5RyAAAAABJRU5ErkJggg==';

function run(binary, args) {
  const result = spawnSync(binary, args, { encoding: 'utf8', timeout: 60000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test('compiled Swift byte policy and real disk spool preserve bytes and enforce limits', { skip: process.platform !== 'darwin' }, () => {
  const temp = mkdtempSync(join(tmpdir(), 'trashed-byte-swift-'));
  try {
    // macOS cannot apply iOS complete-file-protection; only that platform flag is omitted here.
    // The actual iOS build/picker regression must separately prove protected staging succeeds.
    const policy = swift.slice(swift.indexOf('enum ByteExportPolicy'), swift.indexOf('@objc(TrashedFileExportPlugin)'))
      .replace('[.atomic, .completeFileProtection]', '[.atomic]');
    const harness = `import Foundation\nimport CoreFoundation\n${policy}
    func fails(_ action: () throws -> Void) { do { try action(); assertionFailure("Expected rejection") } catch {} }
    do {
      assert(ByteExportPolicy.metadataError(filename: "recording.mp3", mimeType: "audio/mpeg") == nil)
      assert(ByteExportPolicy.metadataError(filename: "recording.wav", mimeType: "audio/wav") == nil)
      ${imagePairs.map(([mime, ext]) => `assert(ByteExportPolicy.metadataError(filename: "image.${ext}", mimeType: "${mime}") == nil)
      assert(ByteExportPolicy.metadataError(filename: "image.txt", mimeType: "${mime}") == "INVALID_FILENAME")`).join('\n      ')}
      for mime in ["image/*", "image/unknown", "text/html", "IMAGE/PNG", "image/png; charset=utf-8"] {
        assert(ByteExportPolicy.metadataError(filename: "image.png", mimeType: mime) == "INVALID_MIME")
      }
      for name in ["../image.png", "image..png", "image.JPG", "image.gif", "image.png/child", "image.svg.html"] {
        assert(ByteExportPolicy.metadataError(filename: name, mimeType: "image/png") == "INVALID_FILENAME")
      }

      for name in ["../x.wav", ".x.wav", "a..wav", "x.wav\\n", "résumé.wav", "a/b.wav", "a\\\\b.wav", String(repeating: "a", count: 117) + ".wav"] {
        assert(ByteExportPolicy.metadataError(filename: name, mimeType: "audio/wav") == "INVALID_FILENAME")
      }
      assert(ByteExportPolicy.metadataError(filename: "x.mp3", mimeType: "audio/wav") == "INVALID_FILENAME")
      assert(ByteExportPolicy.metadataError(filename: "x.pdf", mimeType: "application/pdf") == "INVALID_MIME")
      for value: Any in [true, "1", -1, 0.5, Double.nan, Double.infinity, ByteExportPolicy.maxBytes + 1] { assert(ByteExportPolicy.integer(value) == nil) }
      assert(ByteExportPolicy.integer(0) == 0); assert(ByteExportPolicy.integer(ByteExportPolicy.maxBytes) == ByteExportPolicy.maxBytes)
      for value in ["", "YQ", "YR==", "YQ==\\n", "!!!!", String(repeating: "A", count: 87388)] { assert(ByteExportPolicy.decode(value) == nil) }
      let bytes = Data((0..<ByteExportPolicy.maxChunk).map { UInt8($0 % 251) })
      assert(ByteExportPolicy.decode(bytes.base64EncodedString()) == bytes)
      assert(ByteExportPolicy.decode(Data(repeating: 1, count: ByteExportPolicy.maxChunk + 1).base64EncodedString()) == nil)
      let root = URL(fileURLWithPath: ${JSON.stringify(temp)}).appendingPathComponent("spools")
      let png = Data(base64Encoded: "${pngFixture}")!
      assert(png.count == 70)
      let image = try ByteExportSpool(root: root, filename: "synthetic_chat_image.png", expectedBytes: png.count)
      try image.append(offset: 0, bytes: Data(png.prefix(17)))
      try image.append(offset: 17, bytes: Data(png.dropFirst(17))); try image.seal()
      let savedPNG = try Data(contentsOf: image.file); assert(savedPNG == png)
      image.cleanup(); assert(!FileManager.default.fileExists(atPath: image.directory.path))
      let spool = try ByteExportSpool(root: root, filename: "synthetic.wav", expectedBytes: bytes.count + 3)
      let tail = Data([0, 255, 1]); try spool.append(offset: 0, bytes: bytes)
      fails { try spool.append(offset: 0, bytes: tail) }; fails { try spool.seal() }
      try spool.append(offset: bytes.count, bytes: tail)
      fails { try spool.append(offset: spool.offset, bytes: tail) }
      try spool.seal(); let actual = try Data(contentsOf: spool.file); assert(actual == bytes + tail)
      fails { try spool.append(offset: spool.offset, bytes: tail) }
      spool.cleanup(); assert(!FileManager.default.fileExists(atPath: spool.directory.path))
      let unknown = try ByteExportSpool(root: root, filename: "unknown.mp3", expectedBytes: nil)
      fails { try unknown.seal() }; try unknown.append(offset: 0, bytes: tail); try unknown.seal(); unknown.cleanup()
      let capped = try ByteExportSpool(root: root, filename: "cap.wav", expectedBytes: nil)
      capped.offset = ByteExportPolicy.maxBytes - 1
      fails { try capped.append(offset: capped.offset, bytes: tail) }; capped.cleanup()
    }
    `;
    const path = join(temp, 'policy.swift'); writeFileSync(path, harness); run('swift', [path]);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('compiled Java byte policy and real disk spool preserve bytes and enforce limits', () => {
  const temp = mkdtempSync(join(tmpdir(), 'trashed-byte-java-'));
  try {
    // JVM policy tests retain the actual production source; this shim supplies only the Android codec.
    // Instrumentation additionally exercises android.util.Base64 on the real Android runtime.
    const codec = join(temp, 'Base64.java'); writeFileSync(codec, `package android.util;
      public final class Base64 { public static final int DEFAULT=0, NO_WRAP=2;
        public static byte[] decode(String value,int flags) { return java.util.Base64.getMimeDecoder().decode(value); }
        public static String encodeToString(byte[] value,int flags) { return java.util.Base64.getEncoder().encodeToString(value); }
      }`);
    const source = join(temp, 'ByteExportPolicy.java'); writeFileSync(source, read('android/app/src/main/java/com/trashed/driver/ByteExportPolicy.java'));
    const harness = join(temp, 'ByteTest.java'); writeFileSync(harness, `package com.trashed.driver;
      import java.io.*; import java.nio.file.*; import java.util.*;
      class ByteTest {
        interface Action { void run() throws Exception; }
        static void fails(Action action) throws Exception { try { action.run(); throw new AssertionError("Expected rejection"); } catch (IllegalArgumentException expected) {} }
        public static void main(String[] args) throws Exception {
          assert ByteExportPolicy.metadataError("recording.mp3", "audio/mpeg") == null;
          assert ByteExportPolicy.metadataError("recording.wav", "audio/wav") == null;
          ${imagePairs.map(([mime, ext]) => `assert ByteExportPolicy.metadataError("image.${ext}", "${mime}") == null;
          assert "INVALID_FILENAME".equals(ByteExportPolicy.metadataError("image.txt", "${mime}"));`).join('\n          ')}
          for (String mime : new String[]{"image/*", "image/unknown", "text/html", "IMAGE/PNG", "image/png; charset=utf-8"}) assert "INVALID_MIME".equals(ByteExportPolicy.metadataError("image.png", mime));
          for (String name : new String[]{"../image.png", "image..png", "image.JPG", "image.gif", "image.png/child", "image.svg.html"}) assert "INVALID_FILENAME".equals(ByteExportPolicy.metadataError(name, "image/png"));

          for (String name : new String[]{"../x.wav", ".x.wav", "a..wav", "x.wav\\n", "résumé.wav", "a/b.wav", "a\\\\b.wav", "a".repeat(117)+".wav"}) assert "INVALID_FILENAME".equals(ByteExportPolicy.metadataError(name, "audio/wav"));
          assert "INVALID_MIME".equals(ByteExportPolicy.metadataError("x.pdf", "application/pdf"));
          assert "INVALID_FILENAME".equals(ByteExportPolicy.metadataError("x.mp3", "audio/wav"));
          for (Object value : new Object[]{true, "1", -1, 0.5, Double.NaN, Double.POSITIVE_INFINITY, ByteExportPolicy.MAX_BYTES + 1}) assert ByteExportPolicy.integer(value) == null;
          assert ByteExportPolicy.integer(0) == 0; assert ByteExportPolicy.integer(ByteExportPolicy.MAX_BYTES) == ByteExportPolicy.MAX_BYTES;
          for (String value : new String[]{"", "YQ", "YR==", "YQ==\\n", "!!!!", "A".repeat(87388)}) assert ByteExportPolicy.decode(value) == null;
          byte[] bytes = new byte[ByteExportPolicy.MAX_CHUNK]; for (int i=0;i<bytes.length;i++) bytes[i]=(byte)(i%251);
          assert Arrays.equals(bytes, ByteExportPolicy.decode(Base64.getEncoder().encodeToString(bytes)));
          assert ByteExportPolicy.decode(Base64.getEncoder().encodeToString(new byte[ByteExportPolicy.MAX_CHUNK+1])) == null;
          File root = new File(${JSON.stringify(temp)}, "spools");
          byte[] png = Base64.getDecoder().decode("${pngFixture}"); assert png.length == 70;
          ByteExportPolicy.Spool image = new ByteExportPolicy.Spool(root, "synthetic_chat_image.png", "image/png", (long)png.length);
          image.append(0, Arrays.copyOf(png, 17)); image.append(17, Arrays.copyOfRange(png, 17, png.length)); image.seal();
          assert Arrays.equals(png, Files.readAllBytes(image.file.toPath())); image.cleanup(); assert !image.directory.exists();
          ByteExportPolicy.Spool spool = new ByteExportPolicy.Spool(root, "synthetic.wav", "audio/wav", (long)bytes.length+3);
          byte[] tail = new byte[]{0, (byte)255, 1}; spool.append(0, bytes);
          fails(() -> spool.append(0, tail)); fails(() -> spool.seal());
          spool.append(bytes.length, tail); fails(() -> spool.append(spool.offset, tail)); spool.seal();
          byte[] actual = Files.readAllBytes(spool.file.toPath()); assert actual.length==bytes.length+3;
          assert Arrays.equals(bytes, Arrays.copyOf(actual, bytes.length)); assert Arrays.equals(tail, Arrays.copyOfRange(actual, bytes.length, actual.length));
          fails(() -> spool.append(spool.offset, tail)); spool.cleanup(); assert !spool.directory.exists();
          ByteExportPolicy.Spool unknown = new ByteExportPolicy.Spool(root, "unknown.mp3", "audio/mpeg", null);
          fails(() -> unknown.seal()); unknown.append(0, tail); unknown.seal(); unknown.cleanup();
          ByteExportPolicy.Spool capped = new ByteExportPolicy.Spool(root, "cap.wav", "audio/wav", null);
          capped.offset = ByteExportPolicy.MAX_BYTES-1; fails(() -> capped.append(capped.offset, tail)); capped.cleanup();
          ByteExportPolicy.Spool stale = new ByteExportPolicy.Spool(root, "stale.wav", "audio/wav", null); stale.append(0, tail); stale.seal();
          ByteExportPolicy.cleanupStale(root); assert !root.exists();
        }
      }
    `);
    const home = process.env.JAVA_HOME || '/opt/homebrew/opt/openjdk@21';
    run(join(home, 'bin/javac'), ['-encoding', 'UTF-8', '-d', temp, codec, source, harness]);
    run(join(home, 'bin/java'), ['-ea', '-cp', temp, 'com.trashed.driver.ByteTest']);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('byte sink exposes no read/network/credential API and preserves text/chooser lifecycle', () => {
  for (const name of ['saveText', 'begin', 'write', 'finish', 'cancel']) {
    assert.match(swift, new RegExp('CAPPluginMethod\\(name: "' + name + '"'));
    assert.match(java, new RegExp('void ' + name + '\\(PluginCall call\\)'));
  }
  assert.doesNotMatch(java + swift, /URLSession|HttpURLConnection|CookieManager|httpCookieStore|ACTION_SEND|UIActivityViewController|takePersistableUriPermission/);
  assert.match(java, /if \(copying\) return/);
  assert.match(java, /spool\.committed/);
  assert.match(java, /main\.postDelayed\(idleTimeout, 60_000\)/);
  assert.match(swift, /\.now\(\) \+ 60/);
  assert.match(java, /onPageStarted.*cancelSpool/);
  assert.doesNotMatch(java.slice(java.indexOf('void load()'), java.indexOf('private File exportRoot()')), /addWebViewListener/);
  assert.match(java.slice(java.indexOf('void begin('), java.indexOf('void write(')), /if \(\!navigationListenerRegistered\)[\s\S]*bridge\.addWebViewListener\(navigationListener\)/);
  assert.match(java, /bridge\.removeWebViewListener\(navigationListener\)/);
  assert.match(swift, /return nil \/\/ Preserve Capacitor's navigation policy/);
  assert.match(java, /call\.getData\(\)\.remove\("base64"\)/);
  assert.match(java, /protected Bundle saveInstanceState\(\) \{ return null; \}/);
  assert.match(read('capacitor.config.ts'), /loggingBehavior: 'none'/);
  assert.doesNotMatch(read('android/app/src/main/AndroidManifest.xml'), /ByteExportTestProvider|byteexports/);
  const provider = read('android/app/src/androidTest/java/com/trashed/driver/ByteExportTestProvider.java');
  assert.match(provider, /Binder.getCallingUid\(\)/);
  assert.match(provider, /caller != target && caller != getContext\(\).getApplicationInfo\(\).uid/);
  assert.match(provider, /"\/synthetic\.wav".equals\(uri.getPath\(\)\)/);
  assert.match(provider, /"ranchu".equals\(Build.HARDWARE\)/);
  assert.match(read('android/app/src/androidTest/AndroidManifest.xml'), /com.trashed.driver.test.byteexports/);
});
