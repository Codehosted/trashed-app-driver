import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('local and automatic iOS release builds use the same new store version', () => {
  const versions = [...read('ios/App/App.xcodeproj/project.pbxproj').matchAll(/MARKETING_VERSION = ([\d.]+);/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(versions)], ['1.0.7']);
  const workflow = read('.github/workflows/testflight.yml');
  assert.match(workflow, /marketing_version:[\s\S]*?default: "1\.0\.7"/);
  assert.match(workflow, /github\.event\.inputs\.marketing_version \|\| '1\.0\.7'/);
  assert.ok(read('scripts/ci-upload-testflight.sh').includes('MARKETING_VERSION="${MARKETING_VERSION:-1.0.7}"'));
  assert.match(read('.github/workflows/android-checkpoint.yml'), /TRASHED_ANDROID_VERSION_NAME: 1\.0\.7-checkpoint/);
});
