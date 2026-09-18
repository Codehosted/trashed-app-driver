import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
test('Trashed branding keeps installed app identity stable on both platforms', () => {
  assert.match(read('capacitor.config.ts'), /appName: 'Trashed'/);
  assert.match(read('capacitor.config.ts'), /appId: 'com\.trashed\.driver'/);
  assert.match(read('ios/App/App/Info.plist'), /<key>CFBundleDisplayName<\/key>\s*<string>Trashed<\/string>/);
  const android = read('android/app/src/main/res/values/strings.xml');
  assert.match(android, /<string name="app_name">Trashed<\/string>/);
  assert.match(android, /<string name="title_activity_main">Trashed<\/string>/);
  assert.match(read('android/app/build.gradle'), /applicationId "com\.trashed\.driver"/);
  assert.doesNotMatch(read('app-store-assets/metadata/ios/en-US/description.txt'), /Trashed Driver/);
  const upload = read('scripts/ci-upload-testflight.sh');
  assert.match(upload, /Archived display name must be Trashed/);
  assert.match(upload, /Verified archive: Trashed/);
  assert.match(read('.github/workflows/android-checkpoint.yml'), /MOBILE_VERSION: 1\.0\.7-checkpoint/);
});
