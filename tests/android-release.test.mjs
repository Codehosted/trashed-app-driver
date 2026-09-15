import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('Android release meets the Google Play API 36 requirement without dropping older devices', () => {
  const variables = read('android/variables.gradle');
  const target = Number(variables.match(/targetSdkVersion\s*=\s*(\d+)/)[1]);
  const compile = Number(variables.match(/compileSdkVersion\s*=\s*(\d+)/)[1]);
  assert.ok(target >= 36, 'Google Play updates require Android 16 / API 36');
  assert.ok(compile >= target, 'compile SDK must support the target SDK');
  assert.match(variables, /minSdkVersion\s*=\s*23\b/);
  assert.match(read('android/build.gradle'), /com\.android\.tools\.build:gradle:8\.10\.1/);
});

test('release script rejects missing version metadata before installing or building', () => {
  for (const missing of ['TRASHED_ANDROID_VERSION_CODE', 'TRASHED_ANDROID_VERSION_NAME']) {
    const env = { ...process.env, TRASHED_ANDROID_VERSION_CODE: '4', TRASHED_ANDROID_VERSION_NAME: '1.0.3' };
    delete env[missing];
    const result = spawnSync('bash', ['scripts/ci-build-android.sh', 'release'], {
      cwd: root,
      env,
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(missing));
    assert.equal(result.stdout, '');
  }
});

const optionalHardware = [
  'android.hardware.location',
  'android.hardware.location.gps',
  'android.hardware.microphone',
];

function assertHardwareOptional(manifest) {
  const elements = [...manifest.matchAll(/<uses-feature\b[^>]*>/g)].map(([element]) => element);
  for (const feature of optionalHardware) {
    const matches = elements.filter((element) => element.includes(`android:name="${feature}"`));
    assert.equal(matches.length, 1, `${feature} must be explicitly declared once`);
    assert.match(matches[0], /android:required="false"/, `vendor devices must not require ${feature}`);
  }
  assert.doesNotMatch(manifest, /<uses-feature\b[^>]*android:name="android\.hardware\.location\.network"(?![^>]*android:required="false")[^>]*>/);
}

function assertNoLocationFilter(badging) {
  const optional = new Set([...badging.matchAll(/^\s*uses-feature-not-required: name='([^']+)'/gm)].map((match) => match[1]));
  const required = new Set([...badging.matchAll(/^\s*uses-feature: name='([^']+)'/gm)].map((match) => match[1]));
  for (const feature of optionalHardware) {
    assert.ok(optional.has(feature), `${feature} must appear as not required in the actual APK`);
    assert.ok(!required.has(feature), `${feature} must not be an implied required feature`);
  }
  assert.ok(!required.has('android.hardware.location.network'), 'network location must not become an implied requirement');
}

test('general vendor app makes driver hardware optional without removing permissions', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  assertHardwareOptional(manifest);
  assert.match(manifest, /<uses-feature\b[^>]*android:name="android\.hardware\.location\.gps"[^>]*tools:replace="android:required"/);
  for (const permission of ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'FOREGROUND_SERVICE_LOCATION', 'RECORD_AUDIO']) {
    assert.ok(manifest.includes(`android:name="android.permission.${permission}"`));
  }
  const script = read('scripts/ci-build-android.sh');
  assert.match(script, /AAPT2_BIN="\$\(dirname "\$APKSIGNER_BIN"\)\/aapt2"/);
  assert.match(script, /TRASHED_ANDROID_RELEASE_MANIFEST="\$ROOT_DIR\/android\/app\/build\/intermediates\/merged_manifests\/release\/processReleaseManifest\/AndroidManifest\.xml"\s*\\\s*TRASHED_ANDROID_RELEASE_APK="\$ROOT_DIR\/\$APK" TRASHED_ANDROID_AAPT2="\$AAPT2_BIN"\s*\\\s*node --test "\$ROOT_DIR\/tests\/android-release\.test\.mjs"/);
  for (const feature of optionalHardware) {
    assert.throws(() => assertHardwareOptional(manifest.replace(`android:name="${feature}" android:required="false"`, `android:name="${feature}" android:required="true"`)));
  }
});

test('feature-filter regression rejects implied location requirements and missing optional flags', () => {
  const valid = optionalHardware.map((feature) => `  uses-feature-not-required: name='${feature}'`).join('\n') + "\n  uses-feature: name='android.hardware.faketouch'";
  assertNoLocationFilter(valid);
  for (const feature of [...optionalHardware, 'android.hardware.location.network']) {
    assert.throws(() => assertNoLocationFilter(valid + `\n  uses-feature: name='${feature}'`));
  }
  assert.throws(() => assertNoLocationFilter(valid.replace("uses-feature-not-required: name='android.hardware.location'", '')));
});

test('actual merged release manifest keeps vendor hardware optional', {
  skip: process.env.TRASHED_ANDROID_RELEASE_MANIFEST ? false : 'set TRASHED_ANDROID_RELEASE_MANIFEST after the release build',
}, () => {
  const manifest = readFileSync(process.env.TRASHED_ANDROID_RELEASE_MANIFEST, 'utf8');
  assert.match(manifest, /package="com\.trashed\.driver"/);
  assert.doesNotMatch(manifest, /android:debuggable="true"/);
  assertHardwareOptional(manifest);
});

test('actual release APK has no required generic location, GPS, network location, or microphone', {
  skip: process.env.TRASHED_ANDROID_RELEASE_APK || process.env.TRASHED_ANDROID_AAPT2 ? false : 'set TRASHED_ANDROID_RELEASE_APK and TRASHED_ANDROID_AAPT2 after the release build',
}, () => {
  assert.ok(process.env.TRASHED_ANDROID_RELEASE_APK && process.env.TRASHED_ANDROID_AAPT2, 'both artifact gate inputs are required');
  const result = spawnSync(process.env.TRASHED_ANDROID_AAPT2, ['dump', 'badging', process.env.TRASHED_ANDROID_RELEASE_APK], {
    encoding: 'utf8', timeout: 15000,
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.match(result.stdout, /package: name='com\.trashed\.driver'/);
  assertNoLocationFilter(result.stdout);
});
