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
