import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const root = new URL('..', import.meta.url).pathname;
const source = readFileSync(join(root, 'ios/App/App/Info.plist'), 'utf8');
const validate = (path) => spawnSync('python3', ['scripts/validate-ios-privacy.py', path], {
  cwd: root,
  encoding: 'utf8',
});

describe('iOS photo picker privacy', () => {
  it('declares camera and photo-library access in the shipping app', () => {
    const result = validate('ios/App/App/Info.plist');
    assert.equal(result.status, 0, result.stderr);
  });

  for (const key of ['NSCameraUsageDescription', 'NSPhotoLibraryUsageDescription']) {
    for (const value of [null, '', '   ', '$(MISSING_PURPOSE)', '<integer>1</integer>']) {
      it(`rejects ${key} with invalid value ${JSON.stringify(value)}`, () => {
        const directory = mkdtempSync(join(tmpdir(), 'trashed-ios-privacy-'));
        try {
          const path = join(directory, 'Info.plist');
          const replacement = value === null ? '' : `<key>${key}</key>${
            value.startsWith('<integer>') ? value : `<string>${value}</string>`
          }`;
          writeFileSync(path, source.replace(new RegExp(`<key>${key}</key>\\s*<string>[^<]*</string>`), replacement));
          const result = validate(path);
          assert.notEqual(result.status, 0);
          assert.match(result.stderr, new RegExp(key));
        } finally {
          rmSync(directory, { recursive: true, force: true });
        }
      });
    }
  }

  it('checks the archived plist before any App Store upload', () => {
    const script = readFileSync(join(root, 'scripts/ci-upload-testflight.sh'), 'utf8');
    const check = script.indexOf('python3 scripts/validate-ios-privacy.py "$APP_PATH/Info.plist"');
    assert.ok(check > script.indexOf('xcodebuild archive'));
    assert.ok(check < script.indexOf('xcodebuild -exportArchive'));
  });

  it('returns expired web sessions to the native login options', () => {
    const controller = readFileSync(join(root, 'ios/App/App/MainViewController.swift'), 'utf8');
    assert.match(controller, /private var loginURLObservation: NSKeyValueObservation\?/);
    assert.match(controller, /webView\?\.observe\(\\\.url/);
    assert.match(controller, /url\.scheme == config\.origin\.scheme/);
    assert.match(controller, /url\.host == config\.origin\.host/);
    assert.match(controller, /url\.port == config\.origin\.port/);
    assert.match(controller, /url\.path == "\/app\/login" \|\| url\.path == "\/api\/auth\/signin"/);
    assert.match(controller, /webView\.stopLoading\(\)\s+self\.presentNativeLogin\(config\)/);
  });

  it('intercepts the production partner login destination used after logout', () => {
    const controller = readFileSync(join(root, 'ios/App/App/MainViewController.swift'), 'utf8');
    assert.match(controller, /url\.path == "\/partners\/login" \|\|/);
  });
});
