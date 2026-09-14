import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const root = new URL('..', import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), 'utf8');
const controller = read('ios/App/App/MainViewController.swift');

describe('iOS equivalent Apple login', () => {
  it('uses the standard Apple button alongside Google, with the email privacy scope', () => {
    assert.match(controller, /import AuthenticationServices/);
    assert.match(controller, /SignInWithAppleButton\(\.continue/);
    assert.ok(controller.indexOf('SignInWithAppleButton(.continue') < controller.indexOf('Button(action: submitGoogle)'));
    assert.match(controller, /request\.requestedScopes = \[\.email\]/);
    assert.match(controller, /native-driver-apple-sign-in/);
    assert.match(controller, /native-driver-google-sign-in/);
  });

  it('binds each Apple response to its nonce and exchanges the identity token server-side', () => {
    assert.match(controller, /let nonce = UUID\(\)\.uuidString/);
    assert.match(controller, /request\.nonce = SHA256\.hash/);
    assert.match(controller, /credential\.state == nonce/);
    assert.match(controller, /\/api\/auth\/mobile\/apple/);
    assert.match(controller, /"identityToken": credential\.identityToken/);
    assert.match(controller, /"nonce": credential\.nonce/);
    assert.match(controller, /\.code != \.canceled/);
  });

  it('keeps private-relay users on an explicit, cancellable existing-account linking path', () => {
    assert.match(controller, /requiresAccountLink/);
    assert.match(controller, /Your Apple email can stay private/);
    assert.match(controller, /No new account will be created/);
    assert.match(controller, /Cancel linking Apple/);
    assert.match(controller, /pendingAppleCredential == nil \? config\.loginURL : config\.appleLoginURL/);
    assert.match(controller, /private func presentNativeLogin[^]*?guard onboardingReady, nativeOnboardingController == nil else \{ return \}\s*pendingAppleCredential = nil/);
    assert.match(controller, /isAppleSubmitting \|\| appleLinkPending/);
  });

  it('signs both configurations with Apple capability and verifies the archive before upload', () => {
    const entitlement = read('ios/App/App/App.entitlements');
    const project = read('ios/App/App.xcodeproj/project.pbxproj');
    const upload = read('scripts/ci-upload-testflight.sh');
    assert.match(entitlement, /com\.apple\.developer\.applesignin<\/key>\s*<array>\s*<string>Default<\/string>/);
    assert.equal(project.match(/CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/g)?.length, 2);
    assert.match(project, /com\.apple\.SignInWithApple = {\s*enabled = 1;/);
    assert.match(upload, /Print com\.apple\.developer\.applesignin:0/);
    assert.ok(upload.indexOf('Print com.apple.developer.applesignin:0') < upload.indexOf('xcodebuild -exportArchive'));
    assert.match(upload, /APPLE_AUTH_CONFIG=[\s\S]*\/api\/auth\/mobile\/apple/);
    assert.match(upload, /config\.get\("configured"\) is True/);
    assert.ok(upload.indexOf('APPLE_AUTH_CONFIG=') < upload.indexOf('security create-keychain'));
  });

  it('keeps the native bundle identifier consistent with the Apple audience', () => {
    assert.match(read('capacitor.config.ts'), /appId: 'com\.trashed\.driver'/);
    assert.equal(read('ios/App/App.xcodeproj/project.pbxproj')
      .match(/PRODUCT_BUNDLE_IDENTIFIER = com\.trashed\.driver;/g)?.length, 2);
  });

  it('renews and validates this app profile before archiving instead of using a stale secret', () => {
    const upload = read('scripts/ci-upload-testflight.sh');
    assert.match(upload, /fastlane sigh[\s\S]*--app_identifier "\$BUNDLE_ID"/);
    assert.match(upload, /--provisioning_name "\$PROFILE_NAME"[\s\S]*--ignore_profiles_with_different_name/);
    assert.match(upload, /--force --skip_install/);
    assert.doesNotMatch(upload, /skip_certificate_verification|IOS_APPSTORE_PROFILE_BASE64/);
    assert.match(upload, /entitlements\.get\("com\.apple\.developer\.applesignin"\) == \["Default"\]/);
    assert.match(upload, /entitlements\.get\("application-identifier"\) == sys\.argv\[2\]/);
    assert.ok(upload.indexOf('Invalid distribution profile') < upload.indexOf('xcodebuild archive'));
    assert.match(upload, /PROFILE_NAME=\$\([^\n]+Print Name/);
    assert.match(upload, /json\.dumps\(sys\.argv\[1\]\)/);
  });

  it('waits for this exact TestFlight build to become valid without submitting or notifying', () => {
    const lane = read('fastlane/Fastfile');
    assert.match(lane, /build_version: ENV\.fetch\("BUILD_NUMBER"\)/);
    assert.match(lane, /app_version: ENV\.fetch\("MARKETING_VERSION"\)/);
    assert.match(lane, /timeout_duration: 1800/);
    assert.match(lane, /build\.processing_state == "VALID"/);
    assert.match(lane, /\["READY_FOR_BETA_TESTING", "IN_BETA_TESTING"\]/);
    assert.doesNotMatch(lane, /pilot\(|distribute\(|deliver\(/);
    const upload = read('scripts/ci-upload-testflight.sh');
    assert.ok(upload.indexOf('fastlane verify_testflight') > upload.indexOf('xcodebuild -exportArchive'));
  });

  it('blocks uploads before touching signing credentials when Apple backend is missing', () => {
    const directory = mkdtempSync(join(tmpdir(), 'trashed-apple-preflight-'));
    try {
      writeFileSync(join(directory, 'curl'), '#!/bin/sh\nexit 22\n', { mode: 0o755 });
      const result = spawnSync('bash', ['scripts/ci-upload-testflight.sh'], {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${directory}:${process.env.PATH}`,
          APP_STORE_CONNECT_KEY_ID: 'test',
          APP_STORE_CONNECT_ISSUER_ID: 'test',
          APP_STORE_CONNECT_API_KEY_P8: 'test',
          GOOGLE_IOS_CLIENT_ID: 'test.apps.googleusercontent.com',
          IOS_DISTRIBUTION_CERTIFICATE_BASE64: 'test',
          IOS_DISTRIBUTION_CERTIFICATE_PASSWORD: 'test',
          IOS_APPSTORE_PROFILE_BASE64: 'test',
        },
      });
      assert.equal(result.status, 3, result.stderr);
      assert.match(result.stderr, /Deploy the native Apple login backend/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
